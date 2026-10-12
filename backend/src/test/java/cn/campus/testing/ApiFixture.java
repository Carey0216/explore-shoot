package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.common.Json;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Launch the real Java HTTP application against temporary data, never the user's live store. */
final class ApiFixture implements AutoCloseable {
  static final String PASSWORD = "JavaFixture2026!";
  final Path directory, root, clock;
  final int userPort, adminPort;
  Process child;
  int checks;
  long offset;

  ApiFixture(Path directory) throws Exception {
    this.directory = directory;
    root = Path.of("..").toAbsolutePath().normalize();
    clock = directory.resolve("clock-offset");
    Files.createDirectories(directory);
    Files.writeString(clock, "0");
    try (var user = new java.net.ServerSocket(0, 1, InetAddress.getLoopbackAddress());
        var admin = new java.net.ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
      userPort = user.getLocalPort();
      adminPort = admin.getLocalPort();
    }
    start();
  }

  void start() throws Exception {
    String classpath =
        System.getProperty("surefire.test.class.path", System.getProperty("java.class.path"));
    Path args = directory.resolve("java-arguments");
    Files.writeString(
        args,
        "-Dfile.encoding=UTF-8\n-classpath\n\""
            + classpath.replace("\\", "\\\\").replace("\"", "\\\"")
            + "\"\ncn.campus.ExploreApplication\n");
    Path log = directory.resolve("server.log");
    var builder =
        new ProcessBuilder(
                Path.of(System.getProperty("java.home"), "bin", "java.exe").toString(), "@" + args)
            .directory(root.toFile())
            .redirectOutput(log.toFile())
            .redirectErrorStream(true);
    builder
        .environment()
        .putAll(
            Map.of(
                "PORT",
                String.valueOf(userPort),
                "ADMIN_PORT",
                String.valueOf(adminPort),
                "EXPLORE_PROJECT_ROOT",
                root.toString(),
                "EXPLORE_DATA_DIR",
                directory.resolve("data").toString(),
                "ADMIN_PASSWORD",
                PASSWORD,
                "EXPLORE_VOICE_WARMUP",
                "0",
                "EXPLORE_TEST_MODE",
                "1",
                "EXPLORE_TEST_CLOCK",
                clock.toString()));
    child = builder.start();
    var client = HttpClient.newHttpClient();
    long end = System.nanoTime() + Duration.ofSeconds(25).toNanos();
    while (System.nanoTime() < end) {
      if (!child.isAlive()) throw new AssertionError(Files.readString(log));
      try {
        var res =
            client.send(
                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + adminPort + "/api/health"))
                    .timeout(Duration.ofSeconds(1))
                    .build(),
                HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() == 200) return;
      } catch (java.io.IOException ignored) {
      }
      Thread.sleep(100);
    }
    close();
    throw new AssertionError("Java API startup timed out: " + Files.readString(log));
  }

  void advance(long millis) throws Exception {
    offset += millis;
    Files.writeString(clock, Long.toString(offset));
  }

  Client user() {
    return new Client(userPort);
  }

  Client admin() {
    return new Client(adminPort);
  }

  Map<String, Object> data() throws Exception {
    return parse(Files.readString(directory.resolve("data/store-v2.json")));
  }

  void restart() throws Exception {
    close();
    start();
  }

  public void close() {
    if (child != null) {
      child.descendants().forEach(ProcessHandle::destroyForcibly);
      child.destroyForcibly();
      try {
        child.waitFor(10, TimeUnit.SECONDS);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
    }
  }

  final class Client {
    final int port;
    String cookie = "";
    final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

    Client(int port) {
      this.port = port;
    }

    Object request(String path, String method, Object body, int status) throws Exception {
      return request(path, method, body, status, Map.of());
    }

    Object request(String path, String method, Object body, int status, Map<String, String> headers)
        throws Exception {
      var builder =
          HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
              .timeout(Duration.ofSeconds(10))
              .header("Cookie", cookie)
              .method(
                  method,
                  body == null
                      ? HttpRequest.BodyPublishers.noBody()
                      : HttpRequest.BodyPublishers.ofString(write(body)));
      if (body != null) builder.header("Content-Type", "application/json");
      headers.forEach(builder::header);
      var res = http.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
      assertEquals(
          status,
          res.statusCode(),
          method + " " + path + ": " + new String(res.body(), StandardCharsets.UTF_8));
      checks++;
      for (String value : res.headers().allValues("set-cookie")) {
        assertTrue(value.contains("HttpOnly"));
        assertTrue(value.contains("SameSite=Strict"));
        assertFalse(value.contains("Domain="));
        cookie = value.split(";")[0];
      }
      String type = res.headers().firstValue("content-type").orElse("");
      if (type.contains("json")) return Json.MAPPER.readValue(res.body(), Object.class);
      return type.contains("text") || type.contains("javascript")
          ? new String(res.body(), StandardCharsets.UTF_8)
          : res.body();
    }

    Map<String, Object> get(String path) throws Exception {
      return map(request(path, "GET", null, 200));
    }

    Map<String, Object> send(String path, String method, Object body, int status) throws Exception {
      return map(request(path, method, body, status));
    }

    Map<String, Object> register(String name, String invite) throws Exception {
      return map(
          send(
                  "/api/auth/register",
                  "POST",
                  obj(
                      "username",
                      name,
                      "nickname",
                      name,
                      "password",
                      PASSWORD,
                      "inviteCode",
                      invite),
                  201)
              .get("account"));
    }

    Map<String, Object> login(String name) throws Exception {
      return map(
          send("/api/auth/login", "POST", obj("username", name, "password", PASSWORD), 200)
              .get("account"));
    }

    List<Map<String, Object>> list(String path) throws Exception {
      return rows(request(path, "GET", null, 200));
    }
  }
}
