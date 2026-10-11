package cn.campus.tools;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Process arguments are passed separately; no shell interpolation or credential logging. */
public final class Git {
  private final Path root;

  public Git(Path root) {
    this.root = root;
  }

  public String run(String... arguments) throws Exception {
    return runWithInput(null, arguments);
  }

  public String runWithInput(String input, String... arguments) throws Exception {
    List<String> command =
        new ArrayList<>(
            List.of(
                "git",
                "-c",
                "safe.directory=" + root.toString().replace('\\', '/'),
                "-c",
                "http.sslBackend=openssl",
                "-c",
                "core.autocrlf=false"));
    command.addAll(Arrays.asList(arguments));
    ProcessBuilder builder = new ProcessBuilder(command).directory(root.toFile());
    builder.environment().put("GIT_TERMINAL_PROMPT", "0");
    builder.environment().put("GCM_INTERACTIVE", "never");
    Process process = builder.start();
    try (var writer = process.getOutputStream()) {
      if (input != null) writer.write(input.getBytes(StandardCharsets.UTF_8));
    }
    try (var executor = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
      var output = executor.submit(() -> process.getInputStream().readAllBytes());
      var errors = executor.submit(() -> process.getErrorStream().readAllBytes());
      if (!process.waitFor(120, TimeUnit.SECONDS)) {
        process.descendants().forEach(ProcessHandle::destroyForcibly);
        process.destroyForcibly();
        throw new IOException("Git 操作超时");
      }
      byte[] bytes = output.get();
      errors.get();
      if (process.exitValue() != 0) throw new IOException("Git 操作失败：" + arguments[0]);
      return new String(bytes, StandardCharsets.UTF_8).trim();
    }
  }
}
