package cn.campus.ai;

import static cn.campus.common.Json.*;

import jakarta.annotation.PreDestroy;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.springframework.stereotype.Service;

/** AI 对外入口：协调导航语音；算法推理交给语音模型工作者。 */
@Service
public class AiService {
  interface WorkerLauncher {
    Process launch(String kind, List<String> command) throws IOException;
  }

  private final VoiceService voice;

  @org.springframework.beans.factory.annotation.Autowired
  public AiService(VoiceService voice) {
    this.voice = voice;
  }

  AiService(Path root, WorkerLauncher launcher, boolean autoWarmup) {
    this.voice = new VoiceService(root, launcher, autoWarmup);
  }

  public Map<String, Object> options() {
    return voice.options();
  }

  public CompletableFuture<byte[]> synthesize(Map<String, Object> input) {
    return voice.synthesize(input);
  }

  void warmup() {
    voice.warmup();
  }

  @PreDestroy
  public void close() {
    voice.close();
  }
}
