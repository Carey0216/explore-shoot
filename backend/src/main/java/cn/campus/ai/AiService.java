package cn.campus.ai;

import static cn.campus.common.Json.*;

import jakarta.annotation.PreDestroy;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.springframework.stereotype.Service;

/** AI 对外入口：只协调语音与翻译；算法推理交给各自模型工作者。 */
@Service
public class AiService {
  interface WorkerLauncher {
    Process launch(String kind, List<String> command) throws IOException;
  }

  private final VoiceService voice;
  private final TranslationService translation;

  @org.springframework.beans.factory.annotation.Autowired
  public AiService(VoiceService voice, TranslationService translation) {
    this.voice = voice;
    this.translation = translation;
  }

  AiService(Path root, WorkerLauncher launcher, boolean autoWarmup) {
    this.voice = new VoiceService(root, launcher, autoWarmup);
    this.translation = new TranslationService(root, launcher);
  }

  public Map<String, Object> options() {
    return voice.options();
  }

  public CompletableFuture<byte[]> synthesize(Map<String, Object> input) {
    return voice.synthesize(input);
  }

  public boolean installedTranslation() {
    return translation.installedTranslation();
  }

  public Map<String, Object> translate(
      Object input, String target, AtomicReference<Process> process, AtomicBoolean cancelled)
      throws Exception {
    return translation.translate(input, target, process, cancelled);
  }

  void warmup() {
    voice.warmup();
  }

  @PreDestroy
  public void close() {
    voice.close();
    translation.close();
  }
}
