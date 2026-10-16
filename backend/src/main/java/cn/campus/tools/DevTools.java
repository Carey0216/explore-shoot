package cn.campus.tools;

import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

/** Java owns the development process; Node is used only for frontend checks. */
public final class DevTools {
  private static void stop(Process process) {
    process.descendants().forEach(ProcessHandle::destroyForcibly);
    process.destroyForcibly();
  }

  public static void run(Path root, String[] args) throws Exception {
    if (args.length != 0) throw new IllegalArgumentException("用法：dev");
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
    try {
      System.out.println("开发模式：Java 后端运行中；修改 HTML / CSS / JavaScript 后刷新页面生效。");
      child.waitFor();
    } finally {
      stop(child);
      Runtime.getRuntime().removeShutdownHook(hook);
    }
  }
}
