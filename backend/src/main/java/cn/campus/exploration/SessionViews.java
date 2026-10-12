package cn.campus.exploration;

import static cn.campus.common.Json.*;

import cn.campus.common.TimeSource;
import cn.campus.storage.StoreRepository;
import java.util.*;

/** 统一会话展示：下线阻断、完成任务数、照片数；计时以服务端时钟为准。 */
public final class SessionViews {
  public static Map<String, Object> view(StoreRepository s, Map<String, Object> session) {
    List<Object> blocked = new ArrayList<>();
    for (Map<String, Object> t : rows(session.get("tasks")))
      if (eq(t.get("status"), "pending")
          && s.rows("points").stream()
              .noneMatch(
                  p ->
                      eq(p.get("id"), t.get("pointId"))
                          && yes(p.get("published"))
                          && yes(p.get("open")))) blocked.add(t.get("pointName"));
    if (s.rows("routes").stream()
            .noneMatch(r -> eq(r.get("id"), session.get("routeId")) && yes(r.get("active")))
        && rows(session.get("tasks")).stream().anyMatch(t -> eq(t.get("status"), "pending")))
      blocked.add("路线已停用");
    Map<String, Object> out = copy(session);
    out.put("blocked", blocked);
    out.put(
        "completedTasks",
        rows(session.get("tasks")).stream().filter(t -> eq(t.get("status"), "done")).count());
    out.put(
        "photoCount",
        rows(session.get("tasks")).stream()
            .filter(t -> t.get("mediaId") != null && !str(t.get("mediaId")).isBlank())
            .count());
    return out;
  }

  public static long elapsed(Map<String, Object> s) {
    return integer(s.get("elapsed"))
        + (eq(s.get("status"), "active") ? TimeSource.now() - integer(s.get("lastResume")) : 0);
  }
}
