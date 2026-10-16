package cn.campus.storage;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.nio.file.attribute.FileTime;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class MediaCleanupTest {
  @TempDir Path temporary;
  static final long NOW = Instant.parse("2026-10-12T08:00:00Z").toEpochMilli();

  String photo(StoreRepository store, long age) throws Exception {
    String id = UUID.randomUUID().toString();
    store
        .rows("media")
        .add(
            obj(
                "id",
                id,
                "at",
                Instant.ofEpochMilli(NOW - age).toString(),
                "public",
                false,
                "deleted",
                false));
    Files.write(store.directory.resolve("media/" + id + ".jpg"), new byte[] {1, 2, 3});
    return id;
  }

  @Test
  void expiredUnusedUploadsAndOrphanFilesAreRemovedButAllContentReferencesSurvive()
      throws Exception {
    try (var store = new StoreRepository(temporary, temporary.resolve("data"))) {
      String expired = photo(store, MediaCleanupService.TEMPORARY_TTL),
          fresh = photo(store, MediaCleanupService.TEMPORARY_TTL - 1);
      String point = photo(store, 10 * MediaCleanupService.TEMPORARY_TTL),
          privatePhoto = photo(store, 10 * MediaCleanupService.TEMPORARY_TTL),
          session = photo(store, 10 * MediaCleanupService.TEMPORARY_TTL),
          unknown = photo(store, 10 * MediaCleanupService.TEMPORARY_TTL),
          legacy = photo(store, 10 * MediaCleanupService.TEMPORARY_TTL);
      store
          .rows("points")
          .add(obj("id", "offline-point", "published", false, "cover", "/media/" + point));
      store.rows("checkins").add(obj("mediaId", privatePhoto));
      store.rows("sessions").add(obj("tasks", List.of(obj("mediaId", session))));
      store.db.put("futureContent", obj("photoUrl", "https://example.test/media/" + unknown));
      Files.writeString(
          store.directory.resolve("store.json"),
          write(obj("oldSessions", List.of(obj("photo", "/media/" + legacy)))));
      String orphan = UUID.randomUUID().toString(), orphanFresh = UUID.randomUUID().toString();
      for (String id : List.of(orphan, orphanFresh)) {
        Path path = store.directory.resolve("media/" + id + ".jpg");
        Files.write(path, new byte[] {1});
        Files.setLastModifiedTime(
            path,
            FileTime.fromMillis(
                NOW - (id.equals(orphan) ? MediaCleanupService.TEMPORARY_TTL : 1000)));
      }
      Path unrelated = store.directory.resolve("media/not-an-upload.jpg");
      Files.write(unrelated, new byte[] {1});
      Files.setLastModifiedTime(unrelated, FileTime.fromMillis(0));
      store.save();
      new MediaCleanupService(store, () -> NOW).cleanup();
      for (String id : List.of(expired, orphan)) {
        assertFalse(Files.exists(store.directory.resolve("media/" + id + ".jpg")));
        assertNull(find(store.rows("media"), "id", id));
      }
      for (String id : List.of(fresh, point, privatePhoto, session, unknown, legacy, orphanFresh))
        assertTrue(Files.exists(store.directory.resolve("media/" + id + ".jpg")), id);
      assertTrue(Files.exists(unrelated));
      assertTrue(store.rows("pendingUnusedMediaDeletes").isEmpty());
    }
  }

  static class FailingStore extends StoreRepository {
    int saveUntilFailure = -1;

    FailingStore(Path root, Path data) throws Exception {
      super(root, data);
    }

    @Override
    public void save() {
      if (saveUntilFailure == 0 && writes > 0) {
        saveUntilFailure = -1;
        throw new IllegalStateException("simulated save failure");
      }
      if (saveUntilFailure > 0) saveUntilFailure--;
      super.save();
    }
  }

  @Test
  void persistenceFailuresAndBlockedFilesRetryAfterRestartWithoutPrematureDeletion()
      throws Exception {
    Path data = temporary.resolve("data");
    String id;
    try (var store = new FailingStore(temporary, data)) {
      id = photo(store, 2 * MediaCleanupService.TEMPORARY_TTL);
      store.save();
      String disk = store.persistedJson();
      store.saveUntilFailure = 0;
      new MediaCleanupService(store, () -> NOW).cleanup();
      assertEquals(disk, store.persistedJson());
      assertTrue(Files.exists(data.resolve("media/" + id + ".jpg")));
      assertFalse(yes(find(store.rows("media"), "id", id).get("deleted")));
      Path blocked = data.resolve("media/" + id + ".jpg");
      Files.delete(blocked);
      Files.createDirectory(blocked);
      Files.write(blocked.resolve("busy"), new byte[] {1});
      new MediaCleanupService(store, () -> NOW).cleanup();
      assertEquals(1, store.rows("pendingUnusedMediaDeletes").size());
    }
    try (var store = new StoreRepository(temporary, data)) {
      Path blocked = data.resolve("media/" + id + ".jpg");
      Files.delete(blocked.resolve("busy"));
      Files.delete(blocked);
      Files.write(blocked, new byte[] {1});
      new MediaCleanupService(store, () -> NOW).cleanup();
      assertFalse(Files.exists(blocked));
      assertTrue(store.rows("pendingUnusedMediaDeletes").isEmpty());
      assertNull(find(store.rows("media"), "id", id));
      String rescued = photo(store, 2 * MediaCleanupService.TEMPORARY_TTL);
      find(store.rows("media"), "id", rescued).put("deleted", true);
      store.rows("pendingUnusedMediaDeletes").add(obj("id", rescued));
      store.rows("checkins").add(obj("mediaId", rescued));
      store.save();
      new MediaCleanupService(store, () -> NOW).cleanup();
      assertTrue(Files.exists(data.resolve("media/" + rescued + ".jpg")));
      assertFalse(yes(find(store.rows("media"), "id", rescued).get("deleted")));
    }
  }

  @Test
  void finalSaveFailureKeepsDurableQueueAndUnreadableLegacyReferencesPreventDeletion()
      throws Exception {
    Path data = temporary.resolve("data");
    String id;
    try (var store = new FailingStore(temporary, data)) {
      id = photo(store, 2 * MediaCleanupService.TEMPORARY_TTL);
      store.save();
      store.saveUntilFailure = 1;
      new MediaCleanupService(store, () -> NOW).cleanup();
      assertFalse(Files.exists(data.resolve("media/" + id + ".jpg")));
      assertEquals(1, rows(parse(store.persistedJson()).get("pendingUnusedMediaDeletes")).size());
    }
    try (var store = new StoreRepository(temporary, data)) {
      new MediaCleanupService(store, () -> NOW).cleanup();
      assertTrue(store.rows("pendingUnusedMediaDeletes").isEmpty());
      assertNull(find(store.rows("media"), "id", id));
      String protectedId = photo(store, 2 * MediaCleanupService.TEMPORARY_TTL);
      store.save();
      Files.writeString(data.resolve("store.json"), "not valid JSON");
      new MediaCleanupService(store, () -> NOW).cleanup();
      assertTrue(Files.exists(data.resolve("media/" + protectedId + ".jpg")));
    }
  }
}
