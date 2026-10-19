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
  public static final Set<String> CATEGORIES =
      Set.of("all", "review", "activity", "message", "announcement", "system");

  public static String category(Map<String, Object> n) {
    String type = str(n.get("type"));
    if (type.equals("activity")) return "activity";
    if (type.equals("announcement")) return "announcement";
    if (type.contains("message") || type.equals("conversation")) return "message";
    if (type.matches(".*(review|report|scout|application|work|point|spot).*")) return "review";
    return "system";
  }

  public static Map<String, Object> preferences(StoreRepository store, Object user) {
    var p = find(store.rows("notificationSettings"), "userId", user);
    return p == null ? obj("mutedUntil", "") : obj("mutedUntil", p.get("mutedUntil"));
  }

  public static boolean muted(StoreRepository store, Object user) {
    try {
      return java.time.Instant.parse(str(preferences(store, user).get("mutedUntil"))).toEpochMilli()
          > cn.campus.common.TimeSource.now();
    } catch (Exception e) {
      return false;
    }
  }

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
    if (c.route("/api/notifications/preferences", "GET")) {
      c.send(preferences(c.store, c.account.get("id")));
      return true;
    }
    if (c.route("/api/notifications/preferences", "PATCH")) {
      cn.campus.common.RequestValues.fields(c.body, "hours");
      if (!whole(c.body.get("hours"))
          || !Set.of(0L, 1L, 8L, 24L).contains(integer(c.body.get("hours"))))
        throw new ApiException("请选择关闭、1小时、8小时或24小时免打扰");
      var p = find(c.store.rows("notificationSettings"), "userId", c.account.get("id"));
      if (p == null) {
        p = obj("id", Security.id(), "userId", c.account.get("id"));
        c.store.rows("notificationSettings").add(p);
        p = c.store.rows("notificationSettings").getLast();
      }
      int hours = (int) integer(c.body.get("hours"));
      p.put(
          "mutedUntil",
          hours == 0
              ? ""
              : java.time.Instant.ofEpochMilli(cn.campus.common.TimeSource.now() + hours * 3600000L)
                  .toString());
      c.store.save();
      c.send(preferences(c.store, c.account.get("id")));
      return true;
    }
    var mine =
        c.store.rows("notifications").stream()
            .filter(n -> eq(n.get("userId"), c.account.get("id")))
            .toList();
    long unread = mine.stream().filter(n -> n.get("readAt") == null).count();
    if (c.route("/api/notifications/summary", "GET")) {
      c.send(
          obj(
              "unread",
              unread,
              "badge",
              muted(c.store, c.account.get("id")) ? 0 : unread,
              "preferences",
              preferences(c.store, c.account.get("id"))));
      return true;
    }
    if (c.route("/api/notifications", "GET")) {
      String category = Objects.toString(c.request.getParameter("category"), "all");
      if (!CATEGORIES.contains(category)) throw new ApiException("通知分类无效");
      var ordered = new ArrayList<>(mine);
      ordered.removeIf(n -> !category.equals("all") && !category(n).equals(category));
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
                        out.put("category", category(n));
                        return out;
                      })
                  .toList(),
              "unread",
              unread,
              "preferences",
              preferences(c.store, c.account.get("id")),
              "next",
              start + page.size() < ordered.size() ? page.getLast().get("id") : null));
      return true;
    }
    if (c.route("/api/notifications/read", "POST")) {
      cn.campus.common.RequestValues.fields(c.body, "all", "id", "ids", "category");
      int modes =
          (yes(c.body.get("all")) ? 1 : 0)
              + (c.body.containsKey("id") ? 1 : 0)
              + (c.body.containsKey("ids") ? 1 : 0);
      String filter = str(c.body.getOrDefault("category", "all"));
      if (modes != 1
          || !CATEGORIES.contains(filter)
          || (!yes(c.body.get("all")) && c.body.containsKey("category")))
        throw new ApiException("通知标记参数无效");
      var ids = new HashSet<String>();
      if (c.body.containsKey("ids")) {
        ids.addAll(cn.campus.common.RequestValues.texts(c.body, "ids", 100, 36));
        if (ids.isEmpty()) throw new ApiException("请选择通知");
        for (String id : ids)
          if (find(mine, "id", id) == null) throw new ApiException("通知不存在", 404);
      }
      if (c.body.containsKey("id") && find(mine, "id", c.body.get("id")) == null)
        throw new ApiException("通知不存在", 404);
      boolean changed = false;
      for (var n : mine)
        if (n.get("readAt") == null
            && ((yes(c.body.get("all")) && (filter.equals("all") || category(n).equals(filter)))
                || ids.contains(str(n.get("id")))
                || eq(n.get("id"), c.body.get("id")))) {
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
