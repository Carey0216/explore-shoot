package cn.campus.settings;

import static cn.campus.common.Json.*;

import cn.campus.admin.AdminPermissions;
import cn.campus.common.ApiException;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.util.*;
import org.springframework.stereotype.Service;

/** The same switches control server availability and all supported client entry points. */
@Service
public final class InteractionFeatures {
  public static final Map<String, String> LABELS = new LinkedHashMap<>();

  static {
    String[][] features = {
      {"framing", "站位取景辅助"},
      {"plans", "拍摄清单"},
      {"experience", "作品经验卡"},
      {"offline", "离线公开资料"},
      {"topics", "季节与活动专题"},
      {"assistant", "自然语言找机位"},
      {"support", "AI客服"},
      {"publishing", "发布与打卡"},
      {"reactions", "喜欢与不喜欢"},
      {"announcements", "开屏公告"},
      {"passport", "打卡护照"},
      {"notifications", "站内通知"},
      {"exploration", "校园探索"},
      {"bookmarks", "收藏机位"},
      {"feedback", "举报与问题反馈"},
      {"scout", "探索官申请"},
      {"work-wall", "公开作品墙"},
      {"map-3d", "导航地图立体模式"},
      {"campus-3d", "三维校园界面"},
      {"panorama", "校园实景全景"},
      {"messages", "联系管理员与私信"}
    };
    for (var f : features) LABELS.put(f[0], f[1]);
  }

  public static Map<String, Object> flags(StoreRepository s) {
    var saved = map(s.settings().get("interactionFeatures"));
    var out = obj();
    for (String k : LABELS.keySet()) {
      var v = map(saved.get(k));
      out.put(
          k,
          obj(
              "enabled",
              v.getOrDefault("enabled", true),
              "visible",
              v.getOrDefault("visible", true)));
    }
    return out;
  }

  public static boolean enabled(StoreRepository s, String key) {
    return yes(map(flags(s).get(key)).get("enabled"));
  }

  public static void require(StoreRepository s, String key) {
    if (!enabled(s, key)) throw new ApiException("此功能暂未开放", 403);
  }

  public boolean handle(ApiContext c) throws Exception {
    if (c.audience.equals("user") && c.route("/api/features", "GET")
        || c.audience.equals("admin") && c.route("/api/admin/feature-visibility", "GET")) {
      if (c.audience.equals("admin")) c.need();
      c.send(
          obj(
              "features",
              flags(c.store),
              "revision",
              integer(c.store.settings().get("featureRevision"))));
      return true;
    }
    if (!c.audience.equals("admin") || !c.path.equals("/api/admin/features")) return false;
    AdminPermissions.ownerOnly(c);
    if (c.method.equals("GET")) {
      c.send(
          obj(
              "features",
              flags(c.store),
              "labels",
              LABELS,
              "revision",
              integer(c.store.settings().get("featureRevision"))));
      return true;
    }
    if (!c.method.equals("PUT")) return false;
    if (!whole(c.body.get("revision"))
        || integer(c.body.get("revision")) != integer(c.store.settings().get("featureRevision")))
      throw new ApiException("功能设置已更新，请重新载入", 409);
    var values = map(c.body.get("features"));
    if (!values.keySet().equals(LABELS.keySet())) throw new ApiException("功能列表不完整");
    for (var v : values.values())
      if (!(v instanceof Map<?, ?>)
          || !map(v).keySet().equals(Set.of("enabled", "visible"))
          || !(map(v).get("enabled") instanceof Boolean)
          || !(map(v).get("visible") instanceof Boolean)) throw new ApiException("功能开关无效");
    c.store.settings().put("interactionFeatures", values);
    c.store.settings().put("featureRevision", integer(c.body.get("revision")) + 1);
    c.audit("调整交互功能入口", "features", "开关与显示范围已更新");
    c.store.save();
    c.send(obj("ok", true));
    return true;
  }

  public static void guard(ApiContext c) {
    if (!c.audience.equals("user")) return;
    String p = c.path;
    if (p.equals("/api/maps/photo-model") || p.equals("/api/my/passport/scene"))
      require(c.store, "campus-3d");
    if (p.startsWith("/api/maps/map-models")) require(c.store, "map-3d");
    String feature =
        p.equals("/api/sessions") && c.method.equals("POST")
            ? "exploration"
            : p.startsWith("/api/my/plans")
                ? "plans"
                : p.startsWith("/api/topics")
                    ? "topics"
                    : (p.startsWith("/api/assistant/query") || p.startsWith("/api/assistant/chat"))
                        ? (eq(c.body.get("purpose"), "support") ? "support" : "assistant")
                        : p.matches("/api/points/[^/]+/reaction")
                            ? "reactions"
                            : p.startsWith("/api/announcements")
                                ? "announcements"
                                : p.startsWith("/api/my/passport")
                                    ? "passport"
                                    : p.startsWith("/api/notifications")
                                        ? "notifications"
                                        : p.equals("/api/checkins") && c.method.equals("POST")
                                                || p.equals("/api/points")
                                                    && c.method.equals("POST")
                                            ? "publishing"
                                            : "";
    if (!feature.isEmpty()) require(c.store, feature);
    if (p.startsWith("/api/contact-requests") || p.startsWith("/api/conversations"))
      require(c.store, "messages");
    if (p.equals("/api/bookmarks")) require(c.store, "bookmarks");
    if (p.startsWith("/api/scout/quiz")) require(c.store, "scout");
    if (p.equals("/api/scout/apply")) require(c.store, "scout");
    if (p.equals("/api/reports") || p.matches("/api/works/[^/]+/reports"))
      require(c.store, "feedback");
    if (p.startsWith("/api/works") && c.method.equals("GET")
        || p.endsWith("/sharing") && yes(c.body.get("public"))
        || p.equals("/api/checkins") && yes(c.body.get("shareToWall")))
      require(c.store, "work-wall");
    if (p.endsWith("/sharing") && yes(c.body.get("public"))) require(c.store, "publishing");
  }
}
