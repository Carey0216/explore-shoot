package cn.campus.checkin;

import static cn.campus.auth.Security.text;
import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.common.RateLimiter;
import cn.campus.notification.NotificationService;
import cn.campus.point.ShootingSpotService;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/** Opt-in, pre-moderated copies of a caption/photo presentation, never public private records. */
@Service
public class WorkWallService {
  private final RateLimiter limits;

  public WorkWallService(RateLimiter limits) {
    this.limits = limits;
  }

  private static Map<String, Object> record(StoreRepository s, Map<String, Object> w) {
    return s.rows("checkins").stream()
        .filter(r -> eq(r.get("id"), w.get("checkinId")) && eq(r.get("ownerId"), w.get("ownerId")))
        .findFirst()
        .orElse(null);
  }

  private static boolean visible(StoreRepository s, Map<String, Object> w) {
    if (w == null
        || !eq(w.get("status"), "approved")
        || record(s, w) == null
        || ShootingSpotService.published(s, w.get("spotId")) == null) return false;
    var owner = find(s.rows("users"), "id", w.get("ownerId"));
    return owner != null && yes(owner.get("enabled")) && !yes(owner.get("deleted"));
  }

  private static Map<String, Object> publicView(StoreRepository s, Map<String, Object> w) {
    var owner = find(s.rows("users"), "id", w.get("ownerId"));
    return obj(
        "id",
        w.get("id"),
        "pointId",
        w.get("pointId"),
        "spotId",
        w.get("spotId"),
        "caption",
        w.get("caption"),
        "experience",
        w.getOrDefault("experience", obj()),
        "authorName",
        owner == null ? "校园探索者" : owner.get("nickname"),
        "createdAt",
        w.get("createdAt"),
        "photo",
        "/api/works/" + w.get("id") + "/photo");
  }

  public static Map<String, Object> adminView(StoreRepository s, Map<String, Object> w) {
    var out = copy(w);
    out.remove("checkinId");
    out.remove("ownerId");
    out.put(
        "photo",
        eq(w.get("status"), "withdrawn") ? null : "/api/admin/works/" + w.get("id") + "/photo");
    var owner = find(s.rows("users"), "id", w.get("ownerId"));
    out.put("authorName", owner == null ? "已删除用户" : owner.get("nickname"));
    return out;
  }

  public static Map<String, Object> share(
      ApiContext c, Map<String, Object> record, Map<String, Object> b) {
    if (!(b.get("public") instanceof Boolean)) throw new ApiException("请选择是否公开到作品墙");
    var s = c.store;
    var old =
        s.rows("works").stream()
            .filter(
                w ->
                    eq(w.get("checkinId"), record.get("id"))
                        && eq(w.get("ownerId"), c.account.get("id")))
            .findFirst()
            .orElse(null);
    if (!yes(b.get("public"))) {
      if (old != null && !eq(old.get("status"), "withdrawn")) {
        old.put("status", "withdrawn");
        old.put("revision", integer(old.get("revision")) + 1);
        old.put("updatedAt", StoreRepository.now());
        s.bump();
      }
      return old == null ? obj("status", "private") : old;
    }
    var spot = ShootingSpotService.published(s, b.get("spotId"));
    if (spot == null || !eq(spot.get("pointId"), record.get("pointId")))
      throw new ApiException("请选择该地点已发布的真实机位", 409);
    if (record.get("mediaId") == null) throw new ApiException("作品墙需要一张自己的打卡照片");
    var m = find(s.rows("media"), "id", record.get("mediaId"));
    if (m == null
        || yes(m.get("deleted"))
        || !eq(m.get("ownerId"), c.account.get("id"))
        || yes(m.get("public"))) throw new ApiException("请使用自己的私人打卡照片", 403);
    if (b.containsKey("caption")
        && (!(b.get("caption") instanceof String) || str(b.get("caption")).length() > 500))
      throw new ApiException("公开配文请控制在500字以内");
    String caption = text(b.get("caption"), 500);
    var experience = WorkExperience.from(b.get("experience"));
    if (!experience.isEmpty())
      cn.campus.settings.InteractionFeatures.require(c.store, "experience");
    if (old != null
        && List.of("pending", "approved").contains(old.get("status"))
        && eq(old.get("spotId"), spot.get("id"))
        && eq(old.get("caption"), caption)
        && eq(old.getOrDefault("experience", obj()), experience)) return old;
    var w =
        old == null
            ? obj(
                "id",
                Security.id(),
                "ownerId",
                c.account.get("id"),
                "checkinId",
                record.get("id"),
                "pointId",
                record.get("pointId"),
                "createdAt",
                StoreRepository.now())
            : old;
    w.putAll(
        obj(
            "spotId",
            spot.get("id"),
            "caption",
            caption,
            "experience",
            experience,
            "status",
            "pending",
            "reviewNote",
            "",
            "updatedAt",
            StoreRepository.now(),
            "revision",
            integer(w.get("revision")) + 1));
    if (old == null) s.rows("works").add(w);
    s.bump();
    return w;
  }

  public boolean handle(ApiContext c) throws Exception {
    var s = c.store;
    boolean admin = c.audience.equals("admin");
    if (!admin && c.route("/api/works", "GET")) {
      String point = Objects.toString(c.request.getParameter("pointId"), "");
      String spot = Objects.toString(c.request.getParameter("spotId"), "");
      if (point.isEmpty() && spot.isEmpty()) throw new ApiException("请选择地点或机位");
      var all =
          new ArrayList<>(
              s.rows("works").stream()
                  .filter(
                      w ->
                          visible(s, w)
                              && (point.isEmpty() || eq(w.get("pointId"), point))
                              && (spot.isEmpty() || eq(w.get("spotId"), spot)))
                  .toList());
      Collections.reverse(all);
      String before = Objects.toString(c.request.getParameter("before"), "");
      int start = 0;
      if (!before.isEmpty()) {
        var cursor = find(all, "id", before);
        if (cursor == null) throw new ApiException("作品列表已更新，请刷新", 409);
        start = all.indexOf(cursor) + 1;
      }
      var page = all.subList(start, Math.min(start + 24, all.size()));
      c.send(
          obj(
              "items",
              page.stream().map(w -> publicView(s, w)).toList(),
              "next",
              start + page.size() < all.size() ? page.getLast().get("id") : null));
      return true;
    }
    if (!admin && c.route("/api/my/works", "GET")) {
      c.need();
      c.send(
          obj(
              "items",
              s.rows("works").stream()
                  .filter(w -> eq(w.get("ownerId"), c.account.get("id")))
                  .map(
                      w -> {
                        var out = copy(w);
                        out.remove("ownerId");
                        return out;
                      })
                  .toList()));
      return true;
    }
    var sharing = Pattern.compile("^/api/checkins/([a-f0-9-]+)/sharing$").matcher(c.path);
    if (!admin && sharing.matches() && c.method.equals("PUT")) {
      c.need();
      limits.check(c.account.get("id") + ":work-share", 30);
      if (c.body.keySet().stream()
          .anyMatch(k -> !List.of("public", "spotId", "caption", "experience").contains(k)))
        throw new ApiException("公开参数无效");
      var r =
          s.rows("checkins").stream()
              .filter(
                  x ->
                      eq(x.get("id"), sharing.group(1))
                          && eq(x.get("ownerId"), c.account.get("id")))
              .findFirst()
              .orElse(null);
      if (r == null) throw new ApiException("打卡记录不存在", 404);
      var result = share(c, r, c.body);
      s.save();
      c.send(result);
      return true;
    }
    String base = admin ? "/api/admin/works" : "/api/works";
    var photo = Pattern.compile("^" + base + "/([a-f0-9-]+)/photo$").matcher(c.path);
    if (photo.matches() && c.method.equals("GET")) {
      if (admin) c.need();
      var w = find(s.rows("works"), "id", photo.group(1));
      if (w == null || admin && eq(w.get("status"), "withdrawn") || !admin && !visible(s, w))
        throw new ApiException("作品不可见", 404);
      var r = record(s, w);
      if (r == null) throw new ApiException("作品不存在", 404);
      ShootingSpotService.photo(c, r.get("mediaId"));
      return true;
    }
    if (admin && c.route(base, "GET")) {
      c.need();
      c.send(obj("items", s.rows("works").stream().map(w -> adminView(s, w)).toList()));
      return true;
    }
    var review = Pattern.compile("^/api/admin/works/([a-f0-9-]+)$").matcher(c.path);
    if (admin && review.matches() && c.method.equals("PATCH")) {
      c.need();
      var w = find(s.rows("works"), "id", review.group(1));
      if (w == null) throw new ApiException("作品不存在", 404);
      if (!whole(c.body.get("revision"))
          || integer(c.body.get("revision")) != integer(w.get("revision")))
        throw new ApiException("作品状态已更新，请刷新", 409);
      String status = str(c.body.get("status"));
      if (!(eq(w.get("status"), "pending") && List.of("approved", "rejected").contains(status)
          || eq(w.get("status"), "approved") && status.equals("hidden")))
        throw new ApiException("该作品不能执行此审核操作", 409);
      if (status.equals("approved") && ShootingSpotService.published(s, w.get("spotId")) == null)
        throw new ApiException("机位已下线，不能公开作品", 409);
      decide(c, w, status, text(c.body.get("note"), 1000));
      c.audit("审核打卡作品", w.get("id"), status);
      s.save();
      c.send(adminView(s, w));
      return true;
    }
    var report = Pattern.compile("^/api/works/([a-f0-9-]+)/reports$").matcher(c.path);
    if (!admin && report.matches() && c.method.equals("POST")) {
      c.need();
      limits.check(c.account.get("id") + ":work-report", 10);
      var w = find(s.rows("works"), "id", report.group(1));
      if (!visible(s, w)) throw new ApiException("作品不可见", 404);
      String description = text(c.body.get("description"), 1000);
      if (description.length() < 5) throw new ApiException("请具体描述问题，至少5个字");
      var duplicate =
          s.rows("workReports").stream()
              .filter(
                  r ->
                      eq(r.get("workId"), w.get("id"))
                          && eq(r.get("userId"), c.account.get("id"))
                          && eq(r.get("status"), "pending"))
              .findFirst()
              .orElse(null);
      if (duplicate != null) {
        c.send(obj("id", duplicate.get("id"), "status", "pending"));
        return true;
      }
      var r =
          obj(
              "id",
              Security.id(),
              "workId",
              w.get("id"),
              "pointId",
              w.get("pointId"),
              "userId",
              c.account.get("id"),
              "description",
              description,
              "status",
              "pending",
              "at",
              StoreRepository.now());
      s.rows("workReports").add(r);
      s.bump();
      s.save();
      c.send(obj("id", r.get("id"), "status", "pending"), 201);
      return true;
    }
    if (admin && c.route("/api/admin/work-reports", "GET")) {
      c.need();
      c.send(obj("items", s.rows("workReports")));
      return true;
    }
    var reportReview = Pattern.compile("^/api/admin/work-reports/([a-f0-9-]+)$").matcher(c.path);
    if (admin && reportReview.matches() && c.method.equals("PATCH")) {
      c.need();
      var r = find(s.rows("workReports"), "id", reportReview.group(1));
      if (r == null || !eq(r.get("status"), "pending")) throw new ApiException("举报不存在或已处理", 409);
      String action = str(c.body.get("action"));
      if (!List.of("resolve", "reject", "hide").contains(action)) throw new ApiException("处理方式无效");
      var w = find(s.rows("works"), "id", r.get("workId"));
      String note = text(c.body.get("note"), 1000);
      if (action.equals("hide")
          && w != null
          && List.of("pending", "approved").contains(w.get("status"))) decide(c, w, "hidden", note);
      r.putAll(
          obj(
              "status",
              action.equals("reject") ? "rejected" : "resolved",
              "note",
              note,
              "reviewedAt",
              StoreRepository.now()));
      NotificationService.add(
          s,
          r.get("userId"),
          "work-report:" + r.get("id"),
          "report",
          "作品举报处理结果",
          (action.equals("reject") ? "本次举报暂未采纳" : "你的作品举报已处理") + (note.isEmpty() ? "" : "：" + note),
          "#notifications");
      c.audit("处理作品举报", r.get("id"), action);
      s.bump();
      s.save();
      c.send(r);
      return true;
    }
    return false;
  }

  public static void decide(ApiContext c, Map<String, Object> w, String status, String note) {
    w.putAll(
        obj(
            "status",
            status,
            "reviewNote",
            note,
            "revision",
            integer(w.get("revision")) + 1,
            "reviewedAt",
            StoreRepository.now()));
    NotificationService.add(
        c.store,
        w.get("ownerId"),
        "work:" + w.get("id") + ":" + w.get("revision"),
        "work",
        "作品审核结果",
        (status.equals("approved")
                ? "你的作品已通过审核并公开"
                : status.equals("hidden") ? "你的作品已从作品墙隐藏" : "你的作品暂未通过审核")
            + (note.isEmpty() ? "" : "：" + note),
        "#my-works");
    c.store.bump();
  }
}
