package cn.campus.checkin;

import static cn.campus.common.Json.*;

import cn.campus.exploration.SessionViews;
import cn.campus.point.PointService;
import cn.campus.web.ApiContext;
import java.util.*;
import org.springframework.stereotype.Service;

/** Private progress is calculated from the owner's persisted records, including legacy tasks. */
@Service
public class PassportService {
  public boolean handle(ApiContext context) throws Exception {
    if (!context.audience.equals("user") || !context.route("/api/my/library", "GET")) return false;
    context.need();
    List<Map<String, Object>> checkins =
        context.store.rows("checkins").stream()
            .filter(x -> eq(x.get("ownerId"), context.account.get("id")))
            .toList();
    List<Map<String, Object>> sessions =
        context.store.rows("sessions").stream()
            .filter(x -> eq(x.get("ownerId"), context.account.get("id")))
            .map(x -> SessionViews.view(context.store, x))
            .toList();
    List<Map<String, Object>> records = records(checkins, sessions);
    context.send(
        obj(
            "checkins",
            checkins,
            "sessions",
            sessions,
            "savedPoints",
            cn.campus.point.PointReactionService.publicPoints(context.store, context.store.rows("points").stream()
                .filter(
                    p ->
                        yes(p.get("published"))
                            && list(context.account.get("bookmarks")).contains(p.get("id")))
                .toList(), context.account),
            "overview",
            obj(
                "explorations",
                sessions.size(),
                "bookmarks",
                list(context.account.get("bookmarks")).size()),
            "records",
            records,
            "summary",
            summary(
                records,
                context.store.rows("points").stream()
                    .filter(p -> yes(p.get("published")))
                    .toList())));
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
