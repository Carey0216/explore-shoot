package cn.campus.checkin;

import static cn.campus.common.Json.*;

import java.time.Instant;
import java.util.*;

/** Recomputed from committed checkins; preview, plans and legacy task completion are not unlocks. */
public final class CollectionGrowth {
  private CollectionGrowth() {}

  public static List<Map<String, Object>> milestones(
      List<Map<String, Object>> records, Map<String, Object> atlas,
      List<Map<String, Object>> topics, Set<Object> publicPoints) {
    var actual = records.stream().filter(r -> eq(r.get("kind"), "checkin"))
        .filter(r -> validTime(r.get("createdAt")))
        .sorted(Comparator.comparing(r -> str(r.get("createdAt")))).toList();
    var buildings = rows(atlas.get("buildings")).stream()
        .filter(b -> eq(b.get("frame"), "photo") && (!list(b.get("pointIds")).isEmpty() || yes(b.get("growthUnavailable")))).toList();
    var firstVisits = new LinkedHashMap<Object, String>();
    actual.forEach(r -> firstVisits.putIfAbsent(r.get("pointId"), str(r.get("createdAt"))));
    var firstBuildings = new LinkedHashMap<Object, String>();
    // pointIds already contains only visible links. A hidden alternative does not invalidate
    // a real visit at a visible linked place; an entirely hidden building still keeps its goal.
    for (var b : buildings) list(b.get("pointIds")).stream().filter(firstVisits::containsKey)
        .map(firstVisits::get).min(String::compareTo).ifPresent(at -> firstBuildings.put(b.get("id"), at));
    var result = new ArrayList<Map<String, Object>>();
    result.add(view("first-light", "first", "第一次点亮", "First light",
        "在关联地点留下真实打卡，点亮第一栋校园建筑。", "Check in at a linked place to light your first building.",
        Math.min(1, firstBuildings.size()), 1,
        firstBuildings.values().stream().min(String::compareTo).orElse(""), "badge-03", List.of()));
    var areas = new TreeMap<String, List<Map<String, Object>>>();
    for (var b : buildings) {
      String area = str(b.get("area")).strip();
      if (!area.isEmpty()) areas.computeIfAbsent(area, k -> new ArrayList<>()).add(b);
    }
    for (var entry : areas.entrySet()) {
      var group = entry.getValue();
      int done = (int)group.stream().filter(b -> firstBuildings.containsKey(b.get("id"))).count();
      String at = done == group.size() ? group.stream().map(b -> firstBuildings.get(b.get("id")))
          .max(String::compareTo).orElse("") : "";
      var next = group.stream().filter(b -> !firstBuildings.containsKey(b.get("id")))
          .flatMap(b -> list(b.get("pointIds")).stream()).distinct().limit(6).toList();
      result.add(view("area:" + entry.getKey(), "area", "集齐 · " + entry.getKey(),
          "Area complete · " + entry.getKey(), "点亮这个片区中所有已关联的影像建筑。",
          "Light every linked building in this area.", done, group.size(), at, "badge-04", next));
    }
    for (var topic : topics) {
      if (!cn.campus.content.SeasonTopicService.visible(topic, cn.campus.common.TimeSource.now())
          || !Set.of("spring", "summer", "autumn", "winter", "blossom", "snow").contains(str(topic.get("theme")))) continue;
      if (!validTime(topic.get("startsAt")) || !validTime(topic.get("endsAt"))) continue;
      Instant start = Instant.parse(str(topic.get("startsAt"))), end = Instant.parse(str(topic.get("endsAt")));
      if (!end.isAfter(start)) continue;
      var ids = list(topic.get("pointIds")).stream().distinct().toList();
      if (!publicPoints.containsAll(ids)) continue; // Never reduce the goal because a linked place was hidden.
      if (ids.isEmpty()) continue;
      var visited = new LinkedHashMap<Object, String>();
      for (var r : actual) {
        Instant at = Instant.parse(str(r.get("createdAt")));
        if (ids.contains(r.get("pointId")) && !at.isBefore(start) && at.isBefore(end))
          visited.putIfAbsent(r.get("pointId"), str(r.get("createdAt")));
      }
      boolean complete = visited.size() == ids.size();
      var milestone = view("season:" + topic.get("id"), "season", "季节收藏 · " + topic.get("title"),
          "Season collection · " + topic.get("title"), "在专题期间，打卡全部关联地点。",
          "Check in at every linked place during this topic's dates.", visited.size(), ids.size(),
          complete ? visited.values().stream().max(String::compareTo).orElse("") : "", "badge-05",
          ids.stream().filter(id -> !visited.containsKey(id)).limit(6).toList());
      milestone.put("startsAt", topic.get("startsAt"));
      milestone.put("endsAt", topic.get("endsAt"));
      result.add(milestone);
    }
    return result;
  }

  private static Map<String, Object> view(String id, String kind, String title, String titleEn,
      String description, String descriptionEn, int progress, int target, String completedAt,
      String badge, List<?> next) {
    return obj("id", id, "kind", kind, "title", title, "titleEn", titleEn,
        "description", description, "descriptionEn", descriptionEn, "progress", progress,
        "target", target, "earned", target > 0 && progress >= target,
        "completedAt", completedAt, "badgePreset", badge, "nextPointIds", next);
  }

  private static boolean validTime(Object value) {
    try { Instant.parse(str(value)); return true; } catch (Exception e) { return false; }
  }
}
