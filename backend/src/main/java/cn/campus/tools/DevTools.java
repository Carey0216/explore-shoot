package cn.campus.tools;

import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Java owns the development process; Node is used only to parse frontend JavaScript for i18n. */
public final class DevTools {
  private static void generate(Path root) throws Exception {
    I18nGenerator.run(root, new String[0]);
  }

  private static void stop(Process process) {
    process.descendants().forEach(ProcessHandle::destroyForcibly);
    process.destroyForcibly();
  }

  public static void run(Path root, String[] args) throws Exception {
    if (args.length != 0) throw new IllegalArgumentException("用法：dev");
    generate(root);
    byte[] bytes = Files.readAllBytes(root.resolve("backend/target/explore-shoot-backend.jar"));
    String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    Path runtime = root.resolve("tools/bin/backend-runtime/" + hash + ".jar");
    Files.createDirectories(runtime.getParent());
    if (!Files.exists(runtime)) Files.write(runtime, bytes, StandardOpenOption.CREATE_NEW);
    var builder =
        new ProcessBuilder(
                Path.of(System.getProperty("java.home"), "bin", "java.exe").toString(),
                "-Dfile.encoding=UTF-8",
                "-Dexplore.build.hash=" + hash,
                "-jar",
                runtime.toString())
            .directory(root.toFile())
            .inheritIO();
    builder.environment().put("EXPLORE_PROJECT_ROOT", root.toString());
    builder.environment().put("EXPLORE_PARENT_PID", Long.toString(ProcessHandle.current().pid()));
    var child = builder.start();
    Thread hook = new Thread(() -> stop(child));
    Runtime.getRuntime().addShutdownHook(hook);
    try (var watcher = FileSystems.getDefault().newWatchService()) {
      Map<WatchKey, Path> directories = new HashMap<>();
      try (var paths = Files.walk(root.resolve("dist"))) {
        for (var directory : paths.filter(Files::isDirectory).toList())
          directories.put(
              directory.register(
                  watcher,
                  StandardWatchEventKinds.ENTRY_CREATE,
                  StandardWatchEventKinds.ENTRY_MODIFY),
              directory);
      }
      long changed = 0;
      System.out.println("开发模式：Java 后端运行中；修改界面文案后自动生成译文，浏览器刷新生效。");
      while (child.isAlive()) {
        var key = watcher.poll(300, TimeUnit.MILLISECONDS);
        if (key != null) {
          Path directory = directories.get(key);
          for (var event : key.pollEvents()) {
            if (event.kind() == StandardWatchEventKinds.OVERFLOW) {
              changed = System.nanoTime();
              continue;
            }
            Path file = directory.resolve((Path) event.context());
            if (Files.isDirectory(file)) {
              directories.put(
                  file.register(
                      watcher,
                      StandardWatchEventKinds.ENTRY_CREATE,
                      StandardWatchEventKinds.ENTRY_MODIFY),
                  file);
              continue;
            }
            String name = file.getFileName().toString();
            if (name.matches(".*\\.(js|html)") && !name.startsWith("messages-generated"))
              changed = System.nanoTime();
          }
          key.reset();
        }
        if (changed != 0 && System.nanoTime() - changed > TimeUnit.MILLISECONDS.toNanos(600)) {
          changed = 0;
          try {
            generate(root);
          } catch (Exception e) {
            System.err.println(e.getMessage());
          }
        }
      }
    } finally {
      stop(child);
      Runtime.getRuntime().removeShutdownHook(hook);
    }
  }
}
