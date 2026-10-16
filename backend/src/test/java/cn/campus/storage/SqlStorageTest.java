package cn.campus.storage;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SqlStorageTest {
  @TempDir Path root;

  @Test
  void migrationPreservesAllFieldsAndLegacySourceRemainsFrozen() throws Exception {
    Path data = root.resolve("data");
    Files.createDirectories(data);
    var old =
        obj(
            "schema",
            2,
            "users",
            new ArrayList<>(
                List.of(obj("id", "a", "username", "alice", "extra", obj("keep", true)))),
            "future",
            List.of("x", 3),
            "checkins",
            new ArrayList<>(),
            "settings",
            obj("mapProvider", "tencent"));
    String source = write(old);
    Files.writeString(data.resolve("store-v2.json"), source);
    try (var store = new StoreRepository(root, data)) {
      assertEquals(old, store.db);
      store.rows("users").getFirst().put("nickname", "new");
      store.save();
      assertEquals(1, store.lastSqlChanges);
      assertEquals(source, Files.readString(data.resolve("store-v2.json")));
      assertTrue(
          Files.list(data.resolve("backups/before-sql"))
              .anyMatch(p -> p.toString().endsWith(".json")));
    }
    try (var store = new StoreRepository(root, data)) {
      assertEquals("new", store.rows("users").getFirst().get("nickname"));
      assertEquals(List.of("x", 3), store.db.get("future"));
    }
  }

  @Test
  void oneNestedEditDoesNotRewriteThousandsOfUnchangedRecords() throws Exception {
    Path data = root.resolve("data");
    try (var store = new StoreRepository(root, data)) {
      for (int i = 0; i < 5000; i++)
        store
            .rows("checkins")
            .add(obj("id", "c" + i, "ownerId", "owner", "extras", obj("note", "old")));
      store.save();
      map(store.rows("checkins").get(2500).get("extras")).put("note", "changed");
      store.save();
      assertEquals(1, store.lastSqlChanges);
      store.beginChanges();
      store.rows("checkins").getFirst().put("note", "not saved");
      store.rows("checkins").removeLast();
      store.db.put("futureAdded", true);
      store.rollbackChanges();
      assertEquals(5000, store.rows("checkins").size());
      assertFalse(store.rows("checkins").getFirst().containsKey("note"));
      assertFalse(store.db.containsKey("futureAdded"));
    }
    try (var store = new StoreRepository(root, data)) {
      assertEquals("changed", map(store.rows("checkins").get(2500).get("extras")).get("note"));
    }
  }

  @Test
  void readersOverlapAndWritersWaitWithoutSharingTheOldMonitor() throws Exception {
    try (var store = new StoreRepository(root, root.resolve("data"));
        var pool = Executors.newVirtualThreadPerTaskExecutor()) {
      var entered = new CountDownLatch(2);
      var leave = new CountDownLatch(1);
      Callable<Void> reader =
          () -> {
            try (var guard = store.readAccess()) {
              entered.countDown();
              assertTrue(leave.await(3, TimeUnit.SECONDS));
            }
            return null;
          };
      var a = pool.submit(reader);
      var b = pool.submit(reader);
      assertTrue(entered.await(2, TimeUnit.SECONDS));
      var writer =
          pool.submit(
              () -> {
                try (var guard = store.writeAccess()) {
                  return true;
                }
              });
      assertFalse(writer.isDone());
      leave.countDown();
      a.get();
      b.get();
      assertTrue(writer.get());
    }
  }

  @Test
  void nativeSqlBackupRestoresRecordsMediaAndIndexes() throws Exception {
    Path data = root.resolve("data"),
        archive = root.resolve("full-backup.zip"),
        restored = root.resolve("restored");
    try (var store = new StoreRepository(root, data)) {
      store.rows("users").add(obj("id", "one", "username", "alice"));
      store.rows("auth").add(obj("hash", "fake-session-hash", "accountId", "one"));
      Files.write(data.resolve("media/example.jpg"), new byte[] {1, 2, 3});
      store.save();
      store.backup(archive);
      try (var guard = store.readAccess()) {
        assertEquals("one", store.indexed("users", "username", "alice").getFirst().get("id"));
        assertEquals(
            "one", store.indexed("auth", "hash", "fake-session-hash").getFirst().get("accountId"));
      }
    }
    try (var zip = new java.util.zip.ZipFile(archive.toFile())) {
      for (var entry : zip.stream().toList()) {
        Path target = restored.resolve(entry.getName()).normalize();
        assertTrue(target.startsWith(restored));
        Files.createDirectories(target.getParent());
        Files.write(target, zip.getInputStream(entry).readAllBytes());
      }
    }
    try (var store = new StoreRepository(root, restored)) {
      assertEquals("alice", store.rows("users").getFirst().get("username"));
      assertArrayEquals(
          new byte[] {1, 2, 3}, Files.readAllBytes(restored.resolve("media/example.jpg")));
    }
  }
}
