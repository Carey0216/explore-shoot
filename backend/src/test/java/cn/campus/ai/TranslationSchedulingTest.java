package cn.campus.ai;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.common.ApiException;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class TranslationSchedulingTest {
  @TempDir Path root;

  static class Worker extends Process {
    final ByteArrayOutputStream input = new ByteArrayOutputStream();
    final CompletableFuture<byte[]> output = new CompletableFuture<>();
    volatile boolean alive = true;
    final InputStream reader =
        new InputStream() {
          ByteArrayInputStream stream;

          public int read() throws IOException {
            if (stream == null)
              try {
                stream = new ByteArrayInputStream(output.get());
              } catch (Exception e) {
                throw new IOException(e);
              }
            return stream.read();
          }
        };

    void finish(Object result) {
      output.complete(write(result).getBytes(StandardCharsets.UTF_8));
    }

    public OutputStream getOutputStream() {
      return input;
    }

    public InputStream getInputStream() {
      return reader;
    }

    public InputStream getErrorStream() {
      return InputStream.nullInputStream();
    }

    public int waitFor() {
      return 0;
    }

    public int exitValue() {
      return 0;
    }

    public boolean isAlive() {
      return alive;
    }

    public void destroy() {
      alive = false;
      output.complete(new byte[0]);
    }

    public Process destroyForcibly() {
      destroy();
      return this;
    }
  }

  private void installed() throws Exception {
    Path python =
        root.resolve(
            "tools/bin/translation/env/"
                + (System.getProperty("os.name").startsWith("Windows")
                    ? "Scripts/python.exe"
                    : "bin/python"));
    Files.createDirectories(python.getParent());
    Files.write(python, new byte[0]);
    for (String directory : List.of("zh_en-1_9", "en_zh-1_9", "en_ja-1_1", "ja_en-1_1"))
      Files.createDirectories(root.resolve("tools/bin/translation/" + directory));
  }

  @Test
  void translationHasNoServerCacheReleasesWorkersAndValidatesEveryBatch() throws Exception {
    installed();
    List<Worker> workers = new ArrayList<>();
    AiService service =
        new AiService(
            root,
            (kind, command) -> {
              assertEquals("translation", kind);
              assertTrue(command.contains("--once"));
              Worker worker = new Worker();
              worker.finish(obj("texts", List.of("Place", "Description")));
              workers.add(worker);
              return worker;
            },
            false);
    try {
      var definition =
          parse(Files.readString(Path.of("src/main/resources/navigation-voices.json")));
      assertEquals(6, rows(definition.get("voices")).size());
      assertEquals(
          3,
          rows(definition.get("voices")).stream().filter(v -> eq(v.get("gender"), "男声")).count());
      assertEquals(
          3,
          rows(definition.get("voices")).stream().filter(v -> eq(v.get("gender"), "女声")).count());
      assertEquals(
          6, rows(definition.get("voices")).stream().map(v -> v.get("sid")).distinct().count());
      var content = List.of("点位名", "介绍");
      assertEquals(
          List.of("Place", "Description"),
          service
              .translate(content, "en", new AtomicReference<>(), new AtomicBoolean())
              .get("texts"));
      service.translate(content, "en", new AtomicReference<>(), new AtomicBoolean());
      assertEquals(2, workers.size());
      assertTrue(workers.stream().noneMatch(Worker::isAlive));
      assertEquals(
          obj("texts", content, "target", "en"),
          parse(workers.getFirst().input.toString(StandardCharsets.UTF_8)));
      for (Object invalid :
          List.of(
              List.of(),
              List.of(""),
              List.of(1),
              Collections.nCopies(41, "x"),
              List.of("x".repeat(4001)),
              Collections.nCopies(3, "x".repeat(3000))))
        assertThrows(
            ApiException.class,
            () -> service.translate(invalid, "en", new AtomicReference<>(), new AtomicBoolean()));
      assertThrows(
          ApiException.class,
          () -> service.translate("x", "invalid", new AtomicReference<>(), new AtomicBoolean()));
      for (var input :
          List.of(
              obj("voice", "../secret", "text", "测试"),
              obj("voice", "he", "text", ""),
              obj("voice", "he", "text", "x".repeat(121)),
              obj("voice", "he", "text", "bad\ntext")))
        assertThrows(ApiException.class, () -> service.synthesize(input));
    } finally {
      service.close();
    }
    assertThrows(
        ApiException.class,
        () -> service.translate("x", "en", new AtomicReference<>(), new AtomicBoolean()));
    AiService malformed =
        new AiService(
            root,
            (kind, command) -> {
              Worker worker = new Worker();
              worker.finish(obj("texts", List.of("one")));
              return worker;
            },
            false);
    try {
      assertThrows(
          ApiException.class,
          () ->
              malformed.translate(
                  List.of("一", "二"), "en", new AtomicReference<>(), new AtomicBoolean()));
    } finally {
      malformed.close();
    }
  }

  @Test
  void onlyTwoWorkersRunAndCancellationReleasesTheSlot() throws Exception {
    installed();
    BlockingQueue<Worker> launched = new LinkedBlockingQueue<>();
    AiService service =
        new AiService(
            root,
            (kind, command) -> {
              Worker worker = new Worker();
              launched.add(worker);
              return worker;
            },
            false);
    try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
      AtomicReference<Process> process = new AtomicReference<>();
      AtomicBoolean cancelled = new AtomicBoolean();
      var first = pool.submit(() -> service.translate("第一条", "en", process, cancelled));
      Worker one = launched.poll(3, TimeUnit.SECONDS);
      assertNotNull(one);
      var second =
          pool.submit(
              () -> service.translate("第二条", "en", new AtomicReference<>(), new AtomicBoolean()));
      Worker two = launched.poll(3, TimeUnit.SECONDS);
      assertNotNull(two);
      assertEquals(
          429,
          assertThrows(
                  ApiException.class,
                  () ->
                      service.translate("第三条", "en", new AtomicReference<>(), new AtomicBoolean()))
              .status);
      cancelled.set(true);
      one.destroyForcibly();
      assertInstanceOf(
          CancellationException.class,
          assertThrows(ExecutionException.class, () -> first.get(3, TimeUnit.SECONDS)).getCause());
      assertNull(process.get());
      two.finish(obj("text", "Two"));
      assertEquals("Two", second.get(3, TimeUnit.SECONDS).get("text"));
      assertFalse(two.isAlive());
      var again =
          pool.submit(
              () -> service.translate("再次翻译", "en", new AtomicReference<>(), new AtomicBoolean()));
      Worker three = launched.poll(3, TimeUnit.SECONDS);
      assertNotNull(three);
      three.finish(obj("text", "Again"));
      assertEquals("Again", again.get(3, TimeUnit.SECONDS).get("text"));
    } finally {
      service.close();
    }
  }
}
