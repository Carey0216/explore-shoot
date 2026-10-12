package cn.campus.tools;

import static cn.campus.common.Json.*;

import cn.campus.common.Json;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.zip.*;

/** Historical builds always use exported tracked files and separate empty data directories. */
public final class HistoryTools {
  private final Path root;
  private final Git git;

  public HistoryTools(Path root) {
    this.root = root;
    git = new Git(root);
  }

  public List<Map<String, Object>> entries() throws Exception {
    List<Map<String, Object>> entries = new ArrayList<>();
    for (var entry :
        rows(
            Json.MAPPER.readValue(
                Files.readString(root.resolve("reference/releases.json")), Object.class))) {
      var copy = new LinkedHashMap<>(entry);
      copy.put("ref", "v" + entry.get("version"));
      entries.add(copy);
    }
    entries.addAll(
        rows(
            Json.MAPPER.readValue(
                Files.readString(root.resolve("reference/history.json")), Object.class)));
    return entries;
  }

  public Path exportSource(String ref) throws Exception {
    var entry =
        entries().stream()
            .filter(e -> eq(e.get("ref"), ref))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("未知历史标签"));
    String commit = git.run("rev-parse", "--verify", "refs/tags/" + ref + "^{commit}");
    if (!eq(commit, entry.get("commit"))) throw new IllegalStateException("标签与已记录源码不一致，停止导出");
    Path runs = root.resolve("history-runs");
    Files.createDirectories(runs);
    Path directory = Files.createTempDirectory(runs, ref.replace('/', '-') + "-"),
        zip = directory.resolveSibling(directory.getFileName() + ".zip");
    git.run("archive", "--format=zip", "--output=" + zip, commit);
    try (var input = new ZipInputStream(Files.newInputStream(zip))) {
      for (ZipEntry item; (item = input.getNextEntry()) != null; ) {
        Path target = directory.resolve(item.getName()).normalize();
        if (!target.startsWith(directory)) throw new IOException("归档路径无效");
        if (item.isDirectory()) Files.createDirectories(target);
        else {
          Files.createDirectories(target.getParent());
          Files.copy(input, target);
        }
      }
    }
    Files.delete(zip);
    if (Files.exists(directory.resolve("data")) || Files.exists(directory.resolve(".env")))
      throw new IOException("归档不应包含运行数据或本机配置");
    return directory;
  }

  private static void freePort(int port) throws IOException {
    try (var socket = new ServerSocket()) {
      socket.bind(new InetSocketAddress("127.0.0.1", port));
    }
  }

  private static void build(Path directory) throws Exception {
    if (!Files.exists(directory.resolve("backend/pom.xml"))) return;
    Process child =
        new ProcessBuilder(
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                directory.resolve("tools/build-backend.ps1").toString(),
                "-SkipTests")
            .directory(directory.toFile())
            .redirectOutput(directory.resolve("history-build.log").toFile())
            .redirectErrorStream(true)
            .start();
    if (!child.waitFor(300, TimeUnit.SECONDS)) {
      stop(child);
      throw new IOException("历史 Java 后端编译超时");
    }
    if (child.exitValue() != 0) throw new IOException("历史 Java 后端编译失败，请检查 history-build.log");
  }

  private static Process launch(Path directory, int port, int adminPort) throws Exception {
    build(directory);
    boolean java = Files.exists(directory.resolve("backend/pom.xml"));
    List<String> command =
        java
            ? List.of(
                Path.of(System.getProperty("java.home"), "bin", "java.exe").toString(),
                "-Dfile.encoding=UTF-8",
                "-jar",
                directory.resolve("backend/target/explore-shoot-backend.jar").toString())
            : List.of("node", directory.resolve("server.cjs").toString());
    var builder =
        new ProcessBuilder(command)
            .directory(directory.toFile())
            .redirectOutput(directory.resolve("history-run.log").toFile())
            .redirectErrorStream(true);
    builder
        .environment()
        .putAll(
            Map.of(
                "PORT",
                String.valueOf(port),
                "ADMIN_PORT",
                String.valueOf(adminPort),
                "EXPLORE_PROJECT_ROOT",
                directory.toString(),
                "EXPLORE_DATA_DIR",
                directory.resolve("data").toString(),
                "EXPLORE_VOICE_WARMUP",
                "0"));
    return builder.start();
  }

  private static void stop(Process child) {
    child.descendants().forEach(ProcessHandle::destroyForcibly);
    child.destroyForcibly();
    try {
      child.waitFor(10, TimeUnit.SECONDS);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  public void run(String[] args) throws Exception {
    if (args.length == 1 && args[0].equals("list")) {
      for (var e : entries())
        System.out.println(
            e.get("ref")
                + " · "
                + e.get("date")
                + " · "
                + e.get("title")
                + " · "
                + str(e.get("commit")).substring(0, 7));
      return;
    }
    if (args.length == 1 && args[0].equals("--check")) {
      check();
      return;
    }
    if (args.length != 2 || !Set.of("export", "run").contains(args[0]))
      throw new IllegalArgumentException("用法：history list | export <标签> | run <标签> | --check");
    if (args[0].equals("run")) {
      freePort(4274);
      freePort(4276);
    }
    Path directory = exportSource(args[1]);
    System.out.println("已导出 " + args[1] + " 源码：" + directory);
    if (args[0].equals("export")) return;
    Process child = launch(directory, 4274, 4276);
    Thread hook = new Thread(() -> stop(child));
    Runtime.getRuntime().addShutdownHook(hook);
    System.out.println(
        "用户端：http://127.0.0.1:4274\n管理端："
            + (args[1].equals("v1.0.0") ? "http://127.0.0.1:4274/admin" : "http://localhost:4276")
            + "\n使用独立空数据；初始密码遵循该版 README。输入 quit 后回车或 Ctrl+C 停止。");
    Thread input =
        Thread.ofVirtual()
            .start(
                () -> {
                  try (var reader = new BufferedReader(new InputStreamReader(System.in))) {
                    String line;
                    while ((line = reader.readLine()) != null)
                      if (line.trim().equalsIgnoreCase("quit")) {
                        stop(child);
                        return;
                      }
                  } catch (IOException ignored) {
                  }
                });
    try {
      int exit = child.waitFor();
      if (exit != 0 && exit != 1) throw new IOException("历史服务退出，请检查 history-run.log");
    } finally {
      stop(child);
      input.interrupt();
      Runtime.getRuntime().removeShutdownHook(hook);
    }
  }

  private void check() throws Exception {
    freePort(4284);
    freePort(4286);
    var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    int count = 0;
    for (var e : entries()) {
      Path directory = exportSource(str(e.get("ref")));
      String expected =
          eq(e.get("version"), "2.0.1")
              ? "2.0.0"
              : (e.get("version") == null ? "2.0.0" : str(e.get("version")));
      if (!expected.equals(
          str(parse(Files.readString(directory.resolve("package.json"))).get("version"))))
        throw new IOException("归档版本不匹配");
      Process child = launch(directory, 4284, 4286);
      try {
        Map<String, Object> health = null;
        long deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos();
        while (System.nanoTime() < deadline) {
          if (!child.isAlive()) throw new IOException("归档服务提前退出：" + e.get("ref"));
          try {
            var r =
                client.send(
                    HttpRequest.newBuilder(URI.create("http://127.0.0.1:4284/api/health"))
                        .timeout(Duration.ofSeconds(2))
                        .build(),
                    HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() == 200) {
              health = parse(r.body());
              break;
            }
          } catch (IOException ignored) {
          }
          Thread.sleep(150);
        }
        if (health == null) throw new IOException("归档启动超时：" + e.get("ref"));
        var homepage =
            client.send(
                HttpRequest.newBuilder(URI.create("http://127.0.0.1:4284/")).build(),
                HttpResponse.BodyHandlers.ofString());
        if (homepage.statusCode() != 200) throw new IOException("归档用户端不可用");
        boolean v1 = eq(e.get("version"), "1.0.0");
        var admin =
            client.send(
                HttpRequest.newBuilder(
                        URI.create(v1 ? "http://127.0.0.1:4284/admin" : "http://localhost:4286/"))
                    .build(),
                HttpResponse.BodyHandlers.ofString());
        if (admin.statusCode() != 200) throw new IOException("归档管理端不可用");
        System.out.println("PASS " + e.get("ref") + " · 独立数据启动、用户端与管理端");
        count++;
      } finally {
        stop(child);
      }
    }
    System.out.println("历史源码与独立启动核对通过：" + count + " 个固定标签");
  }
}
