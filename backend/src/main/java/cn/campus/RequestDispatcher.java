package cn.campus;

import static cn.campus.Json.*;

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
  private final DeletionService deletion;
  private final AiService ai;
  private final RateLimiter limits;
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
      DeletionService deletion,
      AiService ai,
      RateLimiter limits) {
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
    this.deletion = deletion;
    this.ai = ai;
    this.limits = limits;
  }

  public void handle(HttpServletRequest req, HttpServletResponse res) throws IOException {
    try {
      String
          audience =
              req.getLocalPort() == ExploreApplication.port("ADMIN_PORT", 4176) ? "admin" : "user",
          host = Objects.toString(req.getHeader("Host"), ""),
          domain = host.split(":")[0];
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
      Map<String, Object> body = body(req);
      ApiContext c;
      synchronized (store.mutex) {
        c = new ApiContext(req, res, store, body);
      }
      if (audience.equals("user") && c.route("/api/translation", "POST")) {
        translation(c);
        return;
      }
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
      synchronized (store.mutex) {
        // Re-evaluate sessions after acquiring the transaction lock.
        c = new ApiContext(req, res, store, body);
        boolean mutation = !List.of("GET", "HEAD").contains(c.method) && c.path.startsWith("/api/");
        Map<String, Object> before = mutation ? Json.clone(store.db) : null;
        long writes = store.writes;
        try {
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
                    "javaVersion",
                    System.getProperty("java.version")));
            return;
          }
          if (audience.equals("user")
              && (c.path.startsWith("/api/admin")
                  || c.path.equals("/admin")
                  || c.path.startsWith("/admin/"))) throw new ApiException("页面不存在", 404);
          if (auth.handle(c)
              || search.handle(c)
              || points.handle(c)
              || passport.handle(c)
              || checkins.handle(c)
              || exploration.handle(c)
              || deletion.handle(c)
              || maps.handle(c)
              || admin.handle(c)
              || media.handle(c)) return;
          if (c.path.startsWith("/api/")) throw new ApiException("接口不存在", 404);
          staticFile(c);
        } catch (Exception e) {
          if (mutation && store.writes == writes) {
            store.db = before;
            res.setHeader("Set-Cookie", null);
          }
          throw e;
        }
      }
    } catch (Exception e) {
      error(res, e);
    }
  }

  private Map<String, Object> body(HttpServletRequest req) throws IOException {
    if (!List.of("POST", "PATCH", "PUT").contains(req.getMethod())) return obj();
    if (req.getContentType() == null || !req.getContentType().startsWith("application/json"))
      throw new ApiException("请使用 JSON 请求", 415);
    byte[] data = req.getInputStream().readNBytes(8 * 1024 * 1024 + 1);
    if (data.length > 8 * 1024 * 1024) throw new ApiException("上传内容过大", 413);
    return parse(data.length == 0 ? "{}" : new String(data, StandardCharsets.UTF_8));
  }

  private void staticFile(ApiContext c) throws Exception {
    if (!List.of("GET", "HEAD").contains(c.method)) throw new ApiException("不支持该操作", 405);
    boolean shared = c.path.startsWith("/shared/");
    Path allowed =
        store.root.resolve("dist/" + (shared ? "shared" : c.audience)).toAbsolutePath().normalize();
    String suffix = shared ? c.path.substring(7) : c.path.equals("/") ? "/index.html" : c.path;
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
          case "txt" -> "text/plain; charset=utf-8";
          default -> "application/octet-stream";
        };
    c.response.setContentType(type);
    c.response.setHeader("Cache-Control", "no-cache");
    if (!c.method.equals("HEAD")) Files.copy(file, c.response.getOutputStream());
  }

  private void translation(ApiContext c) throws Exception {
    limits.check(c.ip + ":translation", 40);
    Map<String, Object> b = c.body;
    String target = str(b.get("target"));
    if (!List.of("zh-CN", "zh-TW", "ja", "en").contains(target)) throw new ApiException("翻译参数无效");
    Object content;
    if (b.get("texts") instanceof List) {
      if (b.keySet().stream().anyMatch(k -> !List.of("texts", "target").contains(k)))
        throw new ApiException("翻译参数无效");
      content = b.get("texts");
    } else {
      if (b.keySet().stream().anyMatch(k -> !List.of("pointId", "target").contains(k))
          || !(b.get("pointId") instanceof String)) throw new ApiException("翻译参数无效");
      synchronized (store.mutex) {
        Map<String, Object> p =
            store.rows("points").stream()
                .filter(
                    x ->
                        eq(x.get("id"), b.get("pointId"))
                            && yes(x.get("published"))
                            && x.get("authorId") != null)
                .findFirst()
                .orElse(null);
        if (p == null) throw new ApiException("此社区内容暂不可翻译", 404);
        content = p.get("description");
      }
    }
    AtomicReference<Process> process = new AtomicReference<>();
    AtomicBoolean cancelled = new AtomicBoolean();
    AsyncContext async = c.request.startAsync();
    async.setTimeout(65000);
    Runnable cancel =
        () -> {
          cancelled.set(true);
          Process p = process.get();
          if (p != null) p.destroyForcibly();
        };
    async.addListener(
        new AsyncListener() {
          public void onComplete(AsyncEvent e) {
            cancel.run();
          }

          public void onTimeout(AsyncEvent e) {
            cancel.run();
            try {
              error(c.response, new ApiException("翻译超时，请重试", 504));
              async.complete();
            } catch (Exception ignored) {
            }
          }

          public void onError(AsyncEvent e) {
            cancel.run();
          }

          public void onStartAsync(AsyncEvent e) {}
        });
    Thread.startVirtualThread(
        () -> {
          try {
            Map<String, Object> result = ai.translate(content, target, process, cancelled);
            if (!cancelled.get()) c.send(result);
          } catch (Exception e) {
            if (!cancelled.get())
              try {
                error(c.response, e);
              } catch (Exception ignored) {
              }
          } finally {
            cancel.run();
            try {
              async.complete();
            } catch (Exception ignored) {
            }
          }
        });
  }

  private void amap(ApiContext c) throws Exception {
    String key, secret;
    synchronized (store.mutex) {
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
    while (e instanceof CompletionException || e instanceof ExecutionException) e = e.getCause();
    if (res.isCommitted()) return;
    int status = e instanceof ApiException a ? a.status : 500;
    res.setStatus(status);
    res.setContentType("application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.getOutputStream()
        .write(
            write(obj("error", e instanceof ApiException ? e.getMessage() : "服务暂时不可用，请重试"))
                .getBytes(StandardCharsets.UTF_8));
    if (!(e instanceof ApiException))
      System.err.println("Request failed: " + e.getClass().getSimpleName());
  }
}
