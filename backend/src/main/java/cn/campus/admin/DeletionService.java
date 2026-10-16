package cn.campus.admin;

import static cn.campus.auth.Security.*;
import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.common.Json;
import cn.campus.common.RateLimiter;
import cn.campus.common.TimeSource;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.file.*;
import java.util.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Persist the deletion and cleanup queue before removing files; personal snapshots keep their
 * references.
 */
@Service
public class DeletionService {
  private final StoreRepository store;
  private final RateLimiter limits;
  private final Map<String, Map<String, Object>> grants = new HashMap<>(),
      intents = new HashMap<>();

  public DeletionService(StoreRepository store, RateLimiter limits) {
    this.store = store;
    this.limits = limits;
    cleanup();
  }

  private record Plan(
      Map<String, Object> result,
      String fingerprint,
      List<Map<String, Object>> routes,
      List<Map<String, Object>> photos,
      List<Map<String, Object>> removed) {}

  private List<String> photoIds(Map<String, Object> point) {
    Set<String> ids = new LinkedHashSet<>();
    String id = str(point.get("mediaId")), cover = str(point.get("cover"));
    if (cover.startsWith("/media/")) ids.add(cover.substring(7));
    ids.add(id);
    return ids.stream()
        .filter(v -> v.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"))
        .toList();
  }

  private Plan preview(Object typeValue, Object idValue) throws Exception {
    String type = str(typeValue), id = str(idValue);
    if (!List.of("points", "routes", "templates").contains(type) || !(idValue instanceof String))
      throw new ApiException("删除对象无效");
    Map<String, Object> item = find(store.rows(type), "id", id);
    if (item == null) throw new ApiException("内容不存在或已删除", 404);
    String state =
        type.equals("points") ? "published" : type.equals("routes") ? "active" : "approved";
    if (!Boolean.FALSE.equals(item.get(state))) throw new ApiException("请先下线或暂停内容，再执行永久删除", 409);
    List<Map<String, Object>>
        templates =
            type.equals("points")
                ? store.rows("templates").stream().filter(t -> eq(t.get("pointId"), id)).toList()
                : List.of(),
        routes =
            type.equals("points")
                ? store.rows("routes").stream()
                    .filter(r -> list(r.get("points")).contains(id))
                    .toList()
                : List.of(),
        reports =
            type.equals("points")
                ? store.rows("reports").stream().filter(r -> eq(r.get("pointId"), id)).toList()
                : List.of(),
        photos = new ArrayList<>();
    if (type.equals("points"))
      for (String photo : photoIds(item)) {
        Path file = store.directory.resolve("media/" + photo + ".jpg");
        photos.add(
            obj(
                "id",
                photo,
                "pointIds",
                store.rows("points").stream()
                    .filter(p -> !eq(p.get("id"), id) && photoIds(p).contains(photo))
                    .map(p -> p.get("id"))
                    .toList(),
                "shootingSpotIds",
                store.rows("shootingSpots").stream()
                    .filter(
                        spot ->
                            !eq(spot.get("pointId"), id) && eq(spot.get("exampleMediaId"), photo))
                    .map(spot -> spot.get("id"))
                    .toList(),
                "sessionIds",
                store.rows("sessions").stream()
                    .filter(
                        s ->
                            rows(s.get("tasks")).stream()
                                .anyMatch(t -> eq(t.get("mediaId"), photo)))
                    .map(s -> s.get("id"))
                    .toList(),
                "checkinIds",
                store.rows("checkins").stream()
                    .filter(s -> eq(s.get("mediaId"), photo))
                    .map(s -> s.get("id"))
                    .toList(),
                "bytes",
                Files.exists(file) ? Files.size(file) : 0));
      }
    List<Map<String, Object>> removed =
        photos.stream()
            .filter(
                p ->
                    list(p.get("shootingSpotIds")).isEmpty()
                        && list(p.get("pointIds")).isEmpty()
                        && list(p.get("sessionIds")).isEmpty()
                        && list(p.get("checkinIds")).isEmpty())
            .toList();
    Map<String, Object> result =
        obj(
            "type",
            type,
            "id",
            id,
            "name",
            text(item.getOrDefault("name", item.get("title")), 120),
            "relatedShootingSpots",
            type.equals("points")
                ? store.rows("shootingSpots").stream()
                    .filter(spot -> eq(spot.get("pointId"), id))
                    .count()
                : 0,
            "relatedWorks",
            type.equals("points")
                ? store.rows("works").stream().filter(w -> eq(w.get("pointId"), id)).count()
                : 0,
            "relatedTemplates",
            templates.size(),
            "affectedRoutes",
            routes.size(),
            "relatedReports",
            reports.size(),
            "deletedPhotos",
            removed.size(),
            "preservedPhotos",
            photos.size() - removed.size(),
            "photoBytes",
            removed.stream().mapToLong(p -> integer(p.get("bytes"))).sum(),
            "personalRecordsPreserved",
            true);
    return new Plan(
        result,
        digest(
            write(
                obj(
                    "shootingSpots",
                    type.equals("points")
                        ? store.rows("shootingSpots").stream()
                            .filter(spot -> eq(spot.get("pointId"), id))
                            .toList()
                        : List.of(),
                    "works",
                    type.equals("points")
                        ? store.rows("works").stream()
                            .filter(w -> eq(w.get("pointId"), id))
                            .toList()
                        : List.of(),
                    "item",
                    item,
                    "templates",
                    templates,
                    "routes",
                    routes,
                    "reports",
                    reports,
                    "photos",
                    photos))),
        routes,
        photos,
        removed);
  }

  @Scheduled(fixedDelay = 30000)
  public void cleanup() {
    try (var ignored = store.writeAccess()) {
      List<Map<String, Object>> pending = new ArrayList<>(store.rows("pendingMediaDeletes"));
      if (pending.isEmpty()) return;
      List<Map<String, Object>> remaining = new ArrayList<>();
      for (Map<String, Object> p : pending) {
        String id = str(p.get("id"));
        if (!id.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")) {
          remaining.add(p);
          continue;
        }
        try {
          cn.campus.storage.PhotoVariants.remove(
              store, store.directory.resolve("media/" + id + ".jpg"));
          Files.deleteIfExists(store.directory.resolve("media/" + id + ".jpg"));
        } catch (Exception e) {
          remaining.add(p);
        }
      }
      store.db.put("pendingMediaDeletes", remaining);
      for (Map<String, Object> e : store.rows("audit"))
        if (eq(e.get("action"), "永久删除内容"))
          e.put(
              "cleanupPending",
              remaining.stream().filter(p -> eq(p.get("auditId"), e.get("id"))).count());
      try {
        store.save();
      } catch (Exception e) {
        store.db.put("pendingMediaDeletes", pending);
      }
    }
  }

  public boolean handle(ApiContext context) throws Exception {
    if (!context.audience.equals("admin")
        || !context.path.startsWith("/api/admin/content-deletion/")) return false;
    context.need();
    Map<String, Object> body = context.body, account = context.account;
    String key = str(context.session.get("hash"));
    long now = TimeSource.now();
    grants.entrySet().removeIf(e -> integer(e.getValue().get("until")) <= now);
    intents.entrySet().removeIf(e -> integer(e.getValue().get("expires")) <= now);
    Map<String, Object> grant = grants.get(key);
    boolean verified =
        grant != null
            && eq(grant.get("accountId"), account.get("id"))
            && eq(grant.get("passwordHash"), account.get("passwordHash"))
            && eq(grant.get("ip"), context.ip)
            && integer(grant.get("until")) > now;
    if (context.route("/api/admin/content-deletion/verification", "GET")) {
      context.send(obj("verifiedUntil", verified ? grant.get("until") : null));
      return true;
    }
    if (context.route("/api/admin/content-deletion/prepare", "POST")) {
      limits.check(account.get("id") + ":delete-prepare", 30);
      Plan plan = preview(body.get("type"), body.get("id"));
      if (!yes(body.get("remember")) || !verified || !str(body.get("password")).isEmpty()) {
        if (yes(body.get("remember")) && !verified && str(body.get("password")).isEmpty())
          throw new ApiException("免重复验证已失效，请输入当前管理员密码", 403);
        limits.check(account.get("id") + ":delete-password", 5);
        if (!(body.get("password") instanceof String)
            || str(body.get("password")).length() > 128
            || !verifyPassword(body.get("password"), account.get("passwordHash"))) {
          context.audit("删除密码验证失败", body.get("id"), "未执行删除");
          store.save();
          throw new ApiException("当前管理员密码不正确", 403);
        }
        if (yes(body.get("remember")))
          grants.put(
              key,
              obj(
                  "accountId",
                  account.get("id"),
                  "passwordHash",
                  account.get("passwordHash"),
                  "ip",
                  context.ip,
                  "until",
                  now + 15 * 60000));
        else grants.remove(key);
        context.audit(
            "验证内容删除权限", body.get("id"), yes(body.get("remember")) ? "当前登录会话 15 分钟内免重复验证" : "仅本次删除");
        store.save();
      }
      String token = token();
      intents.put(
          digest(token),
          obj(
              "accountId",
              account.get("id"),
              "sessionHash",
              key,
              "passwordHash",
              account.get("passwordHash"),
              "ip",
              context.ip,
              "type",
              body.get("type"),
              "id",
              body.get("id"),
              "fingerprint",
              plan.fingerprint,
              "expires",
              now + 5 * 60000));
      context.send(
          obj(
              "confirmationToken",
              token,
              "preview",
              plan.result,
              "verifiedUntil",
              grants.containsKey(key) ? grants.get(key).get("until") : null));
      return true;
    }
    if (context.route("/api/admin/content-deletion/commit", "POST")) {
      if (!yes(body.get("confirmed"))) throw new ApiException("请完成第二次不可逆删除确认");
      String token =
          str(body.get("confirmationToken")).matches("[a-f0-9]{64}")
              ? digest(str(body.get("confirmationToken")))
              : "";
      Map<String, Object> intent = intents.get(token);
      if (intent == null
          || !eq(intent.get("accountId"), account.get("id"))
          || !eq(intent.get("sessionHash"), key)
          || !eq(intent.get("passwordHash"), account.get("passwordHash"))
          || !eq(intent.get("ip"), context.ip)
          || integer(intent.get("expires")) <= now) throw new ApiException("删除确认已失效，请重新验证并确认", 403);
      Plan plan = preview(intent.get("type"), intent.get("id"));
      if (!eq(plan.fingerprint, intent.get("fingerprint"))) {
        intents.remove(token);
        throw new ApiException("内容或照片引用已变化，请重新查看删除范围并确认", 409);
      }
      Map<String, Object> result = execute(plan, context);
      intents.remove(token);
      Map<String, Object> out = obj("ok", true);
      out.putAll(result);
      context.send(out);
      return true;
    }
    throw new ApiException("接口不存在", 404);
  }

  private Map<String, Object> execute(Plan plan, ApiContext c) {
    Map<String, Object> before = Json.clone(store.db);
    String type = str(plan.result.get("type"));
    Object id = plan.result.get("id");
    try {
      store.rows(type).removeIf(x -> eq(x.get("id"), id));
      if (type.equals("points")) {
        var removedWorks =
            store.rows("works").stream()
                .filter(w -> eq(w.get("pointId"), id))
                .map(w -> w.get("id"))
                .toList();
        store.rows("works").removeIf(w -> removedWorks.contains(w.get("id")));
        for (var report : store.rows("workReports"))
          if (removedWorks.contains(report.get("workId")) && eq(report.get("status"), "pending"))
            cn.campus.notification.NotificationService.add(
                store,
                report.get("userId"),
                "work-report:" + report.get("id"),
                "report",
                "作品举报处理结果",
                "相关地点及作品已移除，你的举报已结束。",
                "#notifications");
        for (var report : store.rows("reports"))
          if (eq(report.get("pointId"), id) && eq(report.get("status"), "pending"))
            cn.campus.notification.NotificationService.add(
                store,
                report.get("userId"),
                "report:" + report.get("id"),
                "report",
                "点位反馈处理结果",
                "相关地点已移除，你的反馈已结束。",
                "#notifications");
        store.rows("workReports").removeIf(r -> removedWorks.contains(r.get("workId")));
        store.rows("shootingSpots").removeIf(s -> eq(s.get("pointId"), id));
        store.rows("pointReactions").removeIf(x -> eq(x.get("pointId"), id));
        store.rows("templates").removeIf(x -> eq(x.get("pointId"), id));
        store.rows("reports").removeIf(x -> eq(x.get("pointId"), id));
        for (Map<String, Object> r : plan.routes) {
          list(r.get("points")).removeIf(p -> eq(p, id));
          r.put("active", false);
          r.put("version", integer(r.get("version")) + 1);
        }
        for (Map<String, Object> u : store.rows("users"))
          list(u.get("bookmarks")).removeIf(p -> eq(p, id));
        for (Map<String, Object> photo : plan.photos) {
          Map<String, Object> m = find(store.rows("media"), "id", photo.get("id"));
          if (m != null && list(photo.get("pointIds")).isEmpty()) m.put("public", false);
        }
      }
      Set<Object> removed = new HashSet<>();
      for (Map<String, Object> p : plan.removed) removed.add(p.get("id"));
      store.rows("media").removeIf(m -> removed.contains(m.get("id")));
      store.bump();
      Map<String, Object> event =
          c.audit(
              "永久删除内容",
              id,
              plan.result.get("name")
                  + "；删除 "
                  + plan.result.get("deletedPhotos")
                  + " 张独占照片；保留 "
                  + plan.result.get("preservedPhotos")
                  + " 张仍被引用的照片");
      event.putAll(
          obj(
              "contentType",
              type,
              "contentName",
              plan.result.get("name"),
              "result",
              "deleted",
              "deletion",
              plan.result,
              "cleanupPending",
              removed.size()));
      for (Object photo : removed)
        store.rows("pendingMediaDeletes").add(obj("id", photo, "auditId", event.get("id")));
      store.save();
    } catch (RuntimeException e) {
      store.db = before;
      throw e;
    }
    cleanup();
    Map<String, Object> out = copy(plan.result);
    out.put(
        "cleanupPending",
        store.rows("pendingMediaDeletes").stream()
            .filter(p -> plan.removed.stream().anyMatch(m -> eq(m.get("id"), p.get("id"))))
            .count());
    return out;
  }
}
