package cn.campus.point;

import static cn.campus.common.Json.*;

import cn.campus.common.*;
import cn.campus.storage.StoreRepository;
import java.time.*;
import java.util.*;

/**
 * Departure checks use explicit opening windows; prose and straight-line estimates stay labelled.
 */
public final class PlanExecution {
  public static final List<String> CHECKS =
      List.of("battery", "storage", "weather", "access", "gear");

  public static List<Map<String, Object>> windows(Object raw) {
    if (!(raw instanceof List<?> values) || values.size() > 14) throw new ApiException("开放时段最多14组");
    var out = new ArrayList<Map<String, Object>>();
    for (Object value : values) {
      if (!(value instanceof Map<?, ?>)) throw new ApiException("开放时段格式无效");
      var b = map(value);
      RequestValues.fields(b, "days", "start", "end");
      if (!(b.get("days") instanceof List<?> days)
          || days.isEmpty()
          || days.size() > 7
          || new HashSet<>(days).size() != days.size()
          || days.stream().anyMatch(d -> !whole(d) || integer(d) < 1 || integer(d) > 7))
        throw new ApiException("开放星期为1至7");
      String start = RequestValues.text(b, "start", "", 5, true),
          end = RequestValues.text(b, "end", "", 5, true);
      if (!start.matches("[0-2][0-9]:[0-5][0-9]") || !end.matches("[0-2][0-9]:[0-5][0-9]"))
        throw new ApiException("开放时间格式为HH:mm");
      try {
        LocalTime.parse(start);
        LocalTime.parse(end);
      } catch (RuntimeException e) {
        throw new ApiException("开放时间无效");
      }
      if (start.equals(end)) throw new ApiException("开始与结束时间不能相同");
      out.add(obj("days", List.copyOf(days), "start", start, "end", end));
    }
    return out;
  }

  public static Map<String, Object> settings(Map<String, Object> body, Map<String, Object> old) {
    var out = obj();
    String departure =
        RequestValues.text(
            body, "departure", old == null ? "" : str(old.get("departure")), 40, false);
    if (!departure.isBlank())
      try {
        Instant.parse(departure);
      } catch (RuntimeException e) {
        throw new ApiException("出发时间无效");
      }
    out.put("departure", departure);
    Object checks =
        body.getOrDefault("checklist", old == null ? obj() : old.getOrDefault("checklist", obj()));
    if (!(checks instanceof Map<?, ?>) || !new HashSet<>(CHECKS).containsAll(map(checks).keySet()))
      throw new ApiException("出发清单项目无效");
    var selected = obj();
    for (String key : CHECKS) selected.put(key, RequestValues.flag(map(checks), key, false));
    out.put("checklist", selected);
    return out;
  }

  static boolean within(List<Map<String, Object>> windows, ZonedDateTime at) {
    LocalTime time = at.toLocalTime();
    int day = at.getDayOfWeek().getValue(), previous = at.minusDays(1).getDayOfWeek().getValue();
    for (var w : windows) {
      LocalTime start = LocalTime.parse(str(w.get("start"))),
          end = LocalTime.parse(str(w.get("end")));
      var days = list(w.get("days"));
      if (start.isBefore(end)) {
        if (days.stream().anyMatch(d -> integer(d) == day)
            && !time.isBefore(start)
            && time.isBefore(end)) return true;
      } else if ((days.stream().anyMatch(d -> integer(d) == day) && !time.isBefore(start))
          || (days.stream().anyMatch(d -> integer(d) == previous) && time.isBefore(end)))
        return true;
    }
    return false;
  }

  public static double metres(Map<String, Object> a, Map<String, Object> b) {
    double x = Math.toRadians(num(a.get("lat"))),
        y = Math.toRadians(num(b.get("lat"))),
        dx = y - x,
        dy = Math.toRadians(num(b.get("lng")) - num(a.get("lng")));
    double h =
        Math.sin(dx / 2) * Math.sin(dx / 2)
            + Math.cos(x) * Math.cos(y) * Math.sin(dy / 2) * Math.sin(dy / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }

  public static Map<String, Object> evaluate(StoreRepository store, Map<String, Object> plan) {
    var warnings = new ArrayList<Map<String, Object>>();
    var stops = new ArrayList<Map<String, Object>>();
    Map<String, Object> previous = null;
    int elapsed = 0;
    ZonedDateTime start = null;
    try {
      start = Instant.parse(str(plan.get("departure"))).atZone(ZoneId.of("Asia/Shanghai"));
    } catch (RuntimeException ignored) {
    }
    for (var item : rows(plan.get("items"))) {
      var spot = ShootingSpotService.published(store, item.get("spotId"));
      String id = str(item.get("id"));
      if (spot == null) {
        warnings.add(obj("itemId", id, "level", "conflict", "message", "机位已下线，请移除或重新选择"));
        continue;
      }
      var point = find(store.rows("points"), "id", spot.get("pointId"));
      if (previous != null) elapsed += (int) Math.ceil(metres(previous, spot) / 60);
      var arrival = start == null ? null : start.plusMinutes(elapsed);
      stops.add(
          obj(
              "itemId",
              id,
              "title",
              item.get("title"),
              "arrival",
              arrival == null ? null : arrival.toInstant().toString(),
              "minutes",
              item.getOrDefault("minutes", 5)));
      if (eq(spot.get("availability"), "closed") || point != null && !yes(point.get("open")))
        warnings.add(
            obj("itemId", id, "level", "conflict", "message", item.get("title") + "：当前标记为关闭"));
      var windows = rows(spot.get("openingWindows"));
      if (arrival != null && !windows.isEmpty() && !within(windows, arrival))
        warnings.add(
            obj(
                "itemId",
                id,
                "level",
                "conflict",
                "message",
                item.get("title") + "：预计到达时间不在开放时段内"));
      if (arrival != null
          && !windows.isEmpty()
          && within(windows, arrival)
          && !within(windows, arrival.plusMinutes(integer(item.getOrDefault("minutes", 5)) - 1)))
        warnings.add(
            obj(
                "itemId",
                id,
                "level",
                "conflict",
                "message",
                item.get("title") + "：预计拍摄期间可能闭馆，请缩短停留或调整顺序"));
      if (windows.isEmpty())
        warnings.add(
            obj("itemId", id, "level", "notice", "message", item.get("title") + "：开放时段待核对"));
      elapsed += (int) integer(item.getOrDefault("minutes", 5));
      previous = spot;
    }
    return obj(
        "stops",
        stops,
        "warnings",
        warnings,
        "estimatedMinutes",
        (int) Math.ceil(elapsed * 1.2),
        "estimateNotice",
        "步行按点间直线距离粗估并预留20%余量，不代表实际道路；请以导航和现场通行为准。",
        "timezone",
        "Asia/Shanghai");
  }
}
