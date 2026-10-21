package cn.campus.settings;

import static cn.campus.common.Json.*;

import cn.campus.admin.AdminPermissions;
import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.common.RequestValues;
import cn.campus.common.TimeSource;
import cn.campus.web.ApiContext;
import java.time.Instant;
import java.util.*;

/** Visual celebrations only. Eligibility and one-time receipts are checked on the server. */
public final class Celebrations {
  public static final Set<String> EVENTS = Set.of("page-enter", "scout-passed", "checkin-saved");
  public static final Set<String> PAGES = Set.of(
      "discover", "place", "spot", "shooting", "checkin", "publish", "passport", "me", "map",
      "topics", "guides", "updates", "notifications", "settings", "plans", "active", "journey",
      "overview", "inbox", "users", "applications", "scout-quiz", "messages", "points",
      "shooting-spots", "works", "reports", "review-queue", "announcements", "site-content",
      "knowledge", "features", "ai-settings", "admins", "audit", "content", "campus-map",
      "work-reports", "collections", "my-works", "notes", "topic", "guide", "notice", "contact", "conversation", "search", "shots", "shot", "building", "shared-plan", "navigate", "routes", "route", "explore");

  public static List<Map<String, Object>> defaults() {
    return List.of(obj("id", "scout-welcome", "title", "欢迎校园探索官", "enabled", true,
        "event", "scout-passed", "channel", "user", "pages", List.of(), "audience", "all",
        "usernames", List.of(), "startsAt", "", "endsAt", "", "duration", 2800, "density", 72));
  }

  private static List<Map<String, Object>> rules(ApiContext c) {
    return c.store.settings().containsKey("celebrationRules")
        ? rows(c.store.settings().get("celebrationRules")) : defaults();
  }

  public static Map<String, Object> normalize(Map<String, Object> r) {
    RequestValues.fields(r, "id", "title", "enabled", "event", "channel", "pages", "audience",
        "usernames", "startsAt", "endsAt", "duration", "density");
    if (!str(r.get("id")).matches("[a-zA-Z0-9-]{1,60}")
        || str(r.get("title")).isBlank() || str(r.get("title")).length() > 80
        || !(r.get("enabled") instanceof Boolean) || !EVENTS.contains(str(r.get("event")))
        || !Set.of("user", "admin", "both").contains(str(r.get("channel")))
        || !Set.of("all", "signed-in", "scouts", "standard", "specific").contains(str(r.get("audience")))
        || !whole(r.get("duration")) || integer(r.get("duration")) < 1000 || integer(r.get("duration")) > 5000
        || !whole(r.get("density")) || integer(r.get("density")) < 16 || integer(r.get("density")) > 100)
      throw new ApiException("彩纸规则格式无效");
    if (!(r.get("pages") instanceof List<?>) || list(r.get("pages")).size() > PAGES.size()
        || list(r.get("pages")).stream().anyMatch(p -> !PAGES.contains(str(p)))
        || !(r.get("usernames") instanceof List<?>) || list(r.get("usernames")).size() > 100)
      throw new ApiException("页面或指定账号无效");
    var names = new LinkedHashSet<String>();
    for (Object name : list(r.get("usernames"))) names.add(Security.username(name));
    if (eq(r.get("audience"), "specific") && names.isEmpty()) throw new ApiException("请填写指定账号");
    String start = str(r.get("startsAt")), end = str(r.get("endsAt"));
    try {
      if (!start.isEmpty()) Instant.parse(start);
      if (!end.isEmpty()) Instant.parse(end);
      if (!start.isEmpty() && !end.isEmpty() && !Instant.parse(end).isAfter(Instant.parse(start)))
        throw new IllegalArgumentException();
    } catch (Exception e) { throw new ApiException("请检查开始和结束时间"); }
    return obj("id", r.get("id"), "title", str(r.get("title")).trim(), "enabled", r.get("enabled"),
        "event", r.get("event"), "channel", r.get("channel"),
        "pages", List.copyOf(new LinkedHashSet<>(list(r.get("pages")))), "audience", r.get("audience"),
        "usernames", List.copyOf(names), "startsAt", start, "endsAt", end,
        "duration", integer(r.get("duration")), "density", integer(r.get("density")));
  }

  private static boolean audience(Map<String, Object> r, Map<String, Object> a) {
    return switch (str(r.get("audience"))) {
      case "signed-in" -> a != null;
      case "scouts" -> a != null && eq(a.get("scoutStatus"), "approved");
      case "standard" -> a != null && !a.containsKey("role") && !eq(a.get("scoutStatus"), "approved");
      case "specific" -> a != null && list(r.get("usernames")).contains(a.get("username"));
      default -> true;
    };
  }

  private static boolean recent(Object value, long now, long window) {
    try { long at = Instant.parse(str(value)).toEpochMilli(); return at <= now && now - at < window; }
    catch (Exception e) { return false; }
  }

  public static boolean handle(ApiContext c) throws Exception {
    if (c.audience.equals("admin") && c.path.equals("/api/admin/celebrations")) {
      AdminPermissions.ownerOnly(c);
      if (c.method.equals("GET")) {
        c.send(obj("revision", integer(c.store.settings().get("celebrationRevision")), "rules", rules(c)));
        return true;
      }
      if (!c.method.equals("PUT")) return false;
      RequestValues.fields(c.body, "revision", "rules");
      if (!whole(c.body.get("revision")) || integer(c.body.get("revision")) != integer(c.store.settings().get("celebrationRevision")))
        throw new ApiException("设置已被其他管理员更新，请刷新后重试", 409);
      if (!(c.body.get("rules") instanceof List<?>) || list(c.body.get("rules")).size() > 24)
        throw new ApiException("最多设置24条庆祝规则");
      var clean = new ArrayList<Map<String, Object>>(); var ids = new HashSet<String>();
      for (Object value : list(c.body.get("rules"))) {
        if (!(value instanceof Map<?, ?>)) throw new ApiException("彩纸规则格式无效");
        var rule = normalize(map(value));
        if (!ids.add(str(rule.get("id")))) throw new ApiException("规则编号重复");
        clean.add(rule);
      }
      c.store.settings().put("celebrationRules", clean);
      c.store.settings().put("celebrationRevision", integer(c.body.get("revision")) + 1);
      c.audit("更新彩纸庆祝投放", "celebrations", "规则数 " + clean.size());
      c.store.save(); c.send(obj("ok", true)); return true;
    }
    if (!(c.audience.equals("user") && c.route("/api/celebrations/claim", "POST")
        || c.audience.equals("admin") && c.route("/api/admin/celebrations/claim", "POST"))) return false;
    if (c.miniProgram) throw new ApiException("此功能仅用于网页", 404);
    if (c.audience.equals("admin")) c.need();
    RequestValues.fields(c.body, "event", "page");
    String event = str(c.body.get("event")), page = str(c.body.get("page"));
    if (!EVENTS.contains(event) || !PAGES.contains(page)) throw new ApiException("触发条件无效");
    long now = TimeSource.now();
    boolean eligible = event.equals("page-enter");
    if (event.equals("scout-passed")) eligible = c.audience.equals("user") && c.account != null
        && eq(c.account.get("scoutStatus"), "approved") && eq(c.account.get("scoutSource"), "quiz")
        && integer(c.account.get("quizLastScore")) >= 3 && recent(c.account.get("quizLastAt"), now, 600000);
    if (event.equals("checkin-saved")) eligible = c.audience.equals("user") && c.account != null
        && c.store.indexed("checkins", "ownerId", str(c.account.get("id"))).stream()
            .anyMatch(row -> recent(row.get("createdAt"), now, 120000));
    if (eligible) for (var r : rules(c)) {
      if (!yes(r.get("enabled")) || !eq(r.get("event"), event)
          || !(eq(r.get("channel"), "both") || eq(r.get("channel"), c.audience))
          || !list(r.get("pages")).isEmpty() && !list(r.get("pages")).contains(page)
          || !audience(r, c.account)) continue;
      String start = str(r.get("startsAt")), end = str(r.get("endsAt"));
      if (!start.isEmpty() && Instant.parse(start).toEpochMilli() > now
          || !end.isEmpty() && Instant.parse(end).toEpochMilli() <= now) continue;
      String token = str(r.get("id")) + ":" + Security.digest(write(r)).substring(0, 16);
      if (c.account != null) {
        var seen = new LinkedHashMap<String, Object>(map(c.account.get("celebrationSeen")));
        if (seen.containsKey(token)) continue;
        seen.put(token, now);
        while (seen.size() > 96) seen.remove(seen.keySet().iterator().next());
        c.account.put("celebrationSeen", seen); c.store.save();
      }
      c.send(obj("items", List.of(obj("token", token, "duration", r.get("duration"), "density", r.get("density")))));
      return true;
    }
    c.send(obj("items", List.of())); return true;
  }
}
