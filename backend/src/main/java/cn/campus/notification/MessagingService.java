package cn.campus.notification;

import static cn.campus.common.Json.*;

import cn.campus.admin.AdminPermissions;
import cn.campus.auth.Security;
import cn.campus.common.*;
import cn.campus.storage.*;
import cn.campus.web.ApiContext;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;

/** Administrator-initiated private conversations; users can only leave requests or reply. */
@Service
public final class MessagingService {
  private final RateLimiter limits;

  public MessagingService(RateLimiter limits) {
    this.limits = limits;
  }

  private static boolean staff(ApiContext c) {
    return c.audience.equals("admin");
  }

  private static boolean access(ApiContext c, Map<String, Object> t) {
    return t != null
        && (staff(c)
            ? AdminPermissions.has(c.account, "messages.read")
                && (AdminPermissions.owner(c.account) || eq(t.get("adminId"), c.account.get("id")))
            : eq(t.get("userId"), c.account.get("id")));
  }

  private static void requireStaff(ApiContext c, boolean write) {
    c.need();
    if (!staff(c) || !AdminPermissions.has(c.account, "messages." + (write ? "write" : "read")))
      throw new ApiException("无消息管理权限", 403);
  }

  private static String required(Map<String, Object> b, String key, int max) {
    String s = str(b.get(key)).trim();
    if (s.isEmpty() || s.length() > max) throw new ApiException("请填写有效的" + key);
    return s;
  }

  private Map<String, Object> thread(ApiContext c, String id) {
    var t = find(c.store.rows("conversations"), "id", id);
    if (!access(c, t)) throw new ApiException("对话不存在", 404);
    return t;
  }

  public boolean handle(ApiContext c) throws Exception {
    if (c.account != null
        && !staff(c)
        && c.path.startsWith("/api/notifications")
        && c.method.equals("GET")) deliver(c);
    if (c.path.matches("/api/(?:admin/)?messages/media/[a-f0-9-]+") && c.method.equals("GET")) {
      media(c);
      return true;
    }
    if (!staff(c) && c.route("/api/contact-requests", "POST")) {
      c.need();
      limits.check(c.account.get("id") + ":contact-request", 5);
      String body = required(c.body, "body", 2000);
      var existing =
          c.store.rows("contactRequests").stream()
              .filter(
                  r -> eq(r.get("userId"), c.account.get("id")) && eq(r.get("status"), "pending"))
              .findFirst()
              .orElse(null);
      if (existing != null) {
        c.send(copy(existing));
        return true;
      }
      var r =
          obj(
              "id",
              Security.id(),
              "userId",
              c.account.get("id"),
              "body",
              body,
              "status",
              "pending",
              "createdAt",
              StoreRepository.now());
      c.store.rows("contactRequests").add(r);
      c.store.save();
      c.send(r, 201);
      return true;
    }
    if (!staff(c) && c.route("/api/contact-requests", "GET")) {
      c.need();
      c.send(
          obj(
              "items",
              c.store.rows("contactRequests").stream()
                  .filter(r -> eq(r.get("userId"), c.account.get("id")))
                  .toList()));
      return true;
    }
    if (staff(c) && c.path.startsWith("/api/admin/inbox")) {
      inbox(c);
      return true;
    }
    String prefix = staff(c) ? "/api/admin/conversations" : "/api/conversations";
    if (c.path.equals(prefix)) {
      c.need();
      if (staff(c)) requireStaff(c, !c.method.equals("GET"));
      if (c.method.equals("GET")) {
        c.send(
            obj(
                "items",
                c.store.rows("conversations").stream()
                    .filter(t -> access(c, t))
                    .map(t -> threadView(c, t))
                    .toList()));
        return true;
      }
      if (!staff(c) || !c.method.equals("POST")) throw new ApiException("只有管理员可建立对话", 403);
      String userId = required(c.body, "userId", 36);
      var user = find(c.store.rows("users"), "id", userId);
      if (user == null || yes(user.get("deleted"))) throw new ApiException("用户不存在", 404);
      var t =
          c.store.rows("conversations").stream()
              .filter(x -> eq(x.get("userId"), userId) && eq(x.get("adminId"), c.account.get("id")))
              .findFirst()
              .orElse(null);
      if (t == null) {
        t =
            obj(
                "id",
                Security.id(),
                "userId",
                userId,
                "adminId",
                c.account.get("id"),
                "userName",
                user.get("nickname"),
                "adminName",
                c.account.get("name"),
                "open",
                true,
                "createdAt",
                StoreRepository.now());
        c.store.rows("conversations").add(t);
        t = find(c.store.rows("conversations"), "id", t.get("id"));
      }
      if (!str(c.body.get("requestId")).isEmpty()) {
        var r = find(c.store.rows("contactRequests"), "id", c.body.get("requestId"));
        if (r == null
            || !eq(r.get("userId"), userId)
            || (!eq(r.get("status"), "pending") && !eq(r.get("conversationId"), t.get("id"))))
          throw new ApiException("留言已被处理，请刷新", 409);
        r.putAll(
            obj(
                "status",
                "connected",
                "conversationId",
                t.get("id"),
                "handledAt",
                StoreRepository.now()));
      }
      t.put("open", true);
      var m = send(c, t);
      c.audit("建立用户对话", t.get("id"), "私信内容不写入审计");
      c.store.save();
      c.send(obj("conversation", threadView(c, t), "message", m), 201);
      return true;
    }
    if (c.path.startsWith(prefix + "/")) {
      c.need();
      String tail = c.path.substring(prefix.length() + 1);
      String id = tail.split("/")[0];
      var t = thread(c, id);
      if (c.method.equals("GET") && tail.equals(id)) {
        var page = c.store.messagePage(id, str(c.request.getParameter("before")));
        c.send(
            obj(
                "conversation",
                threadView(c, t),
                "items",
                page.items().stream().map(RichContent::view).toList(),
                "next",
                page.next()));
        return true;
      }
      if (c.method.equals("POST") && tail.equals(id + "/read")) {
        t.put(staff(c) ? "adminReadAt" : "userReadAt", StoreRepository.now());
        if (!staff(c))
          for (var n : c.store.rows("notifications"))
            if (eq(n.get("userId"), c.account.get("id"))
                && eq(n.get("target"), "#conversation/" + id))
              n.put("readAt", StoreRepository.now());
        c.store.save();
        c.send(obj("ok", true));
        return true;
      }
      if (c.method.equals("POST") && tail.equals(id + "/messages")) {
        if (staff(c)) requireStaff(c, true);
        if (!yes(t.get("open"))) throw new ApiException("管理员已关闭此对话", 409);
        var m = send(c, t);
        c.store.save();
        c.send(m, 201);
        return true;
      }
      if (staff(c) && c.method.equals("PATCH") && tail.equals(id)) {
        requireStaff(c, true);
        if (!(c.body.get("open") instanceof Boolean)) throw new ApiException("对话状态无效");
        t.put("open", c.body.get("open"));
        c.audit("调整对话状态", id, "不含消息正文");
        c.store.save();
        c.send(threadView(c, t));
        return true;
      }
    }
    if (!staff(c) && c.path.matches("/api/notifications/[a-f0-9-]+") && c.method.equals("GET")) {
      c.need();
      var n =
          find(c.store.rows("notifications"), "id", c.path.substring(c.path.lastIndexOf('/') + 1));
      if (n == null || !eq(n.get("userId"), c.account.get("id")))
        throw new ApiException("通知不存在", 404);
      var out = RichContent.view(n);
      out.remove("userId");
      out.remove("event");
      c.send(out);
      return true;
    }
    return false;
  }

  private Map<String, Object> threadView(ApiContext c, Map<String, Object> t) {
    var out = copy(t);
    out.remove("userId");
    out.remove("adminId");
    String read = str(t.get(staff(c) ? "adminReadAt" : "userReadAt"));
    long unread = c.store.unreadMessages(str(t.get("id")), staff(c) ? "user" : "admin", read);
    out.put("unread", unread);
    return out;
  }

  private Map<String, Object> send(ApiContext c, Map<String, Object> t) {
    limits.check(c.account.get("id") + ":private-message", 30);
    String submission = required(c.body, "submissionId", 36);
    if (!submission.matches(MediaReferences.UUID)) throw new ApiException("发送标识无效");
    String side = staff(c) ? "admin" : "user";
    var existing =
        c.store.rows("directMessages").stream()
            .filter(
                m ->
                    eq(m.get("conversationId"), t.get("id"))
                        && eq(m.get("from"), side)
                        && eq(m.get("submissionId"), submission))
            .findFirst()
            .orElse(null);
    if (existing != null) return RichContent.view(existing);
    String body = str(c.body.get("body")).trim();
    var rich = RichContent.read(c, c.body);
    if (body.length() > 4000
        || body.isEmpty()
            && str(rich.get("imageId")).isEmpty()
            && list(rich.get("links")).isEmpty()) throw new ApiException("写一条消息或添加图片 / 链接");
    if (c.store.rows("directMessages").stream()
            .filter(m -> eq(m.get("conversationId"), t.get("id")))
            .count()
        >= 2000) throw new ApiException("对话记录已满，请联系管理员", 409);
    var m =
        obj(
            "id",
            Security.id(),
            "conversationId",
            t.get("id"),
            "userId",
            t.get("userId"),
            "submissionId",
            submission,
            "from",
            side,
            "body",
            body,
            "createdAt",
            StoreRepository.now());
    m.putAll(rich);
    c.store.rows("directMessages").add(m);
    t.put("updatedAt", m.get("createdAt"));
    if (staff(c)) {
      NotificationService.add(
          c.store,
          t.get("userId"),
          "message:" + m.get("id"),
          "message",
          "管理员给你发来消息",
          body.isEmpty() ? "点击查看图片或链接" : body,
          "#conversation/" + t.get("id"));
      var notice = c.store.rows("notifications").getLast();
      notice.putAll(rich);
      notice.put(
          "image",
          str(rich.get("imageId")).isEmpty() ? "" : "/api/messages/media/" + rich.get("imageId"));
    }
    return RichContent.view(m);
  }

  private void inbox(ApiContext c) throws Exception {
    c.need();
    var items = new ArrayList<Map<String, Object>>();
    String[][] groups = {
      {"applications", "applications", "探索官申请", "#applications"},
      {"reports", "reports", "点位反馈", "#reports"},
      {"workReports", "work-reports", "作品举报", "#work-reports"},
      {"works", "works", "作品待审核", "#works"},
      {"shootingSpots", "shooting-spots", "机位待审核", "#shooting-spots"},
      {"contactRequests", "messages", "用户联系留言", "#messages"}
    };
    for (var g : groups)
      if (AdminPermissions.has(c.account, g[1] + ".read"))
        for (var r : c.store.rows(g[0]))
          if (eq(r.get("status"), "pending"))
            items.add(
                obj(
                    "id",
                    g[0] + ":" + r.get("id"),
                    "title",
                    g[2],
                    "message",
                    g[0].equals("contactRequests") ? r.get("body") : "有一条请求等待处理",
                    "target",
                    g[3],
                    "createdAt",
                    r.get("createdAt"),
                    "requestId",
                    g[0].equals("contactRequests") ? r.get("id") : null,
                    "userId",
                    g[0].equals("contactRequests") ? r.get("userId") : null));
    if (AdminPermissions.has(c.account, "points.read"))
      for (var p : c.store.rows("points"))
        if (p.get("authorId") != null && eq(p.get("trust"), "community") && yes(p.get("published")))
          items.add(
              obj(
                  "id",
                  "point:" + p.get("id"),
                  "title",
                  "社区点位待认证",
                  "message",
                  p.get("name"),
                  "target",
                  "#points",
                  "createdAt",
                  p.get("createdAt")));
    if (AdminPermissions.has(c.account, "messages.read"))
      for (var t : c.store.rows("conversations"))
        if (access(c, t))
          for (var m : c.store.rows("directMessages"))
            if (eq(m.get("conversationId"), t.get("id"))
                && eq(m.get("from"), "user")
                && str(m.get("createdAt")).compareTo(str(t.get("adminReadAt"))) > 0)
              items.add(
                  obj(
                      "id",
                      "message:" + m.get("id"),
                      "title",
                      "用户回复 · " + t.get("userName"),
                      "message",
                      m.get("body"),
                      "target",
                      "#messages/" + t.get("id"),
                      "createdAt",
                      m.get("createdAt")));
    for (var item : items)
      if (item.get("requestId") != null) {
        var user = find(c.store.rows("users"), "id", item.get("userId"));
        item.put(
            "requester",
            user == null || yes(user.get("deleted"))
                ? obj("nickname", "已删除用户", "username", "")
                : obj("nickname", user.get("nickname"), "username", user.get("username")));
      }
    var receipt =
        c.store.rows("adminInboxReceipts").stream()
            .filter(r -> eq(r.get("adminId"), c.account.get("id")))
            .findFirst()
            .orElse(null);
    var read = new HashSet<>(list(receipt == null ? null : receipt.get("ids")));
    if (c.method.equals("POST") && c.path.endsWith("/read")) {
      var ids = list(c.body.get("ids"));
      if (ids.size() > 500 || ids.stream().anyMatch(x -> !(x instanceof String)))
        throw new ApiException("通知范围无效");
      // Ignore notifications resolved between listing and reading; never admit arbitrary receipt
      // IDs.
      var currentIds = items.stream().map(x -> x.get("id")).toList();
      read.retainAll(currentIds);
      for (var id : ids) if (currentIds.contains(id)) read.add(id);
      if (receipt == null) {
        receipt = obj("id", Security.id(), "adminId", c.account.get("id"));
        c.store.rows("adminInboxReceipts").add(receipt);
        receipt = c.store.rows("adminInboxReceipts").getLast();
      }
      receipt.put("ids", new ArrayList<>(read));
      c.store.save();
      c.send(obj("ok", true));
      return;
    }
    if (!c.method.equals("GET")) throw new ApiException("接口不存在", 404);
    for (var n : items) n.put("readAt", read.contains(n.get("id")) ? "read" : null);
    items.sort(Comparator.comparing((Map<String, Object> x) -> str(x.get("createdAt"))).reversed());
    long unread = items.stream().filter(x -> x.get("readAt") == null).count();
    String category = Objects.toString(c.request.getParameter("category"), "all");
    if (!Set.of("all", "review", "message").contains(category)) throw new ApiException("待办分类无效");
    for (var n : items)
      n.put(
          "category",
          str(n.get("id")).startsWith("message:") || str(n.get("id")).startsWith("contactRequests:")
              ? "message"
              : "review");
    items.removeIf(n -> !category.equals("all") && !eq(n.get("category"), category));
    String before = Objects.toString(c.request.getParameter("before"), "");
    int start = 0;
    if (!before.isEmpty()) {
      var cursor = find(items, "id", before);
      if (cursor == null) throw new ApiException("待办已处理，请刷新列表", 409);
      start = items.indexOf(cursor) + 1;
    }
    var page = items.subList(start, Math.min(start + 50, items.size()));
    c.send(
        c.path.endsWith("/summary")
            ? obj("unread", unread, "badge", unread, "muted", false)
            : obj(
                "items",
                page,
                "next",
                start + page.size() < items.size() ? page.getLast().get("id") : null,
                "muted",
                false,
                "unread",
                unread));
  }

  private static boolean audience(ApiContext c, Map<String, Object> p) {
    String a = str(p.get("audience"));
    return a.equals("all")
        || a.equals("guest") && c.account == null
        || c.account != null
            && (a.equals("members")
                || a.equals("scouts") && eq(c.account.get("scoutStatus"), "approved")
                || a.equals("ordinary") && !eq(c.account.get("scoutStatus"), "approved")
                || a.equals("selected") && list(p.get("userIds")).contains(c.account.get("id")));
  }

  private static boolean timely(Map<String, Object> p) {
    long now = TimeSource.now();
    try {
      return (str(p.get("startsAt")).isEmpty()
              || Instant.parse(str(p.get("startsAt"))).toEpochMilli() <= now)
          && (str(p.get("endsAt")).isEmpty()
              || Instant.parse(str(p.get("endsAt"))).toEpochMilli() > now);
    } catch (Exception e) {
      return false;
    }
  }

  private void deliver(ApiContext c) {
    long before = c.store.rows("notifications").size();
    cn.campus.point.PersonalWorkflowService.deliverReminders(c);
    for (var r : c.store.rows("announcements")) {
      var p = map(r.get("published"));
      if (yes(r.get("deleted"))
          || p.isEmpty()
          || !list(p.get("delivery")).contains("inbox")
          || !audience(c, p)
          || !timely(p)) continue;
      String event = "announcement:" + r.get("id") + ":" + r.get("publishedAt");
      if (c.store.rows("notifications").stream()
          .anyMatch(n -> eq(n.get("userId"), c.account.get("id")) && eq(n.get("event"), event)))
        continue;
      NotificationService.add(
          c.store,
          c.account.get("id"),
          event,
          "announcement",
          str(p.get("title")),
          str(p.get("body")),
          "#notifications");
      var n = c.store.rows("notifications").getLast();
      n.putAll(obj("imageId", p.get("imageId"), "links", p.get("links")));
      n.put(
          "image",
          str(p.get("imageId")).isEmpty() ? "" : "/api/messages/media/" + p.get("imageId"));
    }
    for (var t : c.store.rows("seasonTopics"))
      if (yes(t.get("published")) && !yes(t.get("deleted")) && notEnded(t)) {
        NotificationService.add(
            c.store,
            c.account.get("id"),
            "topic-published:" + t.get("id"),
            "activity",
            "新活动 · " + t.get("title"),
            str(t.get("description")),
            "#topic/" + t.get("id"));
      }
    if (c.store.rows("notifications").size() != before) c.store.save();
  }

  private static boolean notEnded(Map<String, Object> t) {
    try {
      return str(t.get("endsAt")).isEmpty()
          || Instant.parse(str(t.get("endsAt"))).toEpochMilli() > TimeSource.now();
    } catch (Exception e) {
      return false;
    }
  }

  private void media(ApiContext c) throws Exception {
    String id = c.path.substring(c.path.lastIndexOf('/') + 1);
    var media = find(c.store.rows("media"), "id", id);
    boolean allowed =
        media != null && c.account != null && eq(media.get("ownerId"), c.account.get("id"));
    if (c.account != null) {
      if (staff(c) && AdminPermissions.has(c.account, "announcements.read"))
        for (var a : c.store.rows("announcements"))
          if (!yes(a.get("deleted"))
              && (eq(map(a.get("draft")).get("imageId"), id)
                  || eq(map(a.get("published")).get("imageId"), id))) allowed = true;
      for (var m : c.store.rows("directMessages"))
        if (eq(m.get("imageId"), id)
            && access(c, find(c.store.rows("conversations"), "id", m.get("conversationId"))))
          allowed = true;
      if (!staff(c))
        for (var n : c.store.rows("notifications"))
          if (eq(n.get("imageId"), id) && eq(n.get("userId"), c.account.get("id"))) allowed = true;
    }
    for (var r : c.store.rows("announcements")) {
      var p = map(r.get("published"));
      if (!yes(r.get("deleted")) && eq(p.get("imageId"), id) && timely(p) && audience(c, p))
        allowed = true;
    }
    Path file = c.store.directory.resolve("media/" + id + ".jpg");
    if (!allowed || media == null || yes(media.get("deleted")) || !Files.isRegularFile(file))
      throw new ApiException("图片不存在", 404);
    if ("thumb".equals(c.request.getParameter("size")))
      file = PhotoVariants.thumbnail(c.store, file);
    c.response.setContentType("image/jpeg");
    c.response.setHeader("Cache-Control", "private, no-store");
    Files.copy(file, c.response.getOutputStream());
  }
}
