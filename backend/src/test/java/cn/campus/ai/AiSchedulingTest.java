package cn.campus.ai;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.common.ApiException;
import cn.campus.common.Json;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class AiSchedulingTest {
  @TempDir Path root;

  private void installed() throws Exception {
    Path
        python =
            root.resolve(
                "tools/bin/voice-env/"
                    + (System.getProperty("os.name").startsWith("Windows")
                        ? "Scripts/python.exe"
                        : "bin/python")),
        model = root.resolve("tools/bin/kokoro-int8-multi-lang-v1_1/model.int8.onnx");
    Files.createDirectories(python.getParent());
    Files.write(python, new byte[0]);
    Files.createDirectories(model.getParent());
    Files.write(model, new byte[0]);
  }

  static class Worker extends Process {
    final BlockingQueue<Integer> bytes = new LinkedBlockingQueue<>();
    final InputStream output =
        new InputStream() {
          public int read() throws IOException {
            try {
              return bytes.take();
            } catch (InterruptedException e) {
              Thread.currentThread().interrupt();
              throw new IOException(e);
            }
          }

          public int read(byte[] data, int offset, int length) throws IOException {
            if (length == 0) return 0;
            int first = read();
            if (first < 0) return -1;
            data[offset] = (byte) first;
            int count = 1;
            while (count < length) {
              Integer next = bytes.poll();
              if (next == null) break;
              if (next < 0) {
                bytes.offer(-1);
                break;
              }
              data[offset + count++] = (byte) (int) next;
            }
            return count;
          }
        };
    final OutputStream pipe =
        new OutputStream() {
          public void write(int value) {
            bytes.add(value);
          }
        };
    final List<String> generated = Collections.synchronizedList(new ArrayList<>());
    final CountDownLatch first = new CountDownLatch(1), release = new CountDownLatch(1);
    final boolean hold;
    volatile boolean alive = true;

    Worker(boolean hold) throws Exception {
      this.hold = hold;
      pipe.write("{\"ready\":true}\n".getBytes(StandardCharsets.UTF_8));
    }

    public OutputStream getOutputStream() {
      return new OutputStream() {
        final ByteArrayOutputStream line = new ByteArrayOutputStream();

        public void write(int value) throws IOException {
          if (value != 10) {
            line.write(value);
            return;
          }
          Map<String, Object> job = parse(line.toString(StandardCharsets.UTF_8));
          line.reset();
          String text = str(job.get("text"));
          generated.add(text);
          first.countDown();
          if (hold && generated.size() == 1)
            try {
              release.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
              Thread.currentThread().interrupt();
            }
          byte[] wav = new byte[44];
          System.arraycopy("RIFF".getBytes(), 0, wav, 0, 4);
          System.arraycopy("WAVE".getBytes(), 0, wav, 8, 4);
          pipe.write(
              (Json.write(
                          obj(
                              "id",
                              job.get("id"),
                              "audio",
                              Base64.getEncoder().encodeToString(wav)))
                      + "\n")
                  .getBytes(StandardCharsets.UTF_8));
          pipe.flush();
        }
      };
    }

    public InputStream getInputStream() {
      return output;
    }

    public InputStream getErrorStream() {
      return InputStream.nullInputStream();
    }

    public int waitFor() {
      return 0;
    }

    public int exitValue() {
      if (alive) throw new IllegalThreadStateException();
      return 0;
    }

    public boolean isAlive() {
      return alive;
    }

    public void destroy() {
      alive = false;
      release.countDown();
      bytes.offer(-1);
      try {
        pipe.close();
        output.close();
      } catch (Exception ignored) {
      }
    }

    public Process destroyForcibly() {
      destroy();
      return this;
    }
  }

  @Test
  void allFixedVoicesPersistAndRestartUsesAudioCache() throws Exception {
    installed();
    Worker first = new Worker(false);
    try (AutoCloseable ignored = first::destroy) {
      AiService a = new AiService(root, (kind, command) -> first, false);
      try {
        a.warmup();
        assertEquals("ready", map(a.options().get("warmup")).get("state"));
        assertEquals(36, first.generated.size());
        a.synthesize(obj("voice", "he", "text", "私人动态提示")).get(3, TimeUnit.SECONDS);
        assertEquals(37, first.generated.size());
        try (var files =
            Files.list(root.resolve("tools/bin/navigation-voice-cache/v1-kokoro-int8-zh"))) {
          assertEquals(36, files.count());
        }
      } finally {
        a.close();
      }
    }
    Worker second = new Worker(false);
    AiService b = new AiService(root, (kind, command) -> second, false);
    try {
      b.warmup();
      assertEquals("ready", map(b.options().get("warmup")).get("state"));
      assertEquals(0, second.generated.size());
      assertTrue(second.isAlive(), "Model is eagerly ready even when all phrases came from disk.");
    } finally {
      b.close();
    }
    assertFalse(second.isAlive());
  }

  @Test
  void realPromptTakesPriorityAndPendingRequestsDeduplicate() throws Exception {
    installed();
    Worker worker = new Worker(true);
    AiService a = new AiService(root, (kind, command) -> worker, false);
    try {
      CompletableFuture<byte[]> first =
          a.synthesize(obj("voice", "he", "text", "第一条预热", "prefetch", true));
      assertTrue(worker.first.await(3, TimeUnit.SECONDS));
      CompletableFuture<byte[]> background =
          a.synthesize(obj("voice", "he", "text", "第二条预热", "prefetch", true));
      CompletableFuture<byte[]> live = a.synthesize(obj("voice", "he", "text", "现在需要播放"));
      assertSame(live, a.synthesize(obj("voice", "he", "text", "现在需要播放")));
      worker.release.countDown();
      CompletableFuture.allOf(first, background, live).get(5, TimeUnit.SECONDS);
      assertEquals(List.of("第一条预热", "现在需要播放", "第二条预热"), worker.generated);
      assertThrows(ApiException.class, () -> a.synthesize(obj("voice", "he", "text", "坏\n字符")));
    } finally {
      a.close();
    }
  }

  @Test
  void absentModelsFailClearlyWithoutChangingBusinessFiles() throws Exception {
    AiService a =
        new AiService(
            root,
            (kind, command) -> {
              throw new AssertionError("No worker should start");
            },
            false);
    try {
      a.warmup();
      assertEquals("unavailable", map(a.options().get("warmup")).get("state"));
      ExecutionException failure =
          assertThrows(
              ExecutionException.class,
              () -> a.synthesize(obj("voice", "he", "text", "测试")).get(3, TimeUnit.SECONDS));
      assertEquals(503, ((ApiException) failure.getCause()).status);
    } finally {
      a.close();
    }
  }
}
