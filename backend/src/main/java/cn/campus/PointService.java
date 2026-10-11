package cn.campus;

import static cn.campus.Json.*;
import static cn.campus.Security.*;

import java.util.*;
import java.util.regex.*;
import org.springframework.stereotype.Service;

@Service
public class PointService {
  private final RateLimiter limits;
  private final LinkedHashMap<String, Long> views = new LinkedHashMap<>();

  public PointService(RateLimiter limits) {
    this.limits = limits;
  }

  public static Map<String, Object> publicPoint(Map<String, Object> p) {
    Map<String, Object> out = copy(p);
    for (String k : List.of("viewCount", "popularityOffset", "popularity", "popularityAdjusted"))
      out.remove(k);
    return out;
  }

  public static Map<String, Object> stats(Map<String, Object> p) {
    long count = Math.max(0, whole(p.get("viewCount")) ? integer(p.get("viewCount")) : 0),
        offset = whole(p.get("popularityOffset")) ? integer(p.get("popularityOffset")) : 0;
    return obj(
        "viewCount",
        count,
        "popularity",
        Math.max(0, Math.min(1000000000L, count + offset)),
        "popularityAdjusted",
        offset != 0);
  }

  public static Map<String, Object> adminPoint(Map<String, Object> p, boolean superAdmin) {
    Map<String, Object> out = superAdmin ? copy(p) : publicPoint(p);
    if (superAdmin) out.putAll(stats(p));
    return out;
  }

  public boolean handle(ApiContext c) throws Exception {
    StoreRepository s = c.store;
    Map<String, Object> b = c.body, a = c.account;
    String r = c.path;
    if (!c.audience.equals("user")) return false;
    if (c.route("/api/catalog", "GET")) {
      List<Map<String, Object>> points =
          s.rows("points").stream().filter(p -> yes(p.get("published"))).toList();
      List<Object> popular =
          points.stream()
              .sorted(
                  Comparator.comparingLong(
                          (Map<String, Object> p) -> integer(stats(p).get("popularity")))
                      .reversed())
              .map(p -> p.get("id"))
              .toList();
      c.send(
          obj(
              "version",
              s.db.get("version"),
              "campus",
              s.campus,
              "points",
              points.stream().map(PointService::publicPoint).toList(),
              "popularPointIds",
              popular,
              "routes",
              s.rows("routes").stream().filter(p -> yes(p.get("active"))).toList(),
              "templates",
              s.rows("templates").stream().filter(p -> yes(p.get("approved"))).toList(),
              "map",
              MapConfigService.publicMap(s.settings())));
      return true;
    }
    Matcher view = Pattern.compile("^/api/points/([a-z0-9-]+)/view$").matcher(r);
    if (view.matches() && c.method.equals("POST")) {
      limits.check(c.ip + ":point-view", 60);
      if (b.keySet().stream().anyMatch(k -> !k.equals("clientId")))
        throw new ApiException("浏览参数无效");
      Map<String, Object> p =
          s.rows("points").stream()
              .filter(x -> eq(x.get("id"), view.group(1)) && yes(x.get("published")))
              .findFirst()
              .orElse(null);
      if (p == null) throw new ApiException("点位不存在", 404);
      String client = str(b.get("clientId"));
      if (!client.matches("[a-f0-9-]{36}")) throw new ApiException("浏览标识无效");
      String key = digest(client + ":" + p.get("id"));
      long now = TimeSource.now();
      if (!views.containsKey(key) || now - views.get(key) >= 30 * 60000L) {
        views.entrySet().removeIf(e -> now - e.getValue() >= 30 * 60000L);
        while (views.size() >= 20000) views.remove(views.keySet().iterator().next());
        p.put("viewCount", Math.min(1000000000L, integer(stats(p).get("viewCount")) + 1));
        s.save();
        views.put(key, now);
      }
      c.send(obj("ok", true));
      return true;
    }
    if (c.route("/api/bookmarks", "POST")) {
      c.need();
      Map<String, Object> p =
          s.rows("points").stream()
              .filter(x -> eq(x.get("id"), b.get("pointId")) && yes(x.get("published")))
              .findFirst()
              .orElse(null);
      if (p == null) throw new ApiException("点位不存在", 404);
      List<Object> bookmarks = list(a.computeIfAbsent("bookmarks", k -> new ArrayList<>()));
      if (!bookmarks.remove(p.get("id"))) bookmarks.add(p.get("id"));
      s.save();
      c.send(obj("bookmarks", bookmarks));
      return true;
    }
    if (c.route("/api/scout/apply", "POST")) {
      c.need();
      if (eq(a.get("scoutStatus"), "approved")) throw new ApiException("你已经是校园探索官");
      if (s.rows("applications").stream()
          .anyMatch(x -> eq(x.get("userId"), a.get("id")) && eq(x.get("status"), "pending")))
        throw new ApiException("申请已经提交");
      String reason = text(b.get("reason"), 1000);
      if (reason.length() < 5) throw new ApiException("申请理由至少 5 个字");
      Map<String, Object> x =
          obj(
              "id",
              id(),
              "userId",
              a.get("id"),
              "reason",
              reason,
              "status",
              "pending",
              "at",
              StoreRepository.now(),
              "note",
              "");
      s.rows("applications").add(x);
      a.put("scoutStatus", "pending");
      s.save();
      c.send(x, 201);
      return true;
    }
    if (c.route("/api/my/community", "GET")) {
      c.need();
      c.send(
          obj(
              "applications",
              s.rows("applications").stream()
                  .filter(x -> eq(x.get("userId"), a.get("id")))
                  .toList(),
              "points",
              s.rows("points").stream()
                  .filter(x -> eq(x.get("authorId"), a.get("id")))
                  .map(PointService::publicPoint)
                  .toList(),
              "reports",
              s.rows("reports").stream().filter(x -> eq(x.get("userId"), a.get("id"))).toList()));
      return true;
    }
    if (c.route("/api/points", "POST")) {
      c.need();
      if (!eq(a.get("scoutStatus"), "approved")) throw new ApiException("请先申请成为校园探索官并等待通过", 403);
      String submission = str(b.get("submissionId"));
      if (!submission.isEmpty() && !submission.matches("[a-zA-Z0-9-]{16,80}"))
        throw new ApiException("发布标识无效");
      if (!submission.isEmpty()) {
        Map<String, Object> old =
            s.rows("points").stream()
                .filter(
                    p ->
                        eq(p.get("authorId"), a.get("id")) && eq(p.get("submissionId"), submission))
                .findFirst()
                .orElse(null);
        if (old != null) {
          c.send(publicPoint(old));
          return true;
        }
      }
      limits.check(a.get("id") + ":publish", 5);
      String name = text(b.get("name"), 60),
          description = text(b.get("description"), 1200),
          condition = text(b.get("condition"), 500);
      Map<String, Object> coords = Campus.coordinate(s.campus, b.get("lng"), b.get("lat"));
      if (name.isEmpty()
          || description.length() < 5
          || condition.isEmpty()
          || !List.of("建筑", "自然", "人文", "运动").contains(b.get("theme")))
        throw new ApiException("请填写点位名称、介绍、分类与拍摄条件");
      Map<String, Object> media = c.ownedMedia(b.get("mediaId"));
      media.put("public", true);
      Map<String, Object> p =
          obj(
              "id",
              id(),
              "name",
              name,
              "description",
              description,
              "condition",
              condition,
              "theme",
              b.get("theme"),
              "fact",
              description,
              "source",
              "校园探索官上传",
              "allowed",
              condition,
              "open",
              true,
              "published",
              true,
              "trust",
              "community",
              "cover",
              "/media/" + media.get("id"),
              "mediaId",
              media.get("id"),
              "authorId",
              a.get("id"),
              "authorName",
              a.get("nickname"),
              "submissionId",
              submission.isEmpty() ? null : submission,
              "createdAt",
              StoreRepository.now(),
              "verifiedAt",
              null,
              "version",
              1);
      p.putAll(coords);
      s.rows("points").add(p);
      s.bump();
      c.audit("社区发布点位", p.get("id"), "");
      s.save();
      c.send(publicPoint(p), 201);
      return true;
    }
    if (c.route("/api/reports", "POST")) {
      c.need();
      if (!eq(a.get("scoutStatus"), "approved")) throw new ApiException("问题反馈需要校园探索官身份", 403);
      limits.check(a.get("id") + ":report", 8);
      Map<String, Object> p =
          s.rows("points").stream()
              .filter(x -> eq(x.get("id"), b.get("pointId")) && yes(x.get("published")))
              .findFirst()
              .orElse(null);
      if (p == null) throw new ApiException("点位不存在", 404);
      String description = text(b.get("description"), 1000);
      if (description.length() < 5) throw new ApiException("请具体描述问题，至少 5 个字");
      Map<String, Object> x =
          obj(
              "id",
              id(),
              "pointId",
              p.get("id"),
              "userId",
              a.get("id"),
              "description",
              description,
              "category",
              text(b.get("category"), 30),
              "status",
              "pending",
              "at",
              StoreRepository.now(),
              "note",
              "");
      s.rows("reports").add(x);
      c.audit("提交点位反馈", p.get("id"), "");
      s.save();
      c.send(x, 201);
      return true;
    }
    return false;
  }
}
