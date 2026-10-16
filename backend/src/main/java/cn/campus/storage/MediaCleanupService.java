package cn.campus.storage;

import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.common.Json;
import cn.campus.common.TimeSource;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Persist a retirement queue before touching files; all checks share the normal API transaction
 * lock.
 */
@Service
public class MediaCleanupService {
  public static final long TEMPORARY_TTL = 24 * 60 * 60 * 1000L;
  private final StoreRepository store;
  private final LongSupplier clock;

  @Autowired
  public MediaCleanupService(StoreRepository store) {
    this(store, TimeSource::now);
  }

  MediaCleanupService(StoreRepository store, LongSupplier clock) {
    this.store = store;
    this.clock = clock;
  }

  public static Long uploadedAt(StoreRepository store, Map<String, Object> media) {
    try {
      return Instant.parse(str(media.get("at"))).toEpochMilli();
    } catch (Exception ignored) {
    }
    if (!str(media.get("id")).matches(MediaReferences.UUID)) return null;
    try {
      return Files.getLastModifiedTime(
              store.directory.resolve("media/" + media.get("id") + ".jpg"),
              LinkOption.NOFOLLOW_LINKS)
          .toMillis();
    } catch (Exception ignored) {
      return null;
    }
  }

  public static boolean expired(StoreRepository store, Map<String, Object> media, long now) {
    Long at = uploadedAt(store, media);
    return at != null
        && now - at >= TEMPORARY_TTL
        && !MediaReferences.referenced(store, media.get("id"));
  }

  public void release(Object id) {
    try (var ignored = store.writeAccess()) {
      if (MediaReferences.referenced(store, id))
        throw new ApiException("照片已用于内容或私人记录，不能作为草稿删除", 409);
      stage(Set.of(str(id)), "discarded");
      drain();
    }
  }

  @Scheduled(initialDelay = 30000, fixedDelay = 300000)
  public void cleanup() {
    try (var ignored = store.writeAccess()) {
      try {
        MediaReferences.Index refs = MediaReferences.index(store);
        if (!refs.complete() || !safeDirectory()) return;
        Set<String> candidates = new HashSet<>(),
            registered = new HashSet<>(),
            adminQueue = new HashSet<>();
        for (var q : store.rows("pendingMediaDeletes")) adminQueue.add(str(q.get("id")));
        long now = clock.getAsLong();
        for (var m : store.rows("media")) {
          String id = str(m.get("id"));
          registered.add(id);
          Long at = uploadedAt(store, m);
          if (id.matches(MediaReferences.UUID)
              && !refs.contains(id)
              && !adminQueue.contains(id)
              && (yes(m.get("deleted")) || at != null && now - at >= TEMPORARY_TTL))
            candidates.add(id);
        }
        try (var files = Files.newDirectoryStream(store.directory.resolve("media"), "*.jpg")) {
          for (Path file : files) {
            String name = file.getFileName().toString(), id = name.substring(0, name.length() - 4);
            if (id.matches(MediaReferences.UUID)
                && !registered.contains(id)
                && !refs.contains(id)
                && !adminQueue.contains(id)
                && Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)
                && now - Files.getLastModifiedTime(file, LinkOption.NOFOLLOW_LINKS).toMillis()
                    >= TEMPORARY_TTL) candidates.add(id);
          }
        }
        stage(candidates, "expired-unused");
        drain();
      } catch (Exception e) {
        System.getLogger(getClass().getName())
            .log(
                System.Logger.Level.WARNING,
                "Unused photo cleanup deferred; files remain protected and queued for retry.");
      }
    }
  }

  private boolean safeDirectory() throws java.io.IOException {
    Path root = store.directory.toRealPath(), media = root.resolve("media");
    return Files.isDirectory(media, LinkOption.NOFOLLOW_LINKS) && media.toRealPath().equals(media);
  }

  private void stage(Set<String> ids, String reason) {
    if (ids.isEmpty()) return;
    Map<String, Object> before = Json.clone(store.db);
    boolean changed = false;
    MediaReferences.Index refs = MediaReferences.index(store);
    try {
      for (String id : ids) {
        if (!id.matches(MediaReferences.UUID) || refs.contains(id)) continue;
        if (find(store.rows("pendingUnusedMediaDeletes"), "id", id) != null) continue;
        Map<String, Object> m = find(store.rows("media"), "id", id);
        if (m != null) m.put("deleted", true);
        store
            .rows("pendingUnusedMediaDeletes")
            .add(
                obj(
                    "id",
                    id,
                    "reason",
                    reason,
                    "queuedAt",
                    Instant.ofEpochMilli(clock.getAsLong()).toString()));
        changed = true;
      }
      if (changed) store.save();
    } catch (RuntimeException e) {
      store.db = before;
      throw e;
    }
  }

  private void drain() {
    if (store.rows("pendingUnusedMediaDeletes").isEmpty()) return;
    Map<String, Object> before = Json.clone(store.db);
    boolean changed = false;
    try {
      if (!safeDirectory()) return;
      MediaReferences.Index refs = MediaReferences.index(store);
      if (!refs.complete()) return;
      for (var queued : new ArrayList<>(store.rows("pendingUnusedMediaDeletes"))) {
        String id = str(queued.get("id"));
        if (!id.matches(MediaReferences.UUID)) continue;
        Map<String, Object> m = find(store.rows("media"), "id", id);
        if (refs.contains(id)) {
          if (m != null) m.put("deleted", false);
          store.rows("pendingUnusedMediaDeletes").remove(queued);
          changed = true;
          continue;
        }
        Path file = store.directory.resolve("media/" + id + ".jpg");
        if (Files.exists(file, LinkOption.NOFOLLOW_LINKS)
            && !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) continue;
        try {
          PhotoVariants.remove(store, file);
          Files.deleteIfExists(file);
        } catch (java.io.IOException e) {
          continue;
        }
        store.rows("media").removeIf(x -> eq(x.get("id"), id));
        store.rows("pendingUnusedMediaDeletes").remove(queued);
        changed = true;
      }
      if (changed) store.save();
    } catch (Exception e) {
      store.db = before;
      System.getLogger(getClass().getName())
          .log(System.Logger.Level.WARNING, "Unused photo cleanup queue retained for retry.");
    }
  }
}
