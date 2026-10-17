package cn.campus.storage;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.Json;
import cn.campus.storage.sql.*;
import java.io.*;
import java.nio.channels.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.locks.*;
import org.springframework.stereotype.Repository;

/**
 * Compatibility facade over an embedded SQL database. Existing business maps are tracked per row.
 */
@Repository
public class StoreRepository implements AutoCloseable {
  private final ReentrantReadWriteLock access = new ReentrantReadWriteLock(true);
  private SqlDatabase persistence;
  private TrackedDocument tracked;
  public int lastSqlChanges;
  public final Path root;
  public final Path directory;
  public final Map<String, Object> environment;
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
    this(projectRoot, dataDirectory, cn.campus.settings.RuntimeEnvironment.current());
  }

  public StoreRepository(Path projectRoot, Path dataDirectory, String environmentName)
      throws IOException {
    root = projectRoot.toAbsolutePath().normalize();
    directory = dataDirectory.toAbsolutePath().normalize();
    try {
      environment =
          cn.campus.settings.RuntimeEnvironment.open(
              root,
              directory,
              environmentName,
              System.getenv("EXPLORE_DATA_DIR") != null || !directory.equals(root.resolve("data")));
    } catch (Exception e) {
      throw new IOException("Environment check failed: " + e.getMessage(), e);
    }
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
    boolean sqlExists = Files.exists(directory.resolve("campus.mv.db"));
    if (sqlExists) {
      db = null; // The original JSON is an immutable migration source, never an active replica.
    } else if (Files.exists(file)) {
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
    }
    try {
      if (!sqlExists && Files.exists(file)) {
        Path backup = directory.resolve("backups/before-sql");
        Files.createDirectories(backup);
        byte[] original = Files.readAllBytes(file);
        String digest =
            Security.digest(new String(original, java.nio.charset.StandardCharsets.UTF_8));
        Path copy = backup.resolve("store-v2-" + digest + ".json");
        if (!Files.exists(copy)) Files.write(copy, original, StandardOpenOption.CREATE_NEW);
        if (!Arrays.equals(original, Files.readAllBytes(copy)))
          throw new IOException("Migration backup verification failed");
      }
      if (!sqlExists) {
        String expected = Json.write(db);
        Path staging = directory.resolve(".campus-migration-" + UUID.randomUUID());
        try (var migration = new SqlDatabase(staging)) {
          migration.save(TrackedDocument.from(db));
          if (!Json.write(migration.load()).equals(expected))
            throw new IOException("SQL migration content verification failed");
        }
        Files.move(Path.of(staging + ".mv.db"), directory.resolve("campus.mv.db"));
        Files.writeString(
            directory.resolve("storage-engine.json"),
            Json.write(obj("engine", "h2", "schema", 1, "migratedAt", now())),
            StandardOpenOption.CREATE,
            StandardOpenOption.TRUNCATE_EXISTING);
      }
      persistence = new SqlDatabase(directory.resolve("campus"));
      if (!persistence.initialized())
        throw new IOException("SQL database is uninitialized; refusing stale JSON fallback");
      tracked = persistence.load();
      db = tracked;
      if (cn.campus.common.Json.rows(db.get("admins")).stream()
              .filter(cn.campus.admin.AdminPermissions::owner)
              .count()
          > 1)
        throw new IOException("Multiple owner accounts detected; data retained, startup refused");
      testSnapshot();
    } catch (Exception e) {
      if (persistence != null)
        try {
          persistence.close();
        } catch (Exception ignored) {
        }
      lock.release();
      lockChannel.close();
      throw new IOException("SQL storage initialization failed; legacy data retained", e);
    }
  }

  public final class Guard implements AutoCloseable {
    private final Lock held;

    Guard(Lock held) {
      this.held = held;
      held.lock();
    }

    public void close() {
      held.unlock();
    }
  }

  public Guard readAccess() {
    return new Guard(access.readLock());
  }

  public Guard writeAccess() {
    return new Guard(access.writeLock());
  }

  private void adopt() {
    if (db != tracked) {
      var prior = new HashSet<>(tracked.keySet());
      tracked = TrackedDocument.from(db);
      tracked.replaceExisting(prior);
      db = tracked;
    }
  }

  public void beginChanges() {
    adopt();
  }

  public void rollbackChanges() {
    try {
      tracked = persistence.load();
      db = tracked;
    } catch (java.sql.SQLException e) {
      throw new IllegalStateException("SQL rollback reload failed", e);
    }
  }

  public String exportJson() {
    return Json.write(db);
  }

  public String persistedJson() {
    try {
      return Json.write(persistence.load());
    } catch (java.sql.SQLException e) {
      throw new IllegalStateException(e);
    }
  }

  public void backup(java.nio.file.Path archive) throws Exception {
    try (var guard = writeAccess()) {
      if (Files.exists(archive)) throw new IOException("备份文件已存在");
      Path nativeZip = directory.resolve(".sql-backup-" + UUID.randomUUID() + ".zip");
      var hashes = new LinkedHashMap<String, String>();
      try {
        persistence.backup(nativeZip);
        try (var sql = new java.util.zip.ZipFile(nativeZip.toFile());
            var out =
                new java.util.zip.ZipOutputStream(
                    Files.newOutputStream(archive, StandardOpenOption.CREATE_NEW))) {
          for (var entry : sql.stream().toList()) {
            if (entry.isDirectory()) continue;
            if (!entry.getName().equals("campus.mv.db"))
              throw new IOException("Unexpected SQL backup entry");
            out.putNextEntry(new java.util.zip.ZipEntry(entry.getName()));
            byte[] bytes = sql.getInputStream(entry).readAllBytes();
            out.write(bytes);
            out.closeEntry();
            hashes.put(
                entry.getName(),
                java.util.HexFormat.of()
                    .formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes)));
          }
          try (var paths = Files.walk(directory)) {
            for (Path file : paths.toList()) {
              if (Files.isSymbolicLink(file)) throw new IOException("备份目录存在符号链接");
              String name = directory.relativize(file).toString().replace('\\', '/');
              if (!Files.isRegularFile(file)
                  || file.equals(archive)
                  || file.equals(nativeZip)
                  || name.startsWith("backups/")
                  || name.startsWith("maintenance-backups/")
                  || name.startsWith(".campus-migration-")
                  || name.startsWith("test-store-snapshot")
                  || name.equals("campus.mv.db")
                  || name.equals(".java-backend.lock")) continue;
              byte[] bytes = Files.readAllBytes(file);
              out.putNextEntry(new java.util.zip.ZipEntry(name));
              out.write(bytes);
              out.closeEntry();
              hashes.put(
                  name,
                  java.util.HexFormat.of()
                      .formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes)));
            }
          }
        }
        try (var zip = new java.util.zip.ZipFile(archive.toFile())) {
          for (var entry : hashes.entrySet()) {
            byte[] bytes = zip.getInputStream(zip.getEntry(entry.getKey())).readAllBytes();
            if (!entry
                .getValue()
                .equals(
                    java.util.HexFormat.of()
                        .formatHex(
                            java.security.MessageDigest.getInstance("SHA-256").digest(bytes))))
              throw new IOException("备份摘要校验失败");
          }
        }
      } finally {
        Files.deleteIfExists(nativeZip);
      }
    }
  }

  private void testSnapshot() throws IOException {
    if (!"1".equals(System.getenv("EXPLORE_TEST_MODE"))) return;
    Path temp = directory.resolve("test-store-snapshot.json.tmp"),
        target = directory.resolve("test-store-snapshot.json");
    Files.writeString(temp, Json.write(db));
    Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
  }

  public List<Map<String, Object>> rows(String key) {
    if (access.getReadHoldCount() > 0
        && !access.isWriteLockedByCurrentThread()
        && !db.containsKey(key)) return List.of();
    if (!db.containsKey(key)) db.put(key, new ArrayList<>());
    return Json.rows(db.get(key));
  }

  public Map<String, Object> settings() {
    return map(db.get("settings"));
  }

  /**
   * Indexed reads use separate JDBC connections; pending writes keep their current unit-of-work
   * view.
   */
  public List<Map<String, Object>> indexed(String group, String field, String value) {
    String column =
        switch (field) {
          case "id", "hash" -> "entity_id";
          case "ownerId" -> "owner_id";
          case "username" -> "account_name";
          case "pointId" -> "point_id";
          default -> throw new IllegalArgumentException("Unsupported indexed field");
        };
    if (access.getReadHoldCount() == 0 || access.isWriteLockedByCurrentThread() || db != tracked)
      return rows(group).stream().filter(r -> eq(r.get(field), value)).toList();
    Object collection = db.get(group);
    if (!(collection instanceof TrackedDocument.Records records)) return List.of();
    try {
      return persistence.findKeys(group, column, value).stream()
          .map(records::byStorageKey)
          .filter(Objects::nonNull)
          .toList();
    } catch (java.sql.SQLException e) {
      throw new IllegalStateException("Indexed read failed", e);
    }
  }

  public void bump() {
    db.put("version", integer(db.get("version")) + 1);
  }

  public void save() {
    try {
      adopt();
      lastSqlChanges = persistence.save(tracked);
      writes++;
      testSnapshot();
    } catch (Exception e) {
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
    return rows("audit").getLast();
  }

  public static String now() {
    return Instant.now().toString();
  }

  public void close() throws IOException {
    try {
      if (persistence != null) persistence.close();
    } catch (java.sql.SQLException e) {
      throw new IOException(e);
    }
    lock.release();
    lockChannel.close();
  }
}
