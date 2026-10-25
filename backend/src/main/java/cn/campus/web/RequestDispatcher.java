package cn.campus.web;

import static cn.campus.common.Json.*;

import cn.campus.ExploreApplication;
import cn.campus.admin.AdminService;
import cn.campus.admin.DeletionService;
import cn.campus.ai.AiService;
import cn.campus.auth.AuthService;
import cn.campus.checkin.CheckinService;
import cn.campus.checkin.PassportService;
import cn.campus.common.ApiException;
import cn.campus.common.RateLimiter;
import cn.campus.exploration.ExplorationService;
import cn.campus.maps.MapConfigService;
import cn.campus.point.PointSearchService;
import cn.campus.point.PointService;
import cn.campus.storage.MediaService;
import cn.campus.storage.StoreRepository;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.springframework.web.bind.annotation.*;

@org.springframework.stereotype.Component
public class RequestDispatcher {
  private final StoreRepository store;
  private final AuthService auth;
  private final PointService points;
  private final PointSearchService search;
  private final CheckinService checkins;
  private final PassportService passport;
  private final ExplorationService exploration;
  private final AdminService admin;
  private final MediaService media;
  private final MapConfigService maps;
  private final cn.campus.maps.MiniMapRouting miniMaps;
  private final cn.campus.maps.CampusBuildingService buildings;
  private final cn.campus.maps.CampusLocalizationService localization;
  private final cn.campus.maps.CampusMapModelService mapModels;
  private final DeletionService deletion;
  private final AiService ai;
  private final RateLimiter limits;
  private final cn.campus.point.ShootingSpotService shootingSpots;
  private final cn.campus.checkin.WorkWallService workWall;
  private final cn.campus.notification.NotificationService notifications;
  private final cn.campus.miniprogram.MiniProgramService miniPrograms;
  private final cn.campus.content.SiteContentService siteContent;
  private final cn.campus.content.AnnouncementService announcements;
  private final cn.campus.ai.knowledge.AssistantService assistant;
  private final cn.campus.ai.knowledge.KnowledgeService knowledge;
  private final Release70Service release70;
  private final cn.campus.ai.LocalizationService languages;
  private final StaticCache staticCache = new StaticCache();
  private final HttpClient http =
      HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(10)).build();

  public RequestDispatcher(
      StoreRepository store,
      AuthService auth,
      PointService points,
      PointSearchService search,
      CheckinService checkins,
      PassportService passport,
      ExplorationService exploration,
      AdminService admin,
      MediaService media,
      MapConfigService maps,
      cn.campus.maps.CampusBuildingService buildings,
      cn.campus.maps.CampusLocalizationService localization,
      cn.campus.maps.CampusMapModelService mapModels,
      DeletionService deletion,
      AiService ai,
      RateLimiter limits,
      cn.campus.point.ShootingSpotService shootingSpots,
      cn.campus.checkin.WorkWallService workWall,
      cn.campus.notification.NotificationService notifications,
      cn.campus.miniprogram.MiniProgramService miniPrograms,
      cn.campus.content.SiteContentService siteContent,
      cn.campus.content.AnnouncementService announcements,
      cn.campus.ai.knowledge.AssistantService assistant,
      cn.campus.ai.knowledge.KnowledgeService knowledge,
      Release70Service release70,
      cn.campus.maps.MiniMapRouting miniMaps,
      cn.campus.ai.LocalizationService languages) {
    this.languages = languages;
    this.release70 = release70;
    this.assistant = assistant;
    this.knowledge = knowledge;
    this.siteContent = siteContent;
    this.announcements = announcements;
    this.miniPrograms = miniPrograms;
    this.shootingSpots = shootingSpots;
    this.workWall = workWall;
    this.notifications = notifications;
    this.store = store;
    this.auth = auth;
    this.points = points;
    this.search = search;
    this.checkins = checkins;
    this.passport = passport;
    this.exploration = exploration;
    this.admin = admin;
    this.media = media;
    this.maps = maps;
    this.miniMaps = miniMaps;
    this.buildings = buildings;
    this.localization = localization;
    this.mapModels = mapModels;
    this.deletion = deletion;
    this.ai = ai;
    this.limits = limits;
  }

  public void handle(HttpServletRequest req, HttpServletResponse res) throws IOException {
    long started = System.nanoTime();
    try {
      String
          audience =
              req.getLocalPort() == ExploreApplication.port("ADMIN_PORT", 4176) ? "admin" : "user",
          host = Objects.toString(req.getHeader("Host"), ""),
          domain = host.split(":")[0];
      if (req instanceof cn.campus.miniprogram.MiniProgramRequest mini) {
        if (!audience.equals(mini.administrator() ? "admin" : "user") || !mini.allowed())
          throw new ApiException("接口不存在", 404);
        // Mini-program requests use bearer credentials only, never ambient browser cookies.
        if (req.getHeader("Origin") != null) throw new ApiException("小程序接口不接受网页来源", 403);
      }
      if (!(audience.equals("user")
              ? List.of("explore.localhost", "127.0.0.1")
              : List.of("admin.localhost", "localhost", "127.0.0.1"))
          .contains(domain)) throw new ApiException("此域名不提供该端服务", 403);
      if (!List.of("GET", "HEAD").contains(req.getMethod())
          && req.getHeader("Origin") != null
          && !req.getHeader("Origin").equals("http://" + host))
        throw new ApiException("请求来源不允许", 403);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader(
          "Permissions-Policy",
          audience.equals("user")
              ? "camera=(self), geolocation=(self), microphone=()"
              : "camera=(), geolocation=(), microphone=()");
      // Nginx owns /admin/ on the server. Direct local previews use the configured admin port.
      if (audience.equals("user")
          && req.getRequestURI().equals("/admin/")
          && List.of("GET", "HEAD").contains(req.getMethod())) {
        res.setStatus(302);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader(
            "Location",
            "http://admin.localhost:" + ExploreApplication.port("ADMIN_PORT", 4176) + "/");
        return;
      }
      Map<String, Object> body = body(req);
      ApiContext c;
      try (var ignored = store.readAccess()) {
        c = new ApiContext(req, res, store, body);
        cn.campus.miniprogram.WechatTestAccounts.checkMutation(c);
        cn.campus.admin.AdminPermissions.guard(c);
        cn.campus.settings.InteractionFeatures.guard(c);
      }
      String wechatIdentity = c.miniProgram ? miniPrograms.exchange(c) : null;
      if (Set.of("/api/weather", "/api/photography/timing", "/api/admin/weather/preview")
              .contains(c.path)
          && release70.weather().handleOutside(c)) return;
      if (c.path.equals("/api/admin/preflight") && release70.preflight().handleOutside(c)) return;
      if (c.route("/api/localization/status", "GET")) {
        c.send(
            obj(
                "available",
                languages.available(),
                "languages",
                List.of("zh-CN", "en-US"),
                "localInference",
                true));
        return;
      }
      if (c.route("/api/localization/translate", "POST")) {
        limits.check((c.account == null ? c.ip : str(c.account.get("id"))) + ":localization", 100);
        var result = languages.translate(body);
        final ApiContext translationContext = c;
        AsyncContext async = req.startAsync();
        async.setTimeout(70000);
        async.addListener(
            new AsyncListener() {
              public void onComplete(AsyncEvent event) {}

              public void onStartAsync(AsyncEvent event) {}

              public void onError(AsyncEvent event) {
                result.cancel(true);
              }

              public void onTimeout(AsyncEvent event) {
                result.cancel(true);
              }
            });
        result.whenComplete(
            (value, failure) -> {
              try {
                if (failure != null) error(res, failure);
                else translationContext.send(value);
              } catch (Exception ignored) {
              } finally {
                try {
                  async.complete();
                } catch (Exception ignored) {
                }
              }
            });
        return;
      }
      if (miniMaps.handle(c)) return;
      if (assistant != null && assistant.handle(c)) return;
      if (audience.equals("user") && c.route("/api/navigation/voices", "GET")) {
        c.send(ai.options());
        return;
      }
      if (audience.equals("user") && c.route("/api/navigation/speech", "POST")) {
        limits.check(c.ip + ":navigation-speech", 40);
        CompletableFuture<byte[]> result = ai.synthesize(body);
        AsyncContext async = req.startAsync();
        async.setTimeout(100000);
        result.whenComplete(
            (wav, e) -> {
              try {
                if (e != null) error(res, e);
                else {
                  res.setContentType("audio/wav");
                  res.setContentLength(wav.length);
                  res.setHeader("Cache-Control", "no-store");
                  res.getOutputStream().write(wav);
                }
              } catch (Exception ignored) {
              } finally {
                try {
                  async.complete();
                } catch (Exception ignored) {
                }
              }
            });
        return;
      }
      if (audience.equals("user")
          && c.path.startsWith("/_AMapService/")
          && c.method.equals("GET")) {
        amap(c);
        return;
      }
      // Public program downloads must not hold the account/data transaction lock.
      // Media still goes through its authenticated handler below.
      if (!c.path.startsWith("/api/") && !c.path.startsWith("/media/")) {
        if (audience.equals("user") && (c.path.equals("/admin") || c.path.startsWith("/admin/")))
          throw new ApiException("页面不存在", 404);
        staticFile(c);
        return;
      }
      if (c.route("/api/media", "POST")) {
        try (var guard = store.readAccess()) {
          c.need();
          if (media.preflight(c)) return;
        }
        // CPU and file I/O are outside the shared business transaction.
        var prepared = media.prepare(body);
        String id = cn.campus.auth.Security.id();
        Path file = store.directory.resolve("media/" + id + ".jpg");
        Files.write(file, prepared.jpeg(), StandardOpenOption.CREATE_NEW);
        boolean committed = false;
        try {
          try (var guard = store.writeAccess()) {
            c = new ApiContext(req, res, store, body);
            c.need();
            cn.campus.miniprogram.WechatTestAccounts.checkMutation(c);
            cn.campus.admin.AdminPermissions.guard(c);
            cn.campus.settings.InteractionFeatures.guard(c);
            store.beginChanges();
            long writes = store.writes;
            try {
              committed = media.commitUpload(c, prepared, id);
            } catch (Exception error) {
              if (store.writes == writes) store.rollbackChanges();
              throw error;
            } finally {
              if (store.writes > writes) committed = true;
            }
          }
        } finally {
          if (!committed) Files.deleteIfExists(file);
        }
        return;
      }
      boolean readOnly = readOnly(c);
      try (var ignored = readOnly ? store.readAccess() : store.writeAccess()) {
        // Re-evaluate sessions after acquiring the transaction lock.
        c = new ApiContext(req, res, store, body);
        cn.campus.miniprogram.WechatTestAccounts.checkMutation(c);
        cn.campus.admin.AdminPermissions.guard(c);
        cn.campus.settings.InteractionFeatures.guard(c);
        boolean mutation = !List.of("GET", "HEAD").contains(c.method) && c.path.startsWith("/api/");
        if (!readOnly) store.beginChanges();
        long writes = store.writes;
        try {
          if (c.path.equals("/api/runtime") && c.method.equals("GET")) {
            c.send(
                obj(
                    "name",
                    store.environment.get("name"),
                    "instanceId",
                    store.environment.get("instanceId"),
                    "label",
                    cn.campus.settings.RuntimeEnvironment.label(
                        str(store.environment.get("name")))));
            return;
          }
          if (c.path.equals("/api/health")) {
            c.send(
                obj(
                    "ok",
                    true,
                    "app",
                    "explore-shoot",
                    "version",
                    2,
                    "release",
                    ExploreApplication.class.getPackage().getImplementationVersion() != null
                        ? ExploreApplication.class.getPackage().getImplementationVersion()
                        : parse(Files.readString(store.root.resolve("package.json")))
                            .get("version"),
                    "audience",
                    audience,
                    "backend",
                    "java",
                    "build",
                    System.getenv()
                        .getOrDefault(
                            "EXPLORE_BUILD_HASH",
                            System.getProperty("explore.build.hash", "direct-java")),
                    "environment",
                    store.environment.get("name"),
                    "javaVersion",
                    System.getProperty("java.version")));
            return;
          }
          if (audience.equals("user")
              && (c.path.startsWith("/api/admin")
                  || c.path.equals("/admin")
                  || c.path.startsWith("/admin/"))) throw new ApiException("页面不存在", 404);
          if (release70.handle(c)
              || knowledge.handleAdmin(c)
              || siteContent.handle(c)
              || announcements.handle(c)
              || miniPrograms.handle(c, wechatIdentity)
              || auth.handle(c)
              || search.handle(c)
              || points.handle(c)
              || passport.handle(c)
              || shootingSpots.handle(c)
              || workWall.handle(c)
              || notifications.handle(c)
              || checkins.handle(c)
              || exploration.handle(c)
              || deletion.handle(c)
              || maps.handle(c)
              || buildings.handle(c)
              || mapModels.handle(c)
              || localization.handle(c)
              || admin.handle(c)
              || media.handle(c)) return;
          if (c.path.startsWith("/api/")) throw new ApiException("接口不存在", 404);
          staticFile(c);
        } catch (Exception e) {
          if (!readOnly && store.writes == writes) {
            store.rollbackChanges();
            res.setHeader("Set-Cookie", null);
          }
          throw e;
        }
      }
    } catch (Exception e) {
      error(res, e);
    } finally {
      if (!req.isAsyncStarted())
        RuntimeMetrics.record(
            req.getMethod(), req.getRequestURI(), res.getStatus(), System.nanoTime() - started);
    }
  }

  private static boolean readOnly(ApiContext c) {
    if (c.method.equals("POST") && c.path.equals("/api/assistant/plan-preview")) return true;
    if (c.method.equals("GET")
        && Set.of(
                "/api/updates",
                "/api/admin/updates",
                "/api/guides",
                "/api/admin/guides",
                "/api/my/notes",
                "/api/my/records",
                "/api/my/passport",
                "/api/my/passport/scene",
                "/api/my/library",
                "/api/map/points",
                "/api/works/compare",
                "/api/admin/inbox",
                "/api/admin/inbox/summary")
            .contains(c.path)) return true;
    if (c.method.equals("GET") && c.path.matches("/api/(?:admin/)?conversations(?:/[a-f0-9-]+)?"))
      return true;
    if (c.method.equals("GET") && c.path.matches("/api/sessions/[a-f0-9-]+")) return true;
    if (c.method.equals("POST") && c.path.equals("/api/points/search")) return true;
    if (c.method.equals("GET")
        && (c.path.equals("/api/admin/review-queue")
            || c.path.equals("/api/admin/performance/runtime"))) return true;
    if (c.method.equals("GET")
        && (c.path.matches("/media/[a-f0-9-]+")
            || c.path.matches("/api/(?:admin/)?(?:shooting-spots|works)/[a-f0-9-]+/photo")
            || c.path.matches("/api/(?:admin/)?messages/media/[a-f0-9-]+"))) return true;
    return c.method.equals("GET")
        && Set.of(
                "/api/runtime",
                "/api/health",
                "/api/catalog",
                "/api/site-content",
                "/api/auth/me",
                "/api/checkins")
            .contains(c.path);
  }

  private Map<String, Object> body(HttpServletRequest req) throws IOException {
    if (!List.of("POST", "PATCH", "PUT", "DELETE").contains(req.getMethod())) return obj();
    if (req.getMethod().equals("DELETE") && req.getContentLengthLong() <= 0) return obj();
    if (req.getContentType() == null || !req.getContentType().startsWith("application/json"))
      throw new ApiException("请使用 JSON 请求", 415);
    byte[] data = req.getInputStream().readNBytes(8 * 1024 * 1024 + 1);
    if (data.length > 8 * 1024 * 1024) throw new ApiException("上传内容过大", 413);
    return parse(data.length == 0 ? "{}" : new String(data, StandardCharsets.UTF_8));
  }

  private void staticFile(ApiContext c) throws Exception {
    if (!List.of("GET", "HEAD").contains(c.method)) throw new ApiException("不支持该操作", 405);
    String pagePath = c.path.replaceFirst("^/(zh-CN|en-US)(?=/|$)", "");
    if (pagePath.isEmpty()) pagePath = "/";
    boolean shared = pagePath.startsWith("/shared/");
    Path allowed =
        store.root.resolve("dist/" + (shared ? "shared" : c.audience)).toAbsolutePath().normalize();
    String suffix =
        shared ? pagePath.substring(7) : pagePath.equals("/") ? "/index.html" : pagePath;
    if (!pagePath.equals(c.path)
        && (pagePath.startsWith("/api/") || pagePath.startsWith("/media/")))
      throw new ApiException("页面不存在", 404);
    String decoded = URLDecoder.decode(suffix.replace("+", "%2B"), StandardCharsets.UTF_8);
    Path file =
        allowed.resolve(decoded.startsWith("/") ? decoded.substring(1) : decoded).normalize();
    if (!file.startsWith(allowed)
        || file.equals(allowed)
        || !Files.isRegularFile(file)
        || !file.toRealPath().startsWith(allowed.toRealPath()))
      throw new ApiException("页面不存在", 404);
    String name = file.getFileName().toString(),
        extension = name.substring(name.lastIndexOf('.') + 1);
    String type =
        switch (extension) {
          case "html" -> "text/html; charset=utf-8";
          case "js" -> "application/javascript; charset=utf-8";
          case "css" -> "text/css; charset=utf-8";
          case "jpg", "jpeg" -> "image/jpeg";
          case "png" -> "image/png";
          case "svg" -> "image/svg+xml";
          case "geojson" -> "application/geo+json; charset=utf-8";
          case "json" -> "application/json; charset=utf-8";
          case "glb" -> "model/gltf-binary";
          case "txt" -> "text/plain; charset=utf-8";
          default -> "application/octet-stream";
        };
    if ("thumb".equals(c.request.getParameter("size"))
        && List.of("jpg", "jpeg", "png").contains(extension)) {
      file = cn.campus.storage.PhotoVariants.thumbnail(store, file);
      type = "image/jpeg";
    }
    c.response.setContentType(type);
    if (staticCache.notModified(c.request, c.response, file)) return;
    c.response.setContentLengthLong(Files.size(file));
    if (!c.method.equals("HEAD")) Files.copy(file, c.response.getOutputStream());
  }

  private void amap(ApiContext c) throws Exception {
    String key, secret;
    try (var ignored = store.readAccess()) {
      if (!eq(store.settings().get("mapProvider"), "amap")
          || str(store.settings().get("amapKey")).isEmpty()
          || str(store.settings().get("amapSecurity")).isEmpty())
        throw new ApiException("地图服务尚未配置", 503);
      key = str(store.settings().get("amapKey"));
      secret = str(store.settings().get("amapSecurity"));
    }
    String suffix = c.path.substring("/_AMapService".length());
    if (!suffix.matches("/v[345]/(place|geocode|direction|map|ip|assistant)/.*")
        && !suffix.equals("/v3/ip")) throw new ApiException("地图接口不可用", 404);
    Map<String, String> query = new LinkedHashMap<>();
    String raw = c.request.getQueryString();
    if (raw != null)
      for (String pair : raw.split("&")) {
        String[] p = pair.split("=", 2);
        query.put(
            URLDecoder.decode(p[0], StandardCharsets.UTF_8),
            p.length > 1 ? URLDecoder.decode(p[1], StandardCharsets.UTF_8) : "");
      }
    query.put("jscode", secret);
    query.put("key", key);
    String parameters =
        String.join(
            "&",
            query.entrySet().stream()
                .map(
                    e ->
                        URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8)
                            + "="
                            + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .toList());
    HttpResponse<byte[]> response =
        http.send(
            HttpRequest.newBuilder(
                    URI.create(
                        (suffix.startsWith("/v4/map/")
                                ? "https://webapi.amap.com"
                                : "https://restapi.amap.com")
                            + suffix
                            + "?"
                            + parameters))
                .timeout(java.time.Duration.ofSeconds(10))
                .GET()
                .build(),
            HttpResponse.BodyHandlers.ofByteArray());
    c.response.setStatus(response.statusCode());
    c.response.setContentType(
        response.headers().firstValue("content-type").orElse("application/json"));
    c.response.getOutputStream().write(response.body());
  }

  private static void error(HttpServletResponse res, Throwable e) throws IOException {
    ApiErrors.send(res, e);
  }
}
