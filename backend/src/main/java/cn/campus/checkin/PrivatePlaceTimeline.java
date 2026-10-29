package cn.campus.checkin;

import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.web.ApiContext;
import java.nio.file.Files;
import java.time.*;
import java.util.*;

/** Private photos are returned only to their owner; no public URL or sharing record is created. */
public final class PrivatePlaceTimeline {
  private PrivatePlaceTimeline() {}

  public static boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("user") || !c.route("/api/my/passport/timeline", "GET")) return false;
    Object owner = c.need().get("id");
    cn.campus.settings.InteractionFeatures.require(c.store, "passport");
    String point = Objects.toString(c.request.getParameter("point"), "");
    String record = Objects.toString(c.request.getParameter("record"), "");
    int page;
    try { page = Integer.parseInt(Objects.toString(c.request.getParameter("page"), "1")); }
    catch (Exception e) { throw new ApiException("页码无效"); }
    if (page < 1 || page > 10000 || point.length() > 100 || record.length() > 100) throw new ApiException("时间线参数无效");
    var all = new ArrayList<Map<String, Object>>();
    var places = new LinkedHashMap<Object, Map<String, Object>>();
    for (var r : c.store.indexed("checkins", "ownerId", str(owner))) {
      var m = find(c.store.rows("media"), "id", r.get("mediaId"));
      if (m == null || !eq(m.get("ownerId"), owner) || yes(m.get("deleted"))
          || !str(m.get("id")).matches("[a-f0-9-]{36}")
          || !Files.isRegularFile(c.store.directory.resolve("media/" + m.get("id") + ".jpg"))) continue;
      var current = find(c.store.rows("points"), "id", r.get("pointId"));
      var p = places.computeIfAbsent(r.get("pointId"), id -> obj("id", id,
          "name", current != null && yes(current.get("published")) ? current.get("name") : r.get("pointName"), "count", 0));
      p.put("count", integer(p.get("count")) + 1);
      if (!point.isEmpty() && !eq(point, r.get("pointId"))) continue;
      if (!record.isEmpty() && !eq(record, r.get("id"))) continue;
      String season = "", time = "";
      try {
        var date = Instant.parse(str(r.get("createdAt"))).atZone(ZoneId.of("Asia/Shanghai"));
        int month = date.getMonthValue();
        season = month >= 3 && month <= 5 ? "spring" : month >= 6 && month <= 8 ? "summer" : month >= 9 && month <= 11 ? "autumn" : "winter";
        time = date.getHour() >= 18 || date.getHour() < 7 ? "evening" : "day";
      } catch (Exception ignored) { }
      all.add(obj("id", r.get("id"), "pointId", r.get("pointId"), "pointName", p.get("name"),
          "date", r.get("createdAt"), "photo", "/media/" + m.get("id"),
          "note", r.getOrDefault("note", ""), "season", season, "time", time,
          "canRetake", current != null && yes(current.get("published")) && yes(current.get("open"))));
    }
    all.sort(Comparator.comparing((Map<String, Object> r) -> str(r.get("date"))).reversed());
    int from = Math.min(all.size(), (page - 1) * 60), to = Math.min(all.size(), from + 60);
    c.send(obj("places", new ArrayList<>(places.values()), "items", all.subList(from, to),
        "page", page, "hasMore", to < all.size(), "total", all.size(),
        "notice", "仅本人可见，日期为打卡记录时间；照片不会自动公开。"));
    return true;
  }
}
