package cn.campus.ai;

import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.storage.StoreRepository;
import jakarta.annotation.PreDestroy;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.springframework.stereotype.Service;

/** 内容翻译：输入边界、两路并发、一次性模型进程；不保存译文缓存。 */
@Service
public class TranslationService {
  private final Path root;
  private final AiService.WorkerLauncher workerLauncher;
  private final ExecutorService io = Executors.newVirtualThreadPerTaskExecutor();
  private final Semaphore translations = new Semaphore(2);
  private final Set<Process> children = ConcurrentHashMap.newKeySet();
  private volatile boolean closed;

  @org.springframework.beans.factory.annotation.Autowired
  public TranslationService(StoreRepository store) {
    this(store.root, null);
  }

  TranslationService(Path root, AiService.WorkerLauncher launcher) {
    this.root = root;
    this.workerLauncher = launcher;
  }

  private Path python(String kind) {
    return root.resolve(kind.equals("voice") ? "tools/bin/voice-env" : "tools/bin/translation/env")
        .resolve(
            System.getProperty("os.name").startsWith("Windows")
                ? "Scripts/python.exe"
                : "bin/python");
  }

  public boolean installedTranslation() {
    return Files.isRegularFile(python("translation"))
        && List.of("zh_en-1_9", "en_zh-1_9", "en_ja-1_1", "ja_en-1_1").stream()
            .allMatch(m -> Files.isDirectory(root.resolve("tools/bin/translation/" + m)));
  }

  private Process launch(String kind, String... args) throws IOException {
    List<String> command =
        new ArrayList<>(
            List.of(
                python(kind).toString(),
                "-u",
                root.resolve("tools/" + kind + "-worker.py").toString()));
    command.addAll(Arrays.asList(args));
    ProcessBuilder builder = new ProcessBuilder(command).directory(root.toFile());
    builder.environment().put("PYTHONIOENCODING", "utf-8");
    builder.redirectError(ProcessBuilder.Redirect.DISCARD);
    Process p = workerLauncher == null ? builder.start() : workerLauncher.launch(kind, command);
    children.add(p);
    return p;
  }

  public Map<String, Object> translate(
      Object content, String target, AtomicReference<Process> process, AtomicBoolean cancelled)
      throws Exception {
    boolean batch = content instanceof List;
    List<Object> items = batch ? list(content) : Collections.singletonList(content);
    if (items.isEmpty()
        || items.size() > 40
        || items.stream()
            .anyMatch(
                t -> !(t instanceof String) || str(t).trim().isEmpty() || str(t).length() > 4000)
        || items.stream().mapToInt(t -> str(t).length()).sum() > 8000
        || !List.of("zh-CN", "zh-TW", "ja", "en").contains(target))
      throw new ApiException("翻译内容或目标语言无效");
    if (!installedTranslation()) throw new ApiException("本机翻译尚未安装，请联系管理员", 503);
    if (closed) throw new ApiException("翻译服务已关闭", 503);
    if (!translations.tryAcquire()) throw new ApiException("翻译正在进行，请稍后再试", 429);
    Process child = null;
    try {
      if (cancelled.get()) throw new CancellationException();
      child = launch("translation", "--once");
      process.set(child);
      if (cancelled.get()) throw new CancellationException();
      try (Writer writer =
          new OutputStreamWriter(child.getOutputStream(), StandardCharsets.UTF_8)) {
        writer.write(write(obj(batch ? "texts" : "text", content, "target", target)));
      }
      Process running = child;
      Future<String> read =
          io.submit(
              () -> {
                byte[] output = running.getInputStream().readNBytes(100001);
                if (output.length > 100000) throw new IOException("Translation output too large");
                return new String(output, StandardCharsets.UTF_8);
              });
      String output;
      try {
        output = read.get(60, TimeUnit.SECONDS);
      } catch (TimeoutException e) {
        throw new ApiException("翻译超时，请重试", 504);
      }
      if (cancelled.get()) throw new CancellationException();
      Map<String, Object> result = parse(output);
      if (result.containsKey("error")
          || batch
              && (!(result.get("texts") instanceof List)
                  || list(result.get("texts")).size() != items.size()
                  || list(result.get("texts")).stream().anyMatch(t -> !(t instanceof String)))
          || !batch && !(result.get("text") instanceof String))
        throw new ApiException("翻译生成失败，请重试", 503);
      result.putAll(obj("target", target, "provider", "本机离线翻译"));
      return result;
    } finally {
      if (child != null) {
        child.destroyForcibly();
        children.remove(child);
      }
      process.set(null);
      translations.release();
    }
  }

  @PreDestroy
  public synchronized void close() {
    if (closed) return;
    closed = true;
    children.forEach(Process::destroyForcibly);
    children.clear();
    io.shutdownNow();
  }
}
