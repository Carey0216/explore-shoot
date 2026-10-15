package cn.campus.notification;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.util.*;
import org.springframework.stereotype.Service;

/** Private inbox. The business transaction saves both the decision and its notification. */
@Service
public class NotificationService {
  public static void add(
      StoreRepository store,
      Object userId,
      String event,
      String type,
      String title,
      String message,
      String target) {
    if (userId == null || find(store.rows("users"), "id", userId) == null) return;
    if (store.rows("notifications").stream()
        .anyMatch(n -> eq(n.get("userId"), userId) && eq(n.get("event"), event))) return;
    store
        .rows("notifications")
        .add(
            obj(
                "id",
                Security.id(),
                "userId",
                userId,
                "event",
                event,
                "type",
                type,
                "title",
                title,
                "message",
                message,
                "target",
                target,
                "createdAt",
                StoreRepository.now(),
                "readAt",
                null));
  }

  public boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("user") || !c.path.startsWith("/api/notifications")) return false;
    c.need();
    var mine =
        c.store.rows("notifications").stream()
            .filter(n -> eq(n.get("userId"), c.account.get("id")))
            .toList();
    long unread = mine.stream().filter(n -> n.get("readAt") == null).count();
    if (c.route("/api/notifications/summary", "GET")) {
      c.send(obj("unread", unread));
      return true;
    }
    if (c.route("/api/notifications", "GET")) {
      var ordered = new ArrayList<>(mine);
      Collections.reverse(ordered);
      String before = Objects.toString(c.request.getParameter("before"), "");
      int start = 0;
      if (!before.isEmpty()) {
        var cursor = find(ordered, "id", before);
        if (cursor == null) throw new ApiException("通知分页已失效，请刷新");
        start = ordered.indexOf(cursor) + 1;
      }
      var page = ordered.subList(start, Math.min(start + 30, ordered.size()));
      c.send(
          obj(
              "items",
              page.stream()
                  .map(
                      n -> {
                        var out = copy(n);
                        out.remove("userId");
                        out.remove("event");
                        return out;
                      })
                  .toList(),
              "unread",
              unread,
              "next",
              start + page.size() < ordered.size() ? page.getLast().get("id") : null));
      return true;
    }
    if (c.route("/api/notifications/read", "POST")) {
      if (c.body.size() != 1 || !(yes(c.body.get("all")) || c.body.get("id") instanceof String))
        throw new ApiException("通知标记参数无效");
      if (c.body.containsKey("id") && find(mine, "id", c.body.get("id")) == null)
        throw new ApiException("通知不存在", 404);
      boolean changed = false;
      for (var n : mine)
        if (n.get("readAt") == null
            && (yes(c.body.get("all")) || eq(n.get("id"), c.body.get("id")))) {
          n.put("readAt", StoreRepository.now());
          changed = true;
        }
      if (changed) c.store.save();
      c.send(obj("ok", true));
      return true;
    }
    return false;
  }
}
