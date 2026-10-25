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
  private final java.util.concurrent.Semaphore preparationSlots =
      new java.util.concurrent.Semaphore(2);

  public PreparedUpload prepare(Map<String, Object> body) throws Exception {
    if (!preparationSlots.tryAcquire()) throw new ApiException("图片处理繁忙，草稿保留，请稍后重试", 429);
    try {
      return PreparedUpload.from(body);
    } finally {
      preparationSlots.release();
    }
  }

  private final RateLimiter limits;
  private final MediaCleanupService cleanup;

  public MediaService(RateLimiter limits, MediaCleanupService cleanup) {
    this.cleanup = cleanup;
    this.limits = limits;
  }

  public boolean preflight(ApiContext context) throws Exception {
    cn.campus.common.RequestValues.fields(context.body, "photo", "submissionId");
    String submission = Objects.toString(context.body.getOrDefault("submissionId", ""), "");
    if (!submission.isEmpty() && !submission.matches(MediaReferences.UUID))
      throw new ApiException("上传编号无效");
    if (replay(
        context, submission, Security.digest(Objects.toString(context.body.get("photo"), ""))))
      return true;
    limits.check(context.account.get("id") + ":upload-prepare", 30);
    return false;
  }

  private boolean replay(ApiContext context, String submission, String digest) throws Exception {
    StoreRepository store = context.store;
    if (!submission.isEmpty()) {
      var previous =
          store.rows("media").stream()
              .filter(
                  m ->
                      eq(m.get("ownerId"), context.account.get("id"))
                          && eq(m.get("submissionId"), submission))
              .reduce((a, b) -> b)
              .orElse(null);
      if (previous != null) {
        if (!eq(previous.get("uploadDigest"), digest)) throw new ApiException("上传编号与照片不匹配", 409);
        if (!yes(previous.get("deleted"))
            && !MediaCleanupService.expired(store, previous, cn.campus.common.TimeSource.now())
            && Files.isRegularFile(
                store.directory.resolve("media/" + previous.get("id") + ".jpg"))) {
          context.send(obj("id", previous.get("id"), "url", "/media/" + previous.get("id")), 201);
          return true;
        }
      }
    }
    return false;
  }

  public boolean commitUpload(ApiContext context, PreparedUpload prepared, String id)
      throws Exception {
    StoreRepository store = context.store;
    String submission = prepared.submissionId();
    if (replay(context, submission, prepared.digest())) return false;
    limits.check(context.account.get("id") + ":upload", 15);
    store
        .rows("media")
        .add(
            obj(
                "id",
                id,
                "ownerId",
                context.account.get("id"),
                "submissionId",
                submission,
                "uploadDigest",
                prepared.digest(),
                "width",
                prepared.width(),
                "height",
                prepared.height(),
                "public",
                false,
                "deleted",
                false,
                "at",
                StoreRepository.now()));
    store.save();
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

  public boolean handle(ApiContext context) throws Exception {
    StoreRepository store = context.store;
    if (context.audience.equals("admin")
        && context.route("/api/admin/performance/runtime", "GET")) {
      context.need();
      if (!cn.campus.admin.AdminPermissions.owner(context.account))
        throw new ApiException("无权限", 403);
      var metrics = cn.campus.web.RuntimeMetrics.snapshot();
      metrics.put("databaseBytes", Files.size(store.directory.resolve("campus.mv.db")));
      Path cache = store.directory.resolve("cache/thumbnails");
      long bytes = 0;
      if (Files.isDirectory(cache))
        try (var files = Files.walk(cache)) {
          for (var f : files.filter(Files::isRegularFile).toList()) bytes += Files.size(f);
        }
      metrics.put("imageCacheBytes", bytes);
      metrics.put("images", PhotoVariants.statistics());
      metrics.put("operations", cn.campus.web.OperationsHealth.snapshot(store));
      context.send(metrics);
      return true;
    }
    if (context.audience.equals("admin") && context.route("/api/admin/performance/images", "GET")) {
      context.need();
      if (!cn.campus.admin.AdminPermissions.owner(context.account))
        throw new ApiException("无权限", 403);
      context.send(PhotoVariants.statistics());
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
      ImageDelivery.send(context, file, yes(item.get("public")));
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
