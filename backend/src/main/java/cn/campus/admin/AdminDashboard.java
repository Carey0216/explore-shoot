package cn.campus.admin;

import static cn.campus.common.Json.*;

import cn.campus.common.TimeSource;
import cn.campus.storage.StoreRepository;
import java.time.Instant;
import java.util.*;

/** 后台概览的业务统计；不包含浏览量、精确轨迹或私人照片。 */
public final class AdminDashboard {
  public static Map<String, Object> summarize(StoreRepository s) {
    long now = TimeSource.now();
    return obj(
        "publishedPoints",
        s.rows("points").stream().filter(p -> yes(p.get("published"))).count(),
        "users",
        s.rows("users").stream().filter(u -> !yes(u.get("deleted"))).count(),
        "pendingApplications",
        s.rows("applications").stream().filter(a -> eq(a.get("status"), "pending")).count(),
        "communityPoints",
        s.rows("points").stream().filter(p -> eq(p.get("trust"), "community")).count(),
        "pendingReports",
        s.rows("reports").stream().filter(r -> eq(r.get("status"), "pending")).count(),
        "activeInvites",
        s.rows("invites").stream()
            .filter(
                i ->
                    yes(i.get("enabled"))
                        && integer(i.get("used")) < integer(i.get("maxUses"))
                        && expiresAfter(i.get("expiresAt"), now))
            .count(),
        "inviteUses",
        s.rows("invites").stream().mapToLong(i -> integer(i.get("used"))).sum(),
        "activeRoutes",
        s.rows("routes").stream().filter(r -> yes(r.get("active"))).count(),
        "approvedTemplates",
        s.rows("templates").stream().filter(t -> yes(t.get("approved"))).count(),
        "explorations",
        s.rows("sessions").size(),
        "completedExplorations",
        s.rows("sessions").stream().filter(x -> eq(x.get("status"), "completed")).count());
  }

  private static boolean expiresAfter(Object value, long now) {
    try {
      return Instant.parse(str(value)).toEpochMilli() > now;
    } catch (RuntimeException e) {
      return false;
    }
  }
}
