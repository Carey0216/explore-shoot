package cn.campus.miniprogram;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import java.util.Map;
import java.util.Set;

/** A server-created adapter; no HTTP header can select this authentication channel. */
public final class MiniProgramRequest extends HttpServletRequestWrapper {
  private final String path;
  private final boolean administrator;

  public boolean administrator() {
    return administrator;
  }

  private static final String ID = "[a-z0-9-]+";
  private static final Map<String, Set<String>> EXACT =
      Map.ofEntries(
          Map.entry("/api/mini/config", Set.of("GET")),
          Map.entry("/api/site-content", Set.of("GET")),
          Map.entry("/api/runtime", Set.of("GET")),
          Map.entry("/api/features", Set.of("GET")),
          Map.entry("/api/topics", Set.of("GET")),
          Map.entry("/api/guides", Set.of("GET")),
          Map.entry("/api/maps/map-models", Set.of("GET")),
          Map.entry("/api/navigation/voices", Set.of("GET")),
          Map.entry("/api/navigation/speech", Set.of("POST")),
          Map.entry("/api/works/compare", Set.of("GET")),
          Map.entry("/api/assistant/chat", Set.of("POST")),
          Map.entry("/api/updates", Set.of("GET")),
          Map.entry("/api/localization/status", Set.of("GET")),
          Map.entry("/api/localization/translate", Set.of("POST")),
          Map.entry("/api/my/content", Set.of("GET")),
          Map.entry("/api/my/records", Set.of("GET")),
          Map.entry("/api/my/notes", Set.of("GET")),
          Map.entry("/api/sessions", Set.of("GET", "POST")),
          Map.entry("/api/plan", Set.of("POST")),
          Map.entry("/api/map/points", Set.of("GET")),
          Map.entry("/api/maps/buildings", Set.of("GET")),
          Map.entry("/api/maps/mini-config", Set.of("GET")),
          Map.entry("/api/maps/walking", Set.of("POST")),
          Map.entry("/api/maps/places", Set.of("GET")),
          Map.entry("/api/maps/model", Set.of("GET")),
          Map.entry("/api/maps/photo-model", Set.of("GET")),
          Map.entry("/api/assistant/plan-preview", Set.of("POST")),
          Map.entry("/api/celebrations/claim", Set.of("POST")),
          Map.entry("/api/my/plans", Set.of("GET", "POST")),
          Map.entry("/api/my/collections", Set.of("GET", "POST")),
          Map.entry("/api/my/topic-reminders", Set.of("GET", "POST")),
          Map.entry("/api/assistant/capabilities", Set.of("GET")),
          Map.entry("/api/assistant/query", Set.of("POST")),
          Map.entry("/api/announcements", Set.of("GET")),
          Map.entry("/api/mini/wechat/login", Set.of("POST")),
          Map.entry("/api/mini/wechat/complete", Set.of("POST")),
          Map.entry("/api/mini/wechat/bind", Set.of("POST")),
          Map.entry("/api/mini/wechat/unbind", Set.of("POST")),
          Map.entry("/api/auth/me", Set.of("GET")),
          Map.entry("/api/auth/login", Set.of("POST")),
          Map.entry("/api/auth/register", Set.of("POST")),
          Map.entry("/api/auth/logout", Set.of("POST")),
          Map.entry("/api/auth/profile", Set.of("PATCH")),
          Map.entry("/api/auth/password", Set.of("PATCH")),
          Map.entry("/api/auth/preferences", Set.of("GET", "PATCH")),
          Map.entry("/api/auth/avatar", Set.of("GET")),
          Map.entry("/api/catalog", Set.of("GET")),
          Map.entry("/api/points/search", Set.of("POST")),
          Map.entry("/api/points", Set.of("POST")),
          Map.entry("/api/bookmarks", Set.of("POST")),
          Map.entry("/api/checkins", Set.of("GET", "POST")),
          Map.entry("/api/media", Set.of("POST")),
          Map.entry("/api/my/library", Set.of("GET")),
          Map.entry("/api/my/passport", Set.of("GET")),
          Map.entry("/api/my/passport/scene", Set.of("GET")),
          Map.entry("/api/my/works", Set.of("GET")),
          Map.entry("/api/works", Set.of("GET")),
          Map.entry("/api/notifications", Set.of("GET")),
          Map.entry("/api/notifications/summary", Set.of("GET")),
          Map.entry("/api/notifications/read", Set.of("POST")),
          Map.entry("/api/contact-requests", Set.of("GET", "POST")),
          Map.entry("/api/conversations", Set.of("GET")),
          Map.entry("/api/scout/apply", Set.of("POST")),
          Map.entry("/api/scout/quiz", Set.of("GET")),
          Map.entry("/api/scout/quiz/start", Set.of("POST")),
          Map.entry("/api/scout/quiz/submit", Set.of("POST")),
          Map.entry("/api/reports", Set.of("POST")),
          Map.entry("/api/shooting-spots", Set.of("POST")));

  public MiniProgramRequest(HttpServletRequest request) {
    super(request);
    String incoming = request.getRequestURI();
    administrator = incoming.startsWith("/api/mini/admin/");
    if (administrator) {
      String tail = incoming.substring("/api/mini/admin/".length());
      path =
          tail.startsWith("localization/")
                  || tail.startsWith("auth/")
                  || tail.equals("media")
                  || tail.startsWith("media/")
                  || tail.startsWith("media-file/")
              ? "/api/" + tail
              : "/api/admin/" + tail;
      return;
    }
    path =
        incoming.startsWith("/api/mini/wechat/") || incoming.equals("/api/mini/config")
            ? incoming
            : "/api/" + incoming.substring("/api/mini/".length());
  }

  public boolean allowed() {
    if (administrator) {
      if (path.equals("/api/localization/status")) return getMethod().equals("GET");
      if (path.equals("/api/localization/translate")) return getMethod().equals("POST");
      if (path.matches("/api/auth/(me|login|logout|profile|password|preferences|avatar)"))
        return switch (path.substring(10)) {
          case "me", "avatar" -> getMethod().equals("GET");
          case "profile", "password" -> getMethod().equals("PATCH");
          case "preferences" -> Set.of("GET", "PATCH").contains(getMethod());
          default -> getMethod().equals("POST");
        };
      if (path.equals("/api/media")) return getMethod().equals("POST");
      if (path.matches("/api/media-file/" + ID)) return getMethod().equals("GET");
      if (path.matches("/api/admin/messages/media/" + ID)) return getMethod().equals("GET");
      if (path.equals("/api/admin/overview")) return getMethod().equals("GET");
      if (path.matches("/api/admin/inbox(/(summary|read))?"))
        return getMethod().equals("GET") || path.endsWith("/read") && getMethod().equals("POST");
      if (path.matches("/api/admin/conversations(/" + ID + "(/(read|messages))?)?"))
        return Set.of("GET", "POST", "PATCH").contains(getMethod());
      if (path.matches("/api/admin/announcements(/" + ID + ")?"))
        return Set.of("GET", "POST", "PUT", "DELETE").contains(getMethod());
      // Same business handlers and per-request AdminPermissions as the website. The native
      // adapter never accepts cookies or Origin, and never maps a user token to this audience.
      return path.matches(
              "/api/admin/(users|applications|scout-quiz|points|shooting-spots|works|work-reports|reports|routes|templates|passport|topics|guides|records|audit|knowledge|assistant-status|features|ai-settings|support-settings|site-content|updates|admins|permissions|owner-account|celebrations|campus-map|map-config|settings|metrics|content-deletion|review-queue)(/[a-zA-Z0-9._-]+)*")
          && Set.of("GET", "POST", "PUT", "PATCH", "DELETE").contains(getMethod());
    }

    if (EXACT.getOrDefault(path, Set.of()).contains(getMethod())) return true;
    return switch (getMethod()) {
      case "GET" ->
          path.matches("/api/sessions/" + ID + "(/export)?")
              || path.matches("/api/maps/map-models/[a-z0-9-]+/content.glb")
              || path.matches("/api/plan-shares/[a-f0-9]{64}")
              || path.matches("/api/my/plans/" + ID + "/share")
              || path.matches("/api/conversations/" + ID)
              || path.matches("/api/notifications/" + ID)
              || path.matches("/api/messages/media/" + ID)
              || path.matches("/api/points/" + ID + "/shooting-spots")
              || path.matches("/api/shooting-spots/" + ID + "(/photo)?")
              || path.matches("/api/works/" + ID + "/photo")
              || path.matches("/api/media/" + ID)
              || path.matches("/api/media-file/" + ID);
      case "POST" ->
          path.matches("/api/sessions/" + ID + "/track")
              || path.matches("/api/plan-shares/[a-f0-9]{64}/import")
              || path.matches("/api/my/plans/" + ID + "/share")
              || path.matches("/api/conversations/" + ID + "/(messages|read)")
              || path.matches("/api/announcements/" + ID + "/impressions")
              || path.matches("/api/points/" + ID + "/view")
              || path.matches("/api/works/" + ID + "/reports");
      case "PATCH" -> path.matches("/api/sessions/" + ID);
      case "PUT" ->
          path.matches("/api/my/plans/" + ID)
              || path.matches("/api/my/collections/" + ID)
              || path.matches("/api/points/" + ID + "/reaction")
              || path.matches("/api/checkins/" + ID + "/sharing");
      case "DELETE" ->
          path.matches("/api/sessions/" + ID)
              || path.matches("/api/my/plans/" + ID)
              || path.matches("/api/my/plans/" + ID + "/share")
              || path.matches("/api/my/collections/" + ID)
              || path.matches("/api/checkins/" + ID)
              || path.matches("/api/media/" + ID);
      default -> false;
    };
  }

  @Override
  public String getRequestURI() {
    // Private photos still pass through the original ownership/expiry handler.
    return path.startsWith("/api/media-file/") ? "/media/" + path.substring(16) : path;
  }
}
