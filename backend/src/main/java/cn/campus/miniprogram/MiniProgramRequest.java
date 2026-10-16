package cn.campus.miniprogram;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import java.util.Map;
import java.util.Set;

/** A server-created adapter; no HTTP header can select this authentication channel. */
public final class MiniProgramRequest extends HttpServletRequestWrapper {
  private final String path;
  private static final String ID = "[a-z0-9-]+";
  private static final Map<String, Set<String>> EXACT =
      Map.ofEntries(
          Map.entry("/api/mini/config", Set.of("GET")),
          Map.entry("/api/mini/wechat/login", Set.of("POST")),
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
          Map.entry("/api/bookmarks", Set.of("POST")),
          Map.entry("/api/checkins", Set.of("GET", "POST")),
          Map.entry("/api/media", Set.of("POST")),
          Map.entry("/api/my/library", Set.of("GET")),
          Map.entry("/api/my/passport", Set.of("GET")),
          Map.entry("/api/my/works", Set.of("GET")),
          Map.entry("/api/works", Set.of("GET")),
          Map.entry("/api/notifications", Set.of("GET")),
          Map.entry("/api/notifications/summary", Set.of("GET")),
          Map.entry("/api/notifications/read", Set.of("POST")),
          Map.entry("/api/scout/apply", Set.of("POST")),
          Map.entry("/api/reports", Set.of("POST")),
          Map.entry("/api/shooting-spots", Set.of("POST")));

  public MiniProgramRequest(HttpServletRequest request) {
    super(request);
    String incoming = request.getRequestURI();
    path =
        incoming.startsWith("/api/mini/wechat/") || incoming.equals("/api/mini/config")
            ? incoming
            : "/api/" + incoming.substring("/api/mini/".length());
  }

  public boolean allowed() {
    if (EXACT.getOrDefault(path, Set.of()).contains(getMethod())) return true;
    return switch (getMethod()) {
      case "GET" ->
          path.matches("/api/points/" + ID + "/shooting-spots")
              || path.matches("/api/shooting-spots/" + ID + "(/photo)?")
              || path.matches("/api/works/" + ID + "/photo")
              || path.matches("/api/media/" + ID)
              || path.matches("/api/media-file/" + ID);
      case "POST" ->
          path.matches("/api/points/" + ID + "/view")
              || path.matches("/api/works/" + ID + "/reports");
      case "PUT" ->
          path.matches("/api/points/" + ID + "/reaction")
              || path.matches("/api/checkins/" + ID + "/sharing");
      case "DELETE" -> path.matches("/api/checkins/" + ID) || path.matches("/api/media/" + ID);
      default -> false;
    };
  }

  @Override
  public String getRequestURI() {
    // Private photos still pass through the original ownership/expiry handler.
    return path.startsWith("/api/media-file/") ? "/media/" + path.substring(16) : path;
  }
}
