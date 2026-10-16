package cn.campus.storage;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.Json;
import java.io.*;
import java.nio.channels.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Repository;

/**
 * One transaction lock covers both ports; atomic replacement keeps the v2 file readable by older
 * releases.
 */
@Repository
public class StoreRepository implements AutoCloseable {
  public final Object mutex = new Object();
  public final Path root;
  public final Path directory;
  public Map<String, Object> db;
  public long writes = 0;
  // Runtime switch, never persisted as user data. Test WeChat sessions cannot survive test mode.
  public volatile boolean wechatTestLoginEnabled;
  public final Map<String, Object> campus;
  private final FileChannel lockChannel;
  private final FileLock lock;

  @org.springframework.beans.factory.annotation.Autowired
  public StoreRepository() throws IOException {
    this(
        Path.of(
            System.getenv().getOrDefault("EXPLORE_PROJECT_ROOT", System.getProperty("user.dir"))),
        Path.of(
            System.getenv()
                .getOrDefault(
                    "EXPLORE_DATA_DIR",
                    Path.of(
                            System.getenv()
                                .getOrDefault(
                                    "EXPLORE_PROJECT_ROOT", System.getProperty("user.dir")))
                        .resolve("data")
                        .toString())));
  }

  public StoreRepository(Path projectRoot, Path dataDirectory) throws IOException {
    root = projectRoot.toAbsolutePath().normalize();
    directory = dataDirectory.toAbsolutePath().normalize();
    Files.createDirectories(directory);
    Files.createDirectories(directory.resolve("media"));
    Files.createDirectories(directory.resolve("avatars"));
    lockChannel =
        FileChannel.open(
            directory.resolve(".java-backend.lock"),
            StandardOpenOption.CREATE,
            StandardOpenOption.WRITE);
    lock = lockChannel.tryLock();
    if (lock == null) {
      lockChannel.close();
      throw new IOException("This data directory is already in use by Java.");
    }
    Map<String, Object> seed =
        parse(
            new String(
                Objects.requireNonNull(getClass().getResourceAsStream("/campus-seed.json"))
                    .readAllBytes(),
                java.nio.charset.StandardCharsets.UTF_8));
    campus = map(seed.remove("campus"));
    Path file = directory.resolve("store-v2.json");
    if (Files.exists(file)) {
      try {
        db = parse(Files.readString(file));
      } catch (RuntimeException e) {
        lock.release();
        lockChannel.close();
        throw new IOException("Store is invalid; no data has been replaced.");
      }
    } else {
      db = seed;
      db.putAll(obj("schema", 2, "version", 1, "contentVersion", 1));
      for (String name :
          List.of(
              "users",
              "admins",
              "invites",
              "applications",
              "reports",
              "sessions",
              "auth",
              "media",
              "audit",
              "logs")) db.put(name, new ArrayList<>());
      String bootstrap = System.getenv().getOrDefault("ADMIN_PASSWORD", "Explore2026!");
      Object hash =
          Files.exists(directory.resolve("bootstrap-admin.json"))
              ? parse(Files.readString(directory.resolve("bootstrap-admin.json")))
                  .get("passwordHash")
              : Security.hashPassword(bootstrap);
      Json.rows(db.get("admins"))
          .add(
              obj(
                  "id",
                  Security.id(),
                  "username",
                  "admin",
                  "name",
                  "超级管理员",
                  "role",
                  "super",
                  "enabled",
                  true,
                  "passwordHash",
                  hash,
                  "createdAt",
                  now()));
      db.put(
          "settings",
          obj(
              "amapKey",
              "",
              "amapSecurity",
              "",
              "tencentKey",
              "",
              "mapProvider",
              "tencent",
              "tencentMapMigration",
              1));
      if (Files.exists(directory.resolve("store.json"))) {
        Map<String, Object> old = parse(Files.readString(directory.resolve("store.json")));
        db.put(
            "legacyArchive",
            obj(
                "importedAt",
                now(),
                "pointCount",
                list(old.get("points")).size(),
                "sessionCount",
                list(old.get("sessions")).size(),
                "source",
                "store.json",
                "note",
                "旧版虚构数据和匿名记录保留在原文件，不作为真实校园推荐。"));
      }
      save();
    }
    // No write on startup for an existing installation: unknown fields and all historical data are
    // retained.
  }

  public List<Map<String, Object>> rows(String key) {
    return Json.rows(db.computeIfAbsent(key, k -> new ArrayList<>()));
  }

  public Map<String, Object> settings() {
    return map(db.get("settings"));
  }

  public void bump() {
    db.put("version", integer(db.get("version")) + 1);
  }

  public void save() {
    Path file = directory.resolve("store-v2.json"),
        temporary = directory.resolve("store-v2.json.tmp");
    try {
      String data = MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(db);
      try (FileChannel channel =
          FileChannel.open(
              temporary,
              StandardOpenOption.CREATE,
              StandardOpenOption.TRUNCATE_EXISTING,
              StandardOpenOption.WRITE)) {
        channel.write(
            java.nio.ByteBuffer.wrap(data.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        channel.force(true);
      }
      try {
        Files.move(
            temporary, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
      } catch (AtomicMoveNotSupportedException e) {
        Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
      }
      writes++;
    } catch (IOException e) {
      throw new IllegalStateException("Could not persist the store", e);
    }
  }

  public Map<String, Object> audit(
      Map<String, Object> actor,
      String action,
      Object subject,
      String detail,
      String ip,
      String audience) {
    Map<String, Object> e =
        obj(
            "id",
            Security.id(),
            "at",
            now(),
            "actorId",
            actor.get("id"),
            "actor",
            actor.get("username"),
            "action",
            action,
            "subject",
            subject,
            "detail",
            detail,
            "ip",
            ip,
            "audience",
            audience,
            "actorName",
            actor.getOrDefault("name", actor.getOrDefault("nickname", actor.get("username"))),
            "actorRole",
            audience.equals("admin") ? actor.get("role") : "user");
    rows("audit").add(e);
    List<Map<String, Object>> routine =
        rows("audit").stream().filter(x -> !eq(x.get("action"), "永久删除内容")).toList();
    if (routine.size() > 3000) rows("audit").removeAll(routine.subList(0, routine.size() - 3000));
    return e;
  }

  public static String now() {
    return Instant.now().toString();
  }

  public void close() throws IOException {
    lock.release();
    lockChannel.close();
  }
}
