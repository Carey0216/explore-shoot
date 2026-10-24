package cn.campus.content;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.common.TimeSource;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;

/** Targeting and impression limits are checked inside the shared server transaction. */
@Service
public class AnnouncementService {
  private final cn.campus.common.RateLimiter limits;

  public AnnouncementService(cn.campus.common.RateLimiter limits) {
    this.limits = limits;
  }

  public static final Set<String> PAGES =
      Set.of(
          "shots",
          "assistant",
          "discover",
          "map",
          "navigate",
          "routes",
          "place",
          "spot",
          "me",
          "settings",
          "passport",
          "checkin",
          "notifications",
          "topics",
          "topic",
          "plans",
          "publish",
          "contact",
          "conversation",
          "notice");
  private static final Set<String> CHANNELS = Set.of("web", "mini");
  private static final Set<String> AUDIENCES =
      Set.of("all", "guest", "members", "ordinary", "scouts", "selected");
  private static final String UUID = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";

  private long number(Map<String, Object> body, String key, int max) {
    if (!whole(body.get(key)) || integer(body.get(key)) < 0 || integer(body.get(key)) > max)
      throw new ApiException("次数、间隔或优先级无效：" + key);
    return integer(body.get(key));
  }

  private List<Object> choices(
      Map<String, Object> body, String key, Set<String> allowed, boolean empty) {
    Object value = body.get(key);
    if (!(value instanceof List<?>)
        || list(value).size() > 500
        || !empty && list(value).isEmpty()
        || list(value).stream().anyMatch(v -> !(v instanceof String) || !allowed.contains(v))
        || new HashSet<>(list(value)).size() != list(value).size())
      throw new ApiException("范围无效：" + key);
    return new ArrayList<>(list(value));
  }

  private String time(Map<String, Object> body, String key) {
    String value = SiteContentService.text(body, key, 40, false);
    if (value.isEmpty()) return value;
    try {
      return Instant.parse(value).toString();
    } catch (Exception e) {
      throw new ApiException("公告时间须为有效时间");
    }
  }

  private Map<String, Object> validate(ApiContext c) {
    var b = map(c.body.get("content"));
    Set<String> required =
        Set.of(
            "title",
            "body",
            "channels",
            "pages",
            "audience",
            "userIds",
            "startsAt",
            "endsAt",
            "maxTotal",
            "maxDaily",
            "intervalMinutes",
            "priority");
    var allowed = new HashSet<>(required);
    allowed.addAll(Set.of("imageId", "links", "delivery", "category"));
    if (!b.keySet().containsAll(required) || !allowed.containsAll(b.keySet()))
      throw new ApiException("公告字段无效");
    String audience = str(b.get("audience"));
    if (!AUDIENCES.contains(audience)) throw new ApiException("投放对象无效");
    var userIds =
        choices(
            b,
            "userIds",
            new HashSet<>(
                c.store.rows("users").stream()
                    .filter(u -> !yes(u.get("deleted")))
                    .map(u -> str(u.get("id")))
                    .toList()),
            true);
    if (audience.equals("selected") != !userIds.isEmpty())
      throw new ApiException("指定用户时请选择账号；其他范围不填写用户");
    String start = time(b, "startsAt"), end = time(b, "endsAt");
    if (!start.isEmpty() && !end.isEmpty() && !Instant.parse(end).isAfter(Instant.parse(start)))
      throw new ApiException("结束时间须晚于开始时间");
    var value =
        obj(
            "title",
            SiteContentService.text(b, "title", 80, true),
            "body",
            SiteContentService.text(b, "body", 6000, true),
            "channels",
            choices(b, "channels", CHANNELS, false),
            "pages",
            choices(b, "pages", PAGES, true),
            "audience",
            audience,
            "userIds",
            userIds,
            "startsAt",
            start,
            "endsAt",
            end,
            "maxTotal",
            number(b, "maxTotal", 10000),
            "maxDaily",
            number(b, "maxDaily", 1000),
            "intervalMinutes",
            number(b, "intervalMinutes", 525600),
            "priority",
            number(b, "priority", 1000));
    value.putAll(cn.campus.notification.RichContent.read(c, b));
    var delivery =
        b.containsKey("delivery")
            ? choices(b, "delivery", Set.of("popup", "inbox"), false)
            : List.of("popup");
    value.put("delivery", delivery);
    String category = str(b.getOrDefault("category", "announcement"));
    if (!Set.of("announcement", "activity", "updates", "system").contains(category)) throw new ApiException("通知标签无效");
    value.put("category", category);
    return value;
  }

  private boolean matches(
      ApiContext c, Map<String, Object> published, String channel, String page) {
    if (published.isEmpty()
        || published.containsKey("delivery") && !list(published.get("delivery")).contains("popup")
        || !list(published.get("channels")).contains(channel)
        || !list(published.get("pages")).isEmpty() && !list(published.get("pages")).contains(page))
      return false;
    long now = TimeSource.now();
    String start = str(published.get("startsAt")), end = str(published.get("endsAt"));
    if (!start.isEmpty() && now < Instant.parse(start).toEpochMilli()
        || !end.isEmpty() && now >= Instant.parse(end).toEpochMilli()) return false;
    boolean loggedIn = c.account != null,
        scout = loggedIn && eq(c.account.get("scoutStatus"), "approved");
    return switch (str(published.get("audience"))) {
      case "all" -> true;
      case "guest" -> !loggedIn;
      case "members" -> loggedIn;
      case "ordinary" -> loggedIn && !scout;
      case "scouts" -> scout;
      case "selected" -> loggedIn && list(published.get("userIds")).contains(c.account.get("id"));
      default -> false;
    };
  }

  private String actor(ApiContext c, String visitor) {
    if (c.account != null) return Security.digest("user:" + c.account.get("id"));
    if (!visitor.matches(UUID)) throw new ApiException("访客标识无效");
    return Security.digest("visitor:" + visitor);
  }

  private String day() {
    return Instant.ofEpochMilli(TimeSource.now())
        .atZone(ZoneId.of("Asia/Shanghai"))
        .toLocalDate()
        .toString();
  }

  private Map<String, Object> receipt(ApiContext c, String id, String actor) {
    return c.store.rows("announcementReceipts").stream()
        .filter(r -> eq(r.get("announcementId"), id) && eq(r.get("actorHash"), actor))
        .findFirst()
        .orElse(null);
  }

  private boolean allowed(
      Map<String, Object> published, Map<String, Object> receipt, String visit) {
    if (receipt == null) return true;
    if (list(receipt.get("visits")).contains(visit)) return false;
    long total = integer(published.get("maxTotal")), daily = integer(published.get("maxDaily"));
    return (total == 0 || integer(receipt.get("total")) < total)
        && (daily == 0 || !eq(receipt.get("day"), day()) || integer(receipt.get("daily")) < daily)
        && TimeSource.now() - integer(receipt.get("lastAt"))
            >= integer(published.get("intervalMinutes")) * 60000L;
  }

  private Map<String, Object> view(Map<String, Object> row) {
    var published = map(row.get("published"));
    return cn.campus.notification.RichContent.view(
        obj(
            "id",
            row.get("id"),
            "revision",
            row.get("revision"),
            "title",
            published.get("title"),
            "body",
            published.get("body"),
            "imageId",
            published.get("imageId"),
            "links",
            published.getOrDefault("links", List.of())));
  }

  public boolean handle(ApiContext c) throws Exception {
    if (c.audience.equals("admin") && c.path.startsWith("/api/admin/announcements"))
      return admin(c);
    if (!c.audience.equals("user")) return false;
    if (c.route("/api/announcements", "GET")) {
      limits.check(c.ip + ":announcement-query", 180);
      String channel = Objects.toString(c.request.getParameter("channel"), ""),
          page = Objects.toString(c.request.getParameter("page"), ""),
          visitor = Objects.toString(c.request.getParameter("visitorId"), ""),
          visit = Objects.toString(c.request.getParameter("visitId"), "");
      validateContext(c, channel, page, visit);
      String actor = actor(c, visitor);
      var candidate =
          c.store.rows("announcements").stream()
              .filter(
                  r -> !yes(r.get("deleted")) && matches(c, map(r.get("published")), channel, page))
              .sorted(
                  Comparator.comparingLong(
                          (Map<String, Object> r) ->
                              integer(map(r.get("published")).get("priority")))
                      .reversed()
                      .thenComparing(r -> str(r.get("id"))))
              .filter(
                  r -> allowed(map(r.get("published")), receipt(c, str(r.get("id")), actor), visit))
              .findFirst();
      c.send(obj("announcement", candidate.map(this::view).orElse(null)));
      return true;
    }
    if (c.method.equals("POST") && c.path.matches("/api/announcements/" + UUID + "/impressions")) {
      limits.check(c.ip + ":announcement-impression", 40);
      if (!c.body
          .keySet()
          .equals(Set.of("channel", "page", "visitorId", "visitId", "requestId", "revision")))
        throw new ApiException("展示参数无效");
      String id = c.path.split("/")[3],
          channel = str(c.body.get("channel")),
          page = str(c.body.get("page")),
          visit = str(c.body.get("visitId")),
          request = str(c.body.get("requestId"));
      validateContext(c, channel, page, visit);
      if (!request.matches(UUID)) throw new ApiException("展示编号无效");
      var row = find(c.store.rows("announcements"), "id", id);
      if (row == null
          || !matches(c, map(row.get("published")), channel, page)
          || !whole(c.body.get("revision"))
          || integer(c.body.get("revision")) != integer(row.get("revision"))) {
        c.send(obj("show", false));
        return true;
      }
      String actor = actor(c, str(c.body.get("visitorId")));
      var receipt = receipt(c, id, actor);
      if (receipt != null && list(receipt.get("requests")).contains(request)) {
        c.send(obj("show", true, "announcement", view(row)));
        return true;
      }
      if (!allowed(map(row.get("published")), receipt, visit)) {
        c.send(obj("show", false));
        return true;
      }
      if (receipt == null) {
        if (c.store.rows("announcementReceipts").size() >= 100000)
          throw new ApiException("公告展示记录暂满，请稍后再试", 503);
        receipt =
            obj(
                "id",
                Security.id(),
                "announcementId",
                id,
                "actorHash",
                actor,
                "ownerId",
                c.account == null ? null : c.account.get("id"));
        c.store.rows("announcementReceipts").add(receipt);
        receipt = c.store.rows("announcementReceipts").getLast();
      }
      receipt.put("total", integer(receipt.get("total")) + 1);
      receipt.put("daily", (eq(receipt.get("day"), day()) ? integer(receipt.get("daily")) : 0) + 1);
      receipt.put("day", day());
      receipt.put("lastAt", TimeSource.now());
      append(receipt, "visits", visit, 32);
      append(receipt, "requests", request, 32);
      c.store.save();
      c.send(obj("show", true, "announcement", view(row)));
      return true;
    }
    return false;
  }

  private static void withdrawNotices(ApiContext c, Map<String, Object> row) {
    String event = str(row.get("releaseVersion")).isEmpty()
        ? "announcement:" + row.get("id") + ":" : "release:" + row.get("releaseVersion");
    c.store.rows("notifications").removeIf(n -> {
      String old = str(n.get("event"));
      return old.equals(event) || event.startsWith("announcement:") && old.startsWith(event);
    });
  }

  private void validateContext(ApiContext c, String channel, String page, String visit) {
    if (!CHANNELS.contains(channel)
        || !PAGES.contains(page)
        || !visit.matches(UUID)
        || c.miniProgram != channel.equals("mini")) throw new ApiException("客户端或页面范围无效");
  }

  private void append(Map<String, Object> row, String key, String value, int limit) {
    var items = new ArrayList<>(list(row.get(key)));
    items.add(value);
    row.put(key, items.subList(Math.max(0, items.size() - limit), items.size()));
  }

  private boolean admin(ApiContext c) throws Exception {
    c.need();
    if (c.route("/api/admin/announcements", "GET")) {
      c.send(
          obj(
              "items",
              c.store.rows("announcements").stream()
                  .filter(
                      r ->
                          !yes(r.get("deleted"))
                              && (str(r.get("releaseVersion")).isEmpty()
                                  || cn.campus.admin.AdminPermissions.owner(c.account)))
                  .toList()));
      return true;
    }
    boolean create = c.route("/api/admin/announcements", "POST");
    if (c.method.equals("DELETE") && c.path.matches("/api/admin/announcements/" + UUID)) {
      var row =
          find(c.store.rows("announcements"), "id", c.path.substring(c.path.lastIndexOf('/') + 1));
      if (row == null || yes(row.get("deleted"))) throw new ApiException("公告不存在", 404);
      ReleaseUpdates.guardEdit(c, row);
      if (!whole(c.body.get("revision"))
          || integer(c.body.get("revision")) != integer(row.get("revision")))
        throw new ApiException("公告已被修改，请重新载入", 409);
      withdrawNotices(c, row);
      row.put("deleted", true);
      row.remove("published");
      row.put("revision", integer(row.get("revision")) + 1);
      c.audit("删除开屏公告", row.get("id"), "已停止投放，保留审计与计次记录");
      c.store.save();
      c.send(obj("ok", true));
      return true;
    }
    if (!create && !(c.method.equals("PUT") && c.path.matches("/api/admin/announcements/" + UUID)))
      return false;
    var row =
        create
            ? obj("id", Security.id(), "revision", 0L)
            : find(c.store.rows("announcements"), "id", c.path.split("/")[4]);
    if (row == null || yes(row.get("deleted"))) throw new ApiException("公告不存在", 404);
    boolean release = !str(row.get("releaseVersion")).isEmpty();
    if (!c.body.keySet().equals(Set.of("revision", "action", "content"))
        && !(release
            && c.body.keySet().equals(Set.of("revision", "action", "content", "adminBody"))))
      throw new ApiException("公告操作参数无效");
    ReleaseUpdates.guardEdit(c, row);
    if (!whole(c.body.get("revision"))
        || integer(row.get("revision")) != integer(c.body.get("revision")))
      throw new ApiException("公告已被修改，请重新载入", 409);
    String action = str(c.body.get("action"));
    if (!Set.of("draft", "publish", "unpublish").contains(action)) throw new ApiException("公告操作无效");
    var value = validate(c);
    if (create) {
      if (c.store.rows("announcements").size() >= 500) throw new ApiException("公告数量达到上限，请复用已有草稿");
      c.store.rows("announcements").add(row);
      row = c.store.rows("announcements").getLast();
    }
    if (release && c.body.containsKey("adminBody"))
      row.put("adminDraft", SiteContentService.text(c.body, "adminBody", 6000, true));
    row.put("draft", value);
    row.put("revision", integer(row.get("revision")) + 1);
    row.put("updatedAt", StoreRepository.now());
    if (action.equals("publish")) {
      withdrawNotices(c, row);
      row.put("published", cn.campus.common.Json.clone(value));
      row.put("publishedAt", StoreRepository.now());
      if (release) row.put("adminPublished", row.get("adminDraft"));
    }
    if (action.equals("unpublish")) {
      withdrawNotices(c, row);
      row.remove("published");
      row.remove("adminPublished");
    }
    c.audit("开屏公告" + action, row.get("id"), "修订 " + row.get("revision"));
    c.store.save();
    c.send(obj("id", row.get("id"), "revision", row.get("revision")));
    return true;
  }
}
