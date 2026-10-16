package cn.campus.point;

import static cn.campus.auth.Security.id;
import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.common.RateLimiter;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.util.*;
import java.util.regex.Pattern;

/** One exclusive reaction per account/place. Dislikes only change that account's ordering. */
public final class PointReactionService {
  private record Summary(Map<String, long[]> counts, Map<String, String> own) {}

  private static Summary summary(StoreRepository store, Map<String, Object> account) {
    Map<String, long[]> counts = new HashMap<>();
    Map<String, String> own = new HashMap<>();
    Set<String> seen = new HashSet<>();
    for (var row : store.rows("pointReactions")) {
      String point = str(row.get("pointId")),
          user = str(row.get("userId")),
          value = str(row.get("value"));
      if (point.isEmpty()
          || user.isEmpty()
          || !List.of("like", "dislike").contains(value)
          || !seen.add(user + ":" + point)) continue;
      var owner = find(store.rows("users"), "id", user);
      if (!cn.campus.miniprogram.WechatTestAccounts.account(owner))
        counts.computeIfAbsent(point, key -> new long[2])[value.equals("like") ? 0 : 1]++;
      if (account != null && eq(account.get("id"), user)) own.put(point, value);
    }
    return new Summary(counts, own);
  }

  public static Set<String> dislikedIds(StoreRepository store, Map<String, Object> account) {
    Set<String> ids = new HashSet<>();
    if (account != null)
      for (var row : store.rows("pointReactions"))
        if (eq(row.get("userId"), account.get("id")) && eq(row.get("value"), "dislike"))
          ids.add(str(row.get("pointId")));
    return ids;
  }

  public static List<Map<String, Object>> publicPoints(
      StoreRepository store, List<Map<String, Object>> points, Map<String, Object> account) {
    var summary = summary(store, account);
    Map<String, Long> spotCounts = new HashMap<>();
    for (var spot : store.rows("shootingSpots"))
      if (eq(spot.get("status"), "published"))
        spotCounts.merge(str(spot.get("pointId")), 1L, Long::sum);
    List<Map<String, Object>> result = new ArrayList<>();
    for (var point : points) {
      var out = PointService.publicPoint(point);
      String key = str(point.get("id"));
      out.put("spotCount", spotCounts.getOrDefault(str(point.get("id")), 0L));
      out.put("likeCount", summary.counts().getOrDefault(key, new long[2])[0]);
      if (account != null) out.put("myReaction", summary.own().get(key));
      result.add(out);
    }
    result.sort(Comparator.comparing(p -> eq(p.get("myReaction"), "dislike")));
    return result;
  }

  public static List<Map<String, Object>> adminPoints(StoreRepository store, boolean superAdmin) {
    var summary = summary(store, null);
    return store.rows("points").stream()
        .map(
            point -> {
              var out = PointService.adminPoint(point, superAdmin);
              var count = summary.counts().getOrDefault(str(point.get("id")), new long[2]);
              out.put("likeCount", count[0]);
              out.put("dislikeCount", count[1]);
              return out;
            })
        .toList();
  }

  public static boolean handle(ApiContext context, RateLimiter limits) throws Exception {
    var match = Pattern.compile("^/api/points/([a-z0-9-]+)/reaction$").matcher(context.path);
    if (!match.matches() || !context.method.equals("PUT")) return false;
    context.need();
    limits.check(context.account.get("id") + ":point-reaction", 90);
    if (!context.body.containsKey("value")
        || context.body.size() != 1
        || context.body.get("value") != null
            && !List.of("like", "dislike").contains(context.body.get("value")))
      throw new ApiException("请选择喜欢、不喜欢或取消");
    String pointId = match.group(1);
    var point =
        context.store.rows("points").stream()
            .filter(p -> eq(p.get("id"), pointId) && yes(p.get("published")))
            .findFirst()
            .orElseThrow(() -> new ApiException("点位不存在", 404));
    var rows = context.store.rows("pointReactions");
    var existing =
        rows.stream()
            .filter(
                r ->
                    eq(r.get("pointId"), pointId) && eq(r.get("userId"), context.account.get("id")))
            .findFirst()
            .orElse(null);
    Object value = context.body.get("value");
    if (existing == null ? value != null : !eq(existing.get("value"), value)) {
      rows.removeIf(
          r -> eq(r.get("pointId"), pointId) && eq(r.get("userId"), context.account.get("id")));
      if (value != null)
        rows.add(
            obj(
                "id",
                id(),
                "pointId",
                pointId,
                "userId",
                context.account.get("id"),
                "value",
                value,
                "at",
                StoreRepository.now()));
      context.store.bump();
      context.store.save();
    }
    context.send(
        obj(
            "point",
            publicPoints(context.store, List.of(point), context.account).getFirst(),
            "version",
            context.store.db.get("version")));
    return true;
  }
}
