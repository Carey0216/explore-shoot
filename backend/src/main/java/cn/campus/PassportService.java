package cn.campus;

import static cn.campus.Json.*;

import java.util.*;
import org.springframework.stereotype.Service;

/** Private progress is calculated from the owner's persisted records, including legacy tasks. */
@Service
public class PassportService {
  public boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("user") || !c.route("/api/my/library", "GET")) return false;
    c.need();
    List<Map<String, Object>> checkins =
        c.store.rows("checkins").stream()
            .filter(x -> eq(x.get("ownerId"), c.account.get("id")))
            .toList();
    List<Map<String, Object>> sessions =
        c.store.rows("sessions").stream()
            .filter(x -> eq(x.get("ownerId"), c.account.get("id")))
            .toList();
    List<Map<String, Object>> records = records(checkins, sessions);
    c.send(
        obj(
            "checkins",
            checkins,
            "sessions",
            sessions,
            "records",
            records,
            "summary",
            summary(
                records,
                c.store.rows("points").stream().filter(p -> yes(p.get("published"))).toList())));
    return true;
  }

  public static List<Map<String, Object>> records(
      List<Map<String, Object>> checkins, List<Map<String, Object>> sessions) {
    List<Map<String, Object>> records = new ArrayList<>();
    for (var c : checkins) {
      var record = copy(c);
      record.put("kind", "checkin");
      records.add(record);
    }
    for (var s : sessions)
      for (var task : rows(s.get("tasks")))
        if (eq(task.get("status"), "done")) {
          Object date = task.get("completedAt");
          if (date == null) date = s.get("endedAt");
          if (date == null) date = s.get("createdAt");
          records.add(
              obj(
                  "id",
                  s.get("id") + ":" + task.get("id"),
                  "pointId",
                  task.get("pointId"),
                  "pointName",
                  task.get("pointName"),
                  "shotTitle",
                  task.get("title"),
                  "note",
                  s.getOrDefault("feedback", ""),
                  "mediaId",
                  task.get("mediaId"),
                  "createdAt",
                  date,
                  "legacyTime",
                  task.get("completedAt") == null,
                  "kind",
                  "task",
                  "sessionId",
                  s.get("id")));
        }
    records.sort(
        Comparator.comparing((Map<String, Object> r) -> str(r.get("createdAt"))).reversed());
    return records;
  }

  public static Map<String, Object> summary(
      List<Map<String, Object>> records, List<Map<String, Object>> points) {
    Set<Object> ids = new LinkedHashSet<>();
    records.forEach(r -> ids.add(r.get("pointId")));
    return obj(
        "visits",
        records.size(),
        "unique",
        ids.size(),
        "current",
        points.stream().filter(p -> ids.contains(p.get("id"))).count(),
        "total",
        points.size(),
        "photos",
        records.stream()
            .filter(r -> r.get("mediaId") != null && !str(r.get("mediaId")).isBlank())
            .count(),
        "ids",
        new ArrayList<>(ids));
  }
}
