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
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Service;

/** Local two-language inference. No content logs, shared text cache or external API. */
@Service
public final class LocalizationService {
  private final Path root;
  private final ThreadPoolExecutor work = new ThreadPoolExecutor(1, 1, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(8));
  private final ExecutorService io = Executors.newVirtualThreadPerTaskExecutor();
  private final Set<Process> children = ConcurrentHashMap.newKeySet();
  public LocalizationService(StoreRepository store) { root = store.root; }
  private Path python() {
    return root.resolve("tools/bin/localization/env").resolve(System.getProperty("os.name").startsWith("Windows") ? "Scripts/python.exe" : "bin/python");
  }
  public boolean available() {
    return Files.isRegularFile(python()) && List.of("zh_en-1_9", "en_zh-1_9").stream().allMatch(n -> Files.isDirectory(root.resolve("tools/bin/localization/" + n)));
  }
  public CompletableFuture<Map<String,Object>> translate(Map<String,Object> input) {
    if (!input.keySet().equals(Set.of("texts", "target"))
        || !(input.get("texts") instanceof List<?>)
        || list(input.get("texts")).isEmpty() || list(input.get("texts")).size() > 40
        || !Set.of("zh-CN", "en-US").contains(str(input.get("target")))
        || list(input.get("texts")).stream().anyMatch(t -> !(t instanceof String) || str(t).isBlank() || str(t).length() > 4000)
        || list(input.get("texts")).stream().mapToInt(t -> str(t).length()).sum() > 8000)
      throw new ApiException("翻译内容或目标语言无效");
    if (!available()) throw new ApiException("内容翻译暂时不可用，已保留原文", 503);
    var future = new CompletableFuture<Map<String,Object>>();
    var running = new AtomicReference<Process>();
    future.whenComplete((v,e) -> { if (future.isCancelled() && running.get() != null) running.get().destroyForcibly(); });
    try {
      work.execute(() -> {
        if (future.isCancelled()) return;
        Process child = null;
        try {
          var builder = new ProcessBuilder(python().toString(), "-u", root.resolve("tools/localization-worker.py").toString(), "--once").directory(root.toFile());
          builder.environment().put("PYTHONIOENCODING", "utf-8");
          builder.redirectError(ProcessBuilder.Redirect.DISCARD);
          child = builder.start(); children.add(child); running.set(child);
          if (future.isCancelled()) return;
          try(var out = child.getOutputStream()) { out.write(write(input).getBytes(StandardCharsets.UTF_8)); }
          Process process = child;
          var reader = io.submit(() -> process.getInputStream().readNBytes(200001));
          byte[] bytes;
          try { bytes = reader.get(65, TimeUnit.SECONDS); }
          finally { reader.cancel(true); }
          if(bytes.length > 200000) throw new IOException("Output exceeds limit");
          var result = parse(new String(bytes, StandardCharsets.UTF_8));
          var translated = list(result.get("texts"));
          if(translated.size() != list(input.get("texts")).size() || translated.stream().anyMatch(t -> !(t instanceof String) || str(t).length() > 12000)) throw new IOException("Invalid result");
          future.complete(obj("texts", translated, "target", input.get("target"), "machineTranslated", true));
        } catch(Exception e) { future.completeExceptionally(new ApiException("内容翻译暂时不可用，已保留原文",503)); }
        finally { if(child != null) { children.remove(child); child.destroyForcibly(); } }
      });
    } catch(RejectedExecutionException e) { throw new ApiException("翻译正在处理，请稍后再试",429); }
    return future;
  }
  @PreDestroy public void close() {
    work.shutdownNow(); io.shutdownNow(); children.forEach(Process::destroyForcibly);
  }
}
