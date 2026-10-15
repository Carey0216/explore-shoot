package cn.campus.storage;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.common.RateLimiter;
import cn.campus.web.ApiContext;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import org.springframework.stereotype.Service;

@Service
public class MediaService {
  private final RateLimiter limits;
  private final MediaCleanupService cleanup;

  public MediaService(RateLimiter limits, MediaCleanupService cleanup) {
    this.cleanup = cleanup;
    this.limits = limits;
  }

  public boolean handle(ApiContext context) throws Exception {
    StoreRepository store = context.store;
    if (context.route("/api/media", "POST")) {
      context.need();
      limits.check(context.account.get("id") + ":upload", 15);
      byte[] photo =
          PhotoVariants.jpeg(
              Security.photo(context.body.get("photo"), 5 * 1024 * 1024), 1920, .84f);
      String id = Security.id();
      Files.write(store.directory.resolve("media/" + id + ".jpg"), photo);
      store
          .rows("media")
          .add(
              obj(
                  "id",
                  id,
                  "ownerId",
                  context.account.get("id"),
                  "public",
                  false,
                  "deleted",
                  false,
                  "at",
                  java.time.Instant.ofEpochMilli(cn.campus.common.TimeSource.now()).toString()));
      try {
        store.save();
      } catch (RuntimeException e) {
        Files.deleteIfExists(store.directory.resolve("media/" + id + ".jpg"));
        throw e;
      }
      context.send(
          obj(
              "id",
              id,
              "url",
              "/media/" + id,
              "expiresAt",
              java.time.Instant.ofEpochMilli(
                      cn.campus.common.TimeSource.now() + MediaCleanupService.TEMPORARY_TTL)
                  .toString()),
          201);
      return true;
    }
    Matcher upload =
        Pattern.compile("^/api/media/(" + MediaReferences.UUID + ")$").matcher(context.path);
    if (upload.matches() && List.of("GET", "DELETE").contains(context.method)) {
      context.need();
      Map<String, Object> item = find(store.rows("media"), "id", upload.group(1));
      if (item == null || !eq(item.get("ownerId"), context.account.get("id")))
        throw new ApiException("临时照片不存在", 404);
      if (context.method.equals("DELETE")) {
        cleanup.release(upload.group(1));
        context.send(obj("ok", true));
        return true;
      }
      if (yes(item.get("deleted"))
          || !Files.isRegularFile(store.directory.resolve("media/" + upload.group(1) + ".jpg")))
        throw new ApiException("临时照片不存在", 404);
      if (MediaCleanupService.expired(store, item, cn.campus.common.TimeSource.now()))
        throw new ApiException("临时照片已过期，请重新上传", 410);
      boolean attached = MediaReferences.referenced(store, upload.group(1));
      Long at = MediaCleanupService.uploadedAt(store, item);
      context.send(
          obj(
              "id",
              upload.group(1),
              "url",
              "/media/" + upload.group(1),
              "attached",
              attached,
              "expiresAt",
              attached || at == null
                  ? null
                  : java.time.Instant.ofEpochMilli(at + MediaCleanupService.TEMPORARY_TTL)
                      .toString()));
      return true;
    }
    Matcher m = Pattern.compile("^/media/([a-f0-9-]+)$").matcher(context.path);
    if (m.matches() && context.method.equals("GET")) {
      Map<String, Object> item = find(store.rows("media"), "id", m.group(1));
      Path file = store.directory.resolve("media/" + m.group(1) + ".jpg");
      if (item == null
          || yes(item.get("deleted"))
          || (!yes(item.get("public"))
              && (context.account == null || !eq(item.get("ownerId"), context.account.get("id"))))
          || !Files.isRegularFile(file)
          || MediaCleanupService.expired(store, item, cn.campus.common.TimeSource.now()))
        throw new ApiException("照片不存在", 404);
      if ("thumb".equals(context.request.getParameter("size")))
        file = PhotoVariants.thumbnail(store, file);
      context.response.setContentType("image/jpeg");
      context.response.setHeader(
          "Cache-Control", yes(item.get("public")) ? "private, max-age=60" : "private, no-store");
      Files.copy(file, context.response.getOutputStream());
      return true;
    }
    return false;
  }

  public void purge(StoreRepository s, Object id) throws Exception {
    if (id == null) return;
    if (MediaReferences.referenced(s, id)) return;
    if (find(s.rows("media"), "id", id) != null) cleanup.release(id);
  }
}
