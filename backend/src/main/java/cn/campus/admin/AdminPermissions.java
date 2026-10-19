package cn.campus.admin;

import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.util.*;

/** Explicit per-feature grants are checked again for each HTTP request, never trusted from a UI. */
public final class AdminPermissions {
  public static final Map<String, String> FEATURES = new LinkedHashMap<>();

  static {
    String[][] entries = {
      {"overview", "工作台"},
      {"messages", "用户联系与私信"},
      {"users", "用户账号"},
      {"applications", "探索官申请"},
      {"scout-quiz", "探索官题库"},
      {"points", "校园点位"},
      {"shooting-spots", "真实机位"},
      {"works", "作品审核"},
      {"work-reports", "作品举报"},
      {"reports", "点位反馈"},
      {"content", "路线与任务"},
      {"passport", "护照与印章"},
      {"campus-map", "校园地图"},
      {"site-content", "站点文案"},
      {"announcements", "开屏公告"},
      {"knowledge", "校园知识库"},
      {"topics", "季节与活动专题"},
      {"audit", "操作记录"},
      {"statistics", "浏览与热度"},
      {"map-config", "地图SDK配置"},
      {"administrators", "管理员账号"},
      {"features", "交互入口与功能"},
      {"ai-settings", "模型与客服配置"},
      {"content-deletion", "永久删除"}
    };
    for (var e : entries) FEATURES.put(e[0], e[1]);
  }

  public static boolean owner(Map<String, Object> account) {
    return account != null && eq(account.get("role"), "owner");
  }

  public static boolean privileged(Map<String, Object> account) {
    return owner(account) || account != null && eq(account.get("role"), "super");
  }

  public static Set<String> keys() {
    var keys = new LinkedHashSet<String>();
    FEATURES
        .keySet()
        .forEach(
            k -> {
              keys.add(k + ".read");
              keys.add(k + ".write");
            });
    return keys;
  }

  public static boolean has(Map<String, Object> account, String key) {
    if (account == null || !keys().contains(key)) return false;
    if (owner(account)) return true;
    if (key.startsWith("map-config.")) return false;
    Object override = map(account.get("permissionOverrides")).get(key);
    if (override instanceof Boolean b) return b;
    String feature = key.split("\\.")[0];
    if (Set.of("features", "ai-settings").contains(feature)) return false;
    if (eq(account.get("role"), "super")) return true;
    return !Set.of("statistics", "map-config", "administrators").contains(feature);
  }

  public static Map<String, Object> overrides(Object value) {
    if (!(value instanceof Map<?, ?>) || map(value).size() > keys().size())
      throw new ApiException("功能权限格式无效");
    var result = obj();
    for (var entry : map(value).entrySet()) {
      if (!keys().contains(entry.getKey()) || !(entry.getValue() instanceof Boolean))
        throw new ApiException("未知权限或权限值无效");
      result.put(entry.getKey(), entry.getValue());
    }
    return result;
  }

  public static boolean ownerExists(StoreRepository store) {
    return store.rows("admins").stream().anyMatch(AdminPermissions::owner);
  }

  public static String feature(String path) {
    if (path.startsWith("/api/admin/")) {
      if (path.matches("/api/admin/points/[^/]+/popularity")) return "statistics";
      String part = path.substring(11).split("/")[0];
      return switch (part) {
        case "admins", "permissions", "owner-account" -> "administrators";
        case "settings" -> "map-config";
        case "records" -> "audit";
        case "conversations" -> "messages";
        case "routes", "templates" -> "content";
        case "assistant-status" -> "knowledge";
        default -> part;
      };
    }
    return "";
  }

  public static void guard(ApiContext c) {
    if (c.audience.equals("admin") && c.path.equals("/api/media") && c.method.equals("POST")) {
      c.need();
      if (List.of(
              "points",
              "shooting-spots",
              "content",
              "campus-map",
              "site-content",
              "announcements",
              "messages")
          .stream()
          .noneMatch(f -> has(c.account, f + ".write")))
        throw new ApiException("当前账号未获内容图片上传权限", 403);
    }
    if (!c.audience.equals("admin") || !c.path.startsWith("/api/admin/")) return;
    c.need();
    String f = feature(c.path);
    if (!FEATURES.containsKey(f)) return;
    if ((f.equals("administrators") && ownerExists(c.store)
            || f.equals("features")
            || f.equals("ai-settings")
            || f.equals("map-config"))
        && !owner(c.account)) throw new ApiException("此入口仅顶级管理员可管理", 403);
    String mode =
        Set.of("GET", "HEAD").contains(c.method)
                || c.path.matches("/api/admin/conversations/[^/]+/read")
            ? "read"
            : "write";
    if (f.equals("overview") && mode.equals("read")) return;
    if (!has(c.account, f + "." + mode))
      throw new ApiException("当前账号未获此功能的" + (mode.equals("read") ? "查看" : "修改") + "权限", 403);
  }

  public static void ownerOnly(ApiContext c) {
    c.need();
    if (!owner(c.account)) throw new ApiException("仅顶级管理员可操作", 403);
  }

  public static Map<String, Object> filterOverview(ApiContext c, Map<String, Object> data) {
    if (ownerExists(c.store) && !owner(c.account)) {
      var account = map(data.get("account"));
      account.put(
          "effectivePermissions",
          list(account.get("effectivePermissions")).stream()
              .filter(k -> !str(k).startsWith("administrators."))
              .toList());
    }
    Map<String, String> fields =
        Map.ofEntries(
            Map.entry("users", "users"),
            Map.entry("applications", "applications"),
            Map.entry("points", "points"),
            Map.entry("shootingSpots", "shooting-spots"),
            Map.entry("works", "works"),
            Map.entry("workReports", "work-reports"),
            Map.entry("reports", "reports"),
            Map.entry("routes", "content"),
            Map.entry("templates", "content"),
            Map.entry("audit", "audit"),
            Map.entry("logs", "audit"));
    for (var e : fields.entrySet())
      if (!has(c.account, e.getValue() + ".read")) data.put(e.getKey(), List.of());
    if (!owner(c.account) && ownerExists(c.store) || !has(c.account, "administrators.read"))
      data.put("admins", List.of());
    if (!has(c.account, "audit.read")) {
      data.put("sessions", List.of());
      data.put("legacyArchive", obj());
    }
    var summary = map(data.get("summary"));
    if (!has(c.account, "overview.read")) summary.clear();
    Map<String, String> summaryFeatures =
        Map.ofEntries(
            Map.entry("publishedPoints", "points"),
            Map.entry("communityPoints", "points"),
            Map.entry("pendingApplications", "applications"),
            Map.entry("pendingReports", "reports"),
            Map.entry("activeRoutes", "content"),
            Map.entry("approvedTemplates", "content"),
            Map.entry("explorations", "audit"),
            Map.entry("completedExplorations", "audit"));
    summaryFeatures.forEach(
        (k, v) -> {
          if (!has(c.account, v + ".read")) summary.remove(k);
        });
    for (var item : fields.entrySet())
      if (!has(c.account, item.getValue() + ".read")) summary.remove(item.getKey());
    // Summary is aggregate operational information only; no individual private plan or draft is
    // included.
    return data;
  }
}
