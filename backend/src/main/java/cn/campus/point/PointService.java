package cn.campus.point;

import static cn.campus.auth.Security.*;
import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.common.RateLimiter;
import cn.campus.common.TimeSource;
import cn.campus.maps.Campus;
import cn.campus.maps.MapConfigService;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
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

  public boolean handle(ApiContext context) throws Exception {
    StoreRepository store = context.store;
    Map<String, Object> body = context.body, account = context.account;
    String r = context.path;
    if (!context.audience.equals("user")) return false;
    if (context.route("/api/catalog", "GET")) {
      List<Map<String, Object>> points =
          store.rows("points").stream().filter(p -> yes(p.get("published"))).toList();
      List<Object> popular =
          points.stream()
              .sorted(
                  Comparator.comparingLong(
                          (Map<String, Object> p) -> integer(stats(p).get("popularity")))
                      .reversed())
              .map(p -> p.get("id"))
              .toList();
      context.send(
          obj(
              "version",
              store.db.get("version"),
              "campus",
              store.campus,
              "points",
              points.stream().map(PointService::publicPoint).toList(),
              "popularPointIds",
              popular,
              "routes",
              store.rows("routes").stream().filter(p -> yes(p.get("active"))).toList(),
              "templates",
              store.rows("templates").stream().filter(p -> yes(p.get("approved"))).toList(),
              "map",
              MapConfigService.publicMap(store.settings())));
      return true;
    }
    Matcher view = Pattern.compile("^/api/points/([a-z0-9-]+)/view$").matcher(r);
    if (view.matches() && context.method.equals("POST")) {
      limits.check(context.ip + ":point-view", 60);
      if (body.keySet().stream().anyMatch(k -> !k.equals("clientId")))
        throw new ApiException("浏览参数无效");
      Map<String, Object> p =
          store.rows("points").stream()
              .filter(x -> eq(x.get("id"), view.group(1)) && yes(x.get("published")))
              .findFirst()
              .orElse(null);
      if (p == null) throw new ApiException("点位不存在", 404);
      String client = str(body.get("clientId"));
      if (!client.matches("[a-f0-9-]{36}")) throw new ApiException("浏览标识无效");
      String key = digest(client + ":" + p.get("id"));
      long now = TimeSource.now();
      if (!views.containsKey(key) || now - views.get(key) >= 30 * 60000L) {
        views.entrySet().removeIf(e -> now - e.getValue() >= 30 * 60000L);
        while (views.size() >= 20000) views.remove(views.keySet().iterator().next());
        p.put("viewCount", Math.min(1000000000L, integer(stats(p).get("viewCount")) + 1));
        store.save();
        views.put(key, now);
      }
      context.send(obj("ok", true));
      return true;
    }
    if (context.route("/api/bookmarks", "POST")) {
      context.need();
      Map<String, Object> p =
          store.rows("points").stream()
              .filter(x -> eq(x.get("id"), body.get("pointId")) && yes(x.get("published")))
              .findFirst()
              .orElse(null);
      if (p == null) throw new ApiException("点位不存在", 404);
      List<Object> bookmarks = list(account.computeIfAbsent("bookmarks", k -> new ArrayList<>()));
      if (!bookmarks.remove(p.get("id"))) bookmarks.add(p.get("id"));
      store.save();
      context.send(obj("bookmarks", bookmarks));
      return true;
    }
    if (context.route("/api/scout/apply", "POST")) {
      context.need();
      if (eq(account.get("scoutStatus"), "approved")) throw new ApiException("你已经是校园探索官");
      if (store.rows("applications").stream()
          .anyMatch(x -> eq(x.get("userId"), account.get("id")) && eq(x.get("status"), "pending")))
        throw new ApiException("申请已经提交");
      String reason = text(body.get("reason"), 1000);
      if (reason.length() < 5) throw new ApiException("申请理由至少 5 个字");
      Map<String, Object> x =
          obj(
              "id",
              id(),
              "userId",
              account.get("id"),
              "reason",
              reason,
              "status",
              "pending",
              "at",
              StoreRepository.now(),
              "note",
              "");
      store.rows("applications").add(x);
      account.put("scoutStatus", "pending");
      store.save();
      context.send(x, 201);
      return true;
    }
    if (context.route("/api/my/community", "GET")) {
      context.need();
      context.send(
          obj(
              "applications",
              store.rows("applications").stream()
                  .filter(x -> eq(x.get("userId"), account.get("id")))
                  .toList(),
              "points",
              store.rows("points").stream()
                  .filter(x -> eq(x.get("authorId"), account.get("id")))
                  .map(PointService::publicPoint)
                  .toList(),
              "reports",
              store.rows("reports").stream()
                  .filter(x -> eq(x.get("userId"), account.get("id")))
                  .toList()));
      return true;
    }
    if (context.route("/api/points", "POST")) {
      context.need();
      if (!eq(account.get("scoutStatus"), "approved"))
        throw new ApiException("请先申请成为校园探索官并等待通过", 403);
      String submission = str(body.get("submissionId"));
      if (!submission.isEmpty() && !submission.matches("[a-zA-Z0-9-]{16,80}"))
        throw new ApiException("发布标识无效");
      if (!submission.isEmpty()) {
        Map<String, Object> old =
            store.rows("points").stream()
                .filter(
                    p ->
                        eq(p.get("authorId"), account.get("id"))
                            && eq(p.get("submissionId"), submission))
                .findFirst()
                .orElse(null);
        if (old != null) {
          context.send(publicPoint(old));
          return true;
        }
      }
      limits.check(account.get("id") + ":publish", 5);
      String name = text(body.get("name"), 60),
          description = text(body.get("description"), 1200),
          condition = text(body.get("condition"), 500);
      Map<String, Object> coords =
          Campus.coordinate(store.campus, body.get("lng"), body.get("lat"));
      if (name.isEmpty()
          || description.length() < 5
          || condition.isEmpty()
          || !List.of("建筑", "自然", "人文", "运动").contains(body.get("theme")))
        throw new ApiException("请填写点位名称、介绍、分类与拍摄条件");
      Map<String, Object> media = context.ownedMedia(body.get("mediaId"));
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
              body.get("theme"),
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
              account.get("id"),
              "authorName",
              account.get("nickname"),
              "submissionId",
              submission.isEmpty() ? null : submission,
              "createdAt",
              StoreRepository.now(),
              "verifiedAt",
              null,
              "version",
              1);
      p.putAll(coords);
      store.rows("points").add(p);
      store.bump();
      context.audit("社区发布点位", p.get("id"), "");
      store.save();
      context.send(publicPoint(p), 201);
      return true;
    }
    if (context.route("/api/reports", "POST")) {
      context.need();
      if (!eq(account.get("scoutStatus"), "approved")) throw new ApiException("问题反馈需要校园探索官身份", 403);
      limits.check(account.get("id") + ":report", 8);
      Map<String, Object> p =
          store.rows("points").stream()
              .filter(x -> eq(x.get("id"), body.get("pointId")) && yes(x.get("published")))
              .findFirst()
              .orElse(null);
      if (p == null) throw new ApiException("点位不存在", 404);
      String description = text(body.get("description"), 1000);
      if (description.length() < 5) throw new ApiException("请具体描述问题，至少 5 个字");
      Map<String, Object> x =
          obj(
              "id",
              id(),
              "pointId",
              p.get("id"),
              "userId",
              account.get("id"),
              "description",
              description,
              "category",
              text(body.get("category"), 30),
              "status",
              "pending",
              "at",
              StoreRepository.now(),
              "note",
              "");
      store.rows("reports").add(x);
      context.audit("提交点位反馈", p.get("id"), "");
      store.save();
      context.send(x, 201);
      return true;
    }
    return false;
  }
}
