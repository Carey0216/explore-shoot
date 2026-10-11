package cn.campus;

import static cn.campus.Json.*;

import jakarta.annotation.PreDestroy;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.springframework.stereotype.Service;

/**
 * Java schedules the existing local Python models; no Node business service or cloud credentials
 * are needed.
 */
@Service
public class AiService {
  private final Path root;

  interface WorkerLauncher {
    Process launch(String kind, List<String> command) throws IOException;
  }

  private final WorkerLauncher workerLauncher;
  private final ExecutorService io = Executors.newVirtualThreadPerTaskExecutor();
  private final ThreadPoolExecutor speech =
      new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new PriorityBlockingQueue<>());
  private final Map<String, CompletableFuture<byte[]>> pending = new HashMap<>();
  private final LinkedHashMap<String, byte[]> cache = new LinkedHashMap<>();
  private final Set<String> common = new HashSet<>();
  private final AtomicLong sequence = new AtomicLong();
  private final Semaphore translations = new Semaphore(2);
  private final Set<Process> children = ConcurrentHashMap.newKeySet();
  private Process voice;
  private BufferedReader voiceOutput;
  private Writer voiceInput;
  private volatile boolean closed;
  private volatile String warmState = "idle";
  private static final Map<String, Object> VOICE_DEFINITION = voiceDefinition();
  private static final List<Map<String, Object>> VOICES = rows(VOICE_DEFINITION.get("voices"));
  private static final List<String> PROMPTS =
      map(VOICE_DEFINITION.get("prompts")).values().stream().map(Json::str).toList();

  private static Map<String, Object> voiceDefinition() {
    try (var input = AiService.class.getResourceAsStream("/navigation-voices.json")) {
      return parse(
          new String(Objects.requireNonNull(input).readAllBytes(), StandardCharsets.UTF_8));
    } catch (IOException e) {
      throw new IllegalStateException("Voice definition is unavailable", e);
    }
  }

  @org.springframework.beans.factory.annotation.Autowired
  public AiService(StoreRepository store) {
    this(store.root, null, !"0".equals(System.getenv("EXPLORE_VOICE_WARMUP")));
  }

  AiService(Path projectRoot, WorkerLauncher workerLauncher, boolean autoWarmup) {
    root = projectRoot;
    this.workerLauncher = workerLauncher;
    for (Map<String, Object> v : VOICES)
      for (String text : PROMPTS) common.add(key(str(v.get("id")), text));
    if (autoWarmup) io.submit(this::warmup);
  }

  private Path python(String kind) {
    return root.resolve(kind.equals("voice") ? "tools/bin/voice-env" : "tools/bin/translation/env")
        .resolve(
            System.getProperty("os.name").startsWith("Windows")
                ? "Scripts/python.exe"
                : "bin/python");
  }

  private boolean installedVoice() {
    return Files.isRegularFile(python("voice"))
        && Files.isRegularFile(
            root.resolve("tools/bin/kokoro-int8-multi-lang-v1_1/model.int8.onnx"));
  }

  public boolean installedTranslation() {
    return Files.isRegularFile(python("translation"))
        && List.of("zh_en-1_9", "en_zh-1_9", "en_ja-1_1", "ja_en-1_1").stream()
            .allMatch(m -> Files.isDirectory(root.resolve("tools/bin/translation/" + m)));
  }

  private String key(String voice, String text) {
    return Security.digest(voice + ":" + text);
  }

  private Path cacheFile(String key) {
    return root.resolve("tools/bin/navigation-voice-cache/v1-kokoro-int8-zh/" + key + ".wav");
  }

  private boolean valid(byte[] wav) {
    return wav.length >= 44
        && wav.length <= 2 * 1024 * 1024
        && new String(wav, 0, 4, StandardCharsets.US_ASCII).equals("RIFF")
        && new String(wav, 8, 4, StandardCharsets.US_ASCII).equals("WAVE");
  }

  private synchronized void remember(String key, byte[] wav) {
    cache.remove(key);
    cache.put(key, wav);
    while (cache.size() > 80
        || cache.values().stream().mapToInt(a -> a.length).sum() > 20 * 1024 * 1024) {
      String first =
          cache.keySet().stream()
              .filter(k -> !common.contains(k))
              .findFirst()
              .orElse(cache.keySet().iterator().next());
      cache.remove(first);
    }
  }

  public synchronized Map<String, Object> options() {
    long ready = common.stream().filter(cache::containsKey).count();
    boolean installed = installedVoice();
    String note =
        !installed
            ? "本机语音尚未安装，请运行 tools/setup-voice.ps1。"
            : warmState.equals("ready")
                ? "常用导航提示已准备好，路线提示会提前准备。"
                : warmState.equals("warming")
                    ? "正在后台预热音色与常用提示，地图可正常使用。"
                    : "语音在服务器本机生成，无云端语音额度；新句子可能稍慢。";
    return obj(
        "available",
        installed,
        "provider",
        "Kokoro · 本机离线合成",
        "voices",
        VOICES.stream()
            .map(
                v -> {
                  Map<String, Object> r = copy(v);
                  r.remove("sid");
                  return r;
                })
            .toList(),
        "warmup",
        obj("state", warmState, "ready", ready, "total", common.size()),
        "note",
        note);
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

  private void ensureVoice() throws Exception {
    if (closed) throw new ApiException("语音服务已关闭", 503);
    if (voice != null && voice.isAlive()) return;
    if (!installedVoice()) throw new ApiException("本机音色尚未安装，请联系管理员运行安装脚本", 503);
    voice = launch("voice");
    voiceOutput =
        new BufferedReader(new InputStreamReader(voice.getInputStream(), StandardCharsets.UTF_8));
    voiceInput = new OutputStreamWriter(voice.getOutputStream(), StandardCharsets.UTF_8);
    String line = io.submit(() -> voiceOutput.readLine()).get(45, TimeUnit.SECONDS);
    if (!yes(parse(line).get("ready"))) throw new IOException("Voice is not ready");
  }

  private class SpeechTask implements Runnable, Comparable<SpeechTask> {
    final String id, text;
    final Map<String, Object> v;
    final CompletableFuture<byte[]> result;
    volatile boolean background;
    final long order = sequence.incrementAndGet();

    SpeechTask(
        String id,
        String text,
        Map<String, Object> v,
        CompletableFuture<byte[]> result,
        boolean background) {
      this.id = id;
      this.text = text;
      this.v = v;
      this.result = result;
      this.background = background;
    }

    public int compareTo(SpeechTask other) {
      int priority = Boolean.compare(background, other.background);
      return priority != 0 ? priority : Long.compare(order, other.order);
    }

    public void run() {
      try {
        ensureVoice();
        long request = sequence.incrementAndGet();
        voiceInput.write(write(obj("id", request, "sid", v.get("sid"), "text", text)) + "\n");
        voiceInput.flush();
        Map<String, Object> message =
            parse(io.submit(() -> voiceOutput.readLine()).get(45, TimeUnit.SECONDS));
        if (message.containsKey("error") || integer(message.get("id")) != request)
          throw new IOException("Invalid voice response");
        byte[] wav = Base64.getDecoder().decode(str(message.get("audio")));
        if (!valid(wav)) throw new IOException("Invalid audio");
        remember(id, wav);
        if (common.contains(id))
          try {
            Files.createDirectories(cacheFile(id).getParent());
            Files.write(cacheFile(id), wav);
          } catch (IOException ignored) {
          }
        result.complete(wav);
      } catch (Exception e) {
        if (voice != null) {
          voice.destroyForcibly();
          children.remove(voice);
        }
        voice = null;
        result.completeExceptionally(
            e instanceof ApiException ? e : new ApiException("语音生成失败，请重试", 503));
      } finally {
        synchronized (AiService.this) {
          pending.remove(id);
        }
      }
    }
  }

  public synchronized CompletableFuture<byte[]> synthesize(Map<String, Object> b) {
    Map<String, Object> v = find(VOICES, "id", b.get("voice"));
    String text = str(b.get("text"));
    if (v == null
        || text.trim().isEmpty()
        || text.length() > 120
        || text.matches("(?s).*[\\x00-\\x1f].*")) throw new ApiException("请选择有效音色，语音文字限 120 字");
    text = text.trim();
    String key = key(str(v.get("id")), text);
    if (closed) throw new ApiException("语音服务已关闭", 503);
    if (cache.containsKey(key)) return CompletableFuture.completedFuture(cache.get(key));
    if (pending.containsKey(key)) {
      if (!yes(b.get("prefetch")))
        for (Runnable r : new ArrayList<>(speech.getQueue()))
          if (r instanceof SpeechTask t && t.id.equals(key) && speech.getQueue().remove(t)) {
            t.background = false;
            speech.execute(t);
          }
      return pending.get(key);
    }
    if (pending.size() >= 6) throw new ApiException("语音正在生成，请稍后试听", 429);
    CompletableFuture<byte[]> result = new CompletableFuture<>();
    pending.put(key, result);
    speech.execute(new SpeechTask(key, text, v, result, yes(b.get("prefetch"))));
    return result;
  }

  void warmup() {
    if (!installedVoice()) {
      warmState = "unavailable";
      return;
    }
    warmState = "warming";
    try {
      for (String key : common)
        try {
          byte[] wav = Files.readAllBytes(cacheFile(key));
          if (valid(wav)) remember(key, wav);
        } catch (IOException ignored) {
        }
      for (Map<String, Object> v : VOICES)
        for (String text : PROMPTS) {
          if (closed) return;
          while (true)
            try {
              synthesize(obj("voice", v.get("id"), "text", text, "prefetch", true))
                  .get(100, TimeUnit.SECONDS);
              break;
            } catch (ApiException e) {
              if (e.status != 429) throw e;
              Thread.sleep(50);
            }
        } // A ready model matters even when all fixed audio came from disk.
      CompletableFuture<Void> preload = new CompletableFuture<>();
      CompletableFuture<byte[]> dummy = new CompletableFuture<>();
      SpeechTask load =
          new SpeechTask("", "", VOICES.getFirst(), dummy, true) {
            public void run() {
              try {
                ensureVoice();
                preload.complete(null);
              } catch (Exception e) {
                preload.completeExceptionally(e);
              }
            }
          };
      speech.execute(load);
      preload.get(50, TimeUnit.SECONDS);
      warmState = "ready";
    } catch (Exception e) {
      if (!closed) warmState = "degraded";
    }
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
    closed = true;
    warmState = "closed";
    for (Process p : children) p.destroyForcibly();
    children.clear();
    pending.values().forEach(f -> f.completeExceptionally(new CancellationException()));
    pending.clear();
    speech.shutdownNow();
    io.shutdownNow();
    cache.clear();
  }
}
