package cn.campus.tools;

import static cn.campus.common.Json.*;

import cn.campus.settings.RuntimeEnvironment;
import java.nio.channels.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;

/** Offline tools can reset only an explicitly owned local development/test sandbox. */
public final class EnvironmentTools {
  public static Path directory(Path root, String name) throws Exception {
    if (!Set.of("development", "test").contains(name))
      throw new IllegalArgumentException("仅支持本机development / test");
    Path base = root.toRealPath().resolve(".environments"),
        target = base.resolve(name).resolve("data").normalize();
    for (Path p = target; p != null && p.startsWith(root.toRealPath()); p = p.getParent())
      if (Files.isSymbolicLink(p)) throw new IllegalStateException("环境目录不能包含符号链接");
    if (!target.startsWith(base) || target.equals(root.resolve("data")))
      throw new IllegalStateException("非法环境目录");
    return target;
  }

  public static void reset(Path root, String name, String confirmation) throws Exception {
    Path data = directory(root, name), marker = data.resolve(".environment.json");
    if (!Files.isRegularFile(marker)) throw new IllegalStateException("环境未初始化");
    var identity = parse(Files.readString(marker));
    if (!eq(identity.get("name"), name) || !eq(identity.get("instanceId"), confirmation))
      throw new IllegalStateException("重置确认标识不匹配");
    var paths = new ArrayList<Path>();
    try (var walk = Files.walk(data)) {
      paths.addAll(walk.filter(p -> !p.equals(data)).toList());
    }
    if (paths.stream().anyMatch(Files::isSymbolicLink))
      throw new IllegalStateException("环境含符号链接，拒绝重置");
    try (var channel =
            FileChannel.open(
                data.resolve(".java-backend.lock"),
                StandardOpenOption.CREATE,
                StandardOpenOption.WRITE);
        var lock = channel.tryLock()) {
      if (lock == null) throw new IllegalStateException("环境仍在运行，请先停止");
      Path backups = data.getParent().resolve("backups");
      if (Files.isSymbolicLink(backups)) throw new IllegalStateException("备份目录不能是符号链接");
      Files.createDirectories(backups);
      Path archive = backups.resolve("before-reset-" + UUID.randomUUID() + ".zip");
      var files =
          paths.stream()
              .filter(Files::isRegularFile)
              .filter(p -> !p.getFileName().toString().equals(".java-backend.lock"))
              .toList();
      try (var out = new ZipOutputStream(Files.newOutputStream(archive))) {
        for (Path file : files) {
          out.putNextEntry(new ZipEntry(data.relativize(file).toString().replace('\\', '/')));
          out.write(Files.readAllBytes(file));
          out.closeEntry();
        }
      }
      try (var zip = new ZipFile(archive.toFile())) {
        for (Path file : files) {
          var entry = zip.getEntry(data.relativize(file).toString().replace('\\', '/'));
          if (entry == null
              || !Arrays.equals(Files.readAllBytes(file), zip.getInputStream(entry).readAllBytes()))
            throw new IllegalStateException("重置备份校验失败");
        }
      }
      paths.sort(Comparator.reverseOrder());
      for (Path file : paths)
        if (!file.equals(marker) && !file.getFileName().toString().equals(".java-backend.lock"))
          Files.delete(file);
    }
  }

  public static void run(Path root, String[] args) throws Exception {
    var options = Arrays.asList(args);
    String name =
        options.stream()
            .filter(s -> s.startsWith("--name="))
            .map(s -> s.substring(7))
            .findFirst()
            .orElseThrow();
    if (options.stream()
        .anyMatch(
            s -> !s.startsWith("--name=") && !s.startsWith("--confirm=") && !s.equals("--reset")))
      throw new IllegalArgumentException("未知环境参数");
    Path data = directory(root, name);
    var identity = RuntimeEnvironment.open(root, data, name, true);
    if (options.contains("--reset"))
      reset(
          root,
          name,
          options.stream()
              .filter(s -> s.startsWith("--confirm="))
              .map(s -> s.substring(10))
              .findFirst()
              .orElse(""));
    System.out.println(
        write(
            obj(
                "name",
                name,
                "instanceId",
                identity.get("instanceId"),
                "dataDirectory",
                data.toString())));
  }
}
