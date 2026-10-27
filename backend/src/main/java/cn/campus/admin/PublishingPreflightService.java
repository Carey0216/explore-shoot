package cn.campus.admin;

import static cn.campus.common.Json.*;

import cn.campus.common.*;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import javax.net.ssl.*;
import org.springframework.stereotype.Service;

/** Permission-scoped editorial checks. No user albums, private records or popularity fields. */
@Service
public final class PublishingPreflightService {
  public static final Map<String, String> GROUPS =
      Map.of(
          "points",
          "points",
          "shooting-spots",
          "shootingSpots",
          "topics",
          "seasonTopics",
          "guides",
          "shootingGuides");
  private final RateLimiter limits;
  private final ThreadPoolExecutor probes =
      new ThreadPoolExecutor(
          4,
          4,
          30,
          TimeUnit.SECONDS,
          new ArrayBlockingQueue<>(12),
          task -> {
            var thread = new Thread(task, "publishing-link-probe");
            thread.setDaemon(true);
            return thread;
          });

  public PublishingPreflightService(RateLimiter limits) {
    this.limits = limits;
  }

  static String permission(String type) {
    return type.equals("guides") ? "content" : type;
  }

  public static String title(Map<String, Object> row) {
    return str(row.getOrDefault("name", row.get("title")));
  }

  public static String body(Map<String, Object> row) {
    for (String key :
        List.of("description", "standDescription", "summary", "introduction", "condition"))
      if (!str(row.get(key)).isBlank()) return str(row.get(key));
    return "";
  }

  static boolean published(String type, Map<String, Object> row, StoreRepository store) {
    if (yes(row.get("deleted"))) return false;
    if (type.equals("shooting-spots"))
      return cn.campus.point.ShootingSpotService.published(store, row.get("id")) != null;
    return yes(row.get("published"));
  }

  public static Map<String, Object> publicEnglish(StoreRepository store) {
    var out = obj();
    for (var group : GROUPS.entrySet())
      for (var row : store.rows(group.getValue())) {
        if (!published(group.getKey(), row, store)) continue;
        var english = map(row.get("english"));
        if (!title(row).isBlank() && !str(english.get("title")).isBlank())
          out.put(title(row), english.get("title"));
        if (!body(row).isBlank() && !str(english.get("body")).isBlank())
          out.put(body(row), english.get("body"));
        if (out.size() >= 800) return out;
      }
    return out;
  }

  public boolean handle(ApiContext c) throws Exception {
    if (c.route("/api/client-health", "POST")) {
      RequestValues.fields(c.body, "kind", "platform", "page", "resource", "status");
      limits.check("client-health:" + c.ip, 30);
      cn.campus.web.OperationsHealth.report(str(c.body.get("kind")), str(c.body.get("platform")),
          str(c.body.getOrDefault("page","unknown")),str(c.body.getOrDefault("resource","unknown")),integer(c.body.get("status")));
      c.send(obj("ok", true));
      return true;
    }
    if (c.route("/api/localization/editorial", "GET")) {
      c.send(
          obj(
              "entries",
              publicEnglish(c.store),
              "revision",
              c.store.settings().getOrDefault("editorialRevision", 0)));
      return true;
    }
    if (!c.audience.equals("admin") || !c.route("/api/admin/preflight/english", "PUT"))
      return false;
    c.need();
    RequestValues.fields(c.body, "type", "id", "revision", "title", "body");
    String type = str(c.body.get("type"));
    if (!GROUPS.containsKey(type)) throw new ApiException("内容类型无效");
    if (!AdminPermissions.has(c.account, permission(type) + ".write"))
      throw new ApiException("没有该内容的编辑权限", 403);
    var row = find(c.store.rows(GROUPS.get(type)), "id", c.body.get("id"));
    if (row == null) throw new ApiException("内容不存在", 404);
    if (!whole(c.body.get("revision"))
        || integer(c.body.get("revision")) != integer(row.get("revision")))
      throw new ApiException("内容已更新，请重新载入预检", 409);
    row.put(
        "english",
        obj(
            "title",
            RequestValues.text(c.body, "title", "", 160, true),
            "body",
            RequestValues.text(c.body, "body", "", 4000, !body(row).isBlank())));
    row.put("revision", integer(row.get("revision")) + 1);
    c.store
        .settings()
        .put("editorialRevision", integer(c.store.settings().get("editorialRevision")) + 1);
    c.audit("校订英文内容", row.get("id"), type);
    c.store.bump();
    c.store.save();
    c.send(obj("ok", true));
    return true;
  }

  private static void issue(
      List<Map<String, Object>> issues,
      Map<String, Object> resource,
      String code,
      String level,
      String message) {
    issues.add(
        obj("resource", resource.get("key"), "code", code, "level", level, "message", message));
  }

  public static Map<String, Object> snapshot(ApiContext c) {
    var resources = new ArrayList<Map<String, Object>>();
    var issues = new ArrayList<Map<String, Object>>();
    var links = new LinkedHashSet<String>();
    for (var entry : GROUPS.entrySet()) {
      String type = entry.getKey();
      if (!AdminPermissions.has(c.account, permission(type) + ".read")) continue;
      for (var row : c.store.rows(entry.getValue())) {
        if (yes(row.get("deleted"))) continue;
        String id = str(row.get("id")), name = title(row), copy = body(row);
        String image =
            type.equals("shooting-spots")
                ? (row.get("exampleMediaId") == null ? "" : "/media/" + row.get("exampleMediaId"))
                : str(row.get("cover"));
        String route =
            switch (type) {
              case "points" -> "#place/" + id;
              case "shooting-spots" -> "#spot/" + id;
              case "topics" -> "#topic/" + id;
              default -> "#guide/" + id;
            };
        var r =
            obj(
                "key",
                type + ":" + id,
                "type",
                type,
                "id",
                id,
                "title",
                name,
                "body",
                copy,
                "photo",
                image,
                "subtitle",
                str(
                    row.getOrDefault(
                        "openingHours", row.getOrDefault("bestTime", row.get("theme")))),
                "english",
                row.getOrDefault("english", obj()),
                "revision",
                row.getOrDefault("revision", 0),
                "published",
                published(type, row, c.store),
                "route",
                route,
                "editRoute",
                "#" + type,
                "editable",
                AdminPermissions.has(c.account, permission(type) + ".write")
                    && AdminPermissions.has(c.account, "preflight.write"));
        resources.add(r);
        if (name.isBlank()) issue(issues, r, "title", "error", "主标题未填写");
        if (copy.isBlank()) issue(issues, r, "body", "warning", "正文或拍摄说明待补充");
        if (Set.of("points", "shooting-spots").contains(type) && image.isBlank())
          issue(issues, r, "image", "warning", "缺少专属照片，目前只能使用参考配图");
        if (!image.isBlank() && !imageExists(c.store, image))
          issue(issues, r, "image-missing", "error", "引用图片不存在或已删除");
        if (type.equals("shooting-spots") && rows(row.get("openingWindows")).isEmpty())
          issue(issues, r, "opening", "warning", "开放时间未填写为可核对时段");
        var english = map(row.get("english"));
        if (str(english.get("title")).isBlank()
            || !copy.isBlank() && str(english.get("body")).isBlank())
          issue(issues, r, "english", "warning", "英文内容尚未完整校订，用户端目前依赖自动翻译");
        for (var link : rows(row.get("links")))
          for (String field : List.of("href", "url"))
            if (!str(link.get(field)).isBlank()) links.add(str(link.get(field)));
      }
    }
    if (AdminPermissions.has(c.account, "site-content.read")) {
      var saved = map(c.store.db.get("siteContent"));
      for (String slot : List.of("draft", "published"))
        for (var link : rows(map(saved.get(slot)).get("helpLinks")))
          links.add(str(link.get("href")));
    }
    return obj(
        "resources",
        resources,
        "issues",
        issues,
        "links",
        new ArrayList<>(links),
        "checkedAt",
        Instant.ofEpochMilli(TimeSource.now()).toString());
  }

  static boolean imageExists(StoreRepository store, String value) {
    String path = value.split("\\?")[0];
    if (path.matches("/media/[a-f0-9-]{36}")) {
      var row = find(store.rows("media"), "id", path.substring(7));
      return row != null
          && !yes(row.get("deleted"))
          && Files.isRegularFile(store.directory.resolve("media/" + path.substring(7) + ".jpg"));
    }
    Path root = store.root.resolve("dist").normalize(),
        file = root.resolve(path.replaceFirst("^/", "")).normalize();
    return path.startsWith("/shared/") && file.startsWith(root) && Files.isRegularFile(file);
  }

  public boolean handleOutside(ApiContext c) throws Exception {
    if (!c.audience.equals("admin") || !c.route("/api/admin/preflight", "GET")) return false;
    limits.check(c.account.get("id") + ":preflight", 10);
    Map<String, Object> result;
    try (var guard = c.store.readAccess()) {
      c.need();
      result = snapshot(c);
    }
    boolean probe = "1".equals(c.request.getParameter("links"));
    var checks = new ArrayList<Map<String, Object>>();
    if (probe) {
      {
        int offset = 0;
        try {
          offset = Integer.parseInt(Objects.toString(c.request.getParameter("offset"), "0"));
        } catch (Exception ignored) {
        }
        if (offset < 0 || offset > 10000) throw new ApiException("链接页码无效");
        var batch = list(result.get("links")).stream().skip(offset).limit(12).toList();
        var futures = new ArrayList<Future<Map<String, Object>>>();
        for (var url : batch)
          try {
            futures.add(probes.submit(() -> checkLink(str(url))));
          } catch (RejectedExecutionException error) {
            futures.add(
                CompletableFuture.completedFuture(
                    obj("url", url, "state", "unverified", "message", "检查队列繁忙，请稍后重试")));
          }
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(7);
        for (int i = 0; i < futures.size(); i++)
          try {
            checks.add(
                futures
                    .get(i)
                    .get(Math.max(1, deadline - System.nanoTime()), TimeUnit.NANOSECONDS));
          } catch (Exception error) {
            futures.get(i).cancel(true);
            checks.add(obj("url", batch.get(i), "state", "unverified", "message", "连接超时，需人工确认"));
          }
        result.put(
            "nextLinkOffset",
            offset + batch.size() < list(result.get("links")).size()
                ? offset + batch.size()
                : null);
      }
    }
    result.put("linkChecks", checks);
    result.put("linksChecked", probe);
    result.put("linkLimit", 12);
    result.put(
        "summary",
        obj(
            "resources",
            list(result.get("resources")).size(),
            "errors",
            rows(result.get("issues")).stream().filter(i -> eq(i.get("level"), "error")).count()
                + checks.stream().filter(i -> eq(i.get("state"), "broken")).count(),
            "warnings",
            rows(result.get("issues")).stream()
                .filter(i -> eq(i.get("level"), "warning"))
                .count()));
    c.send(result);
    return true;
  }

  public static Map<String, Object> checkLink(String value) {
    if (value.startsWith("#"))
      return obj(
          "url",
          value,
          "state",
          value.matches("#[a-z][a-z0-9-]*(/[a-zA-Z0-9-]+)?(\\?[^\\s]*)?") ? "internal" : "broken",
          "message",
          "站内入口由预览核对");
    try {
      URI uri = URI.create(value);
      String host = uri.getHost();
      if (!"https".equals(uri.getScheme())
          || uri.getUserInfo() != null
          || host == null
          || uri.getPort() != -1 && uri.getPort() != 443
          || host.endsWith(".local")
          || host.equals("localhost")) throw new IllegalArgumentException();
      InetAddress[] addresses = InetAddress.getAllByName(host);
      for (var address : addresses)
        if (!publicAddress(address)) throw new IllegalArgumentException();
      // Pin the validated address. TLS still authenticates the original hostname; no redirects.
      try (var socket = new Socket()) {
        socket.connect(new InetSocketAddress(addresses[0], 443), 1500);
        socket.setSoTimeout(2000);
        try (var tls =
            (SSLSocket)
                ((SSLSocketFactory) SSLSocketFactory.getDefault())
                    .createSocket(socket, host, 443, true)) {
          var parameters = tls.getSSLParameters();
          parameters.setEndpointIdentificationAlgorithm("HTTPS");
          if (!host.matches("[0-9.:]+")) parameters.setServerNames(List.of(new SNIHostName(host)));
          tls.setSSLParameters(parameters);
          tls.setSoTimeout(2000);
          tls.startHandshake();
          String path =
              uri.getRawPath() == null || uri.getRawPath().isBlank() ? "/" : uri.getRawPath();
          if (uri.getRawQuery() != null) path += "?" + uri.getRawQuery();
          if (path.length() > 2000 || path.contains("\r") || path.contains("\n"))
            throw new IllegalArgumentException();
          tls.getOutputStream()
              .write(
                  ("HEAD "
                          + path
                          + " HTTP/1.1\r\nHost: "
                          + host
                          + "\r\nUser-Agent: JINGYU-Preflight/8.1\r\nConnection: close\r\n\r\n")
                      .getBytes(StandardCharsets.US_ASCII));
          var status = new StringBuilder();
          for (int i = 0; i < 256; i++) {
            int b = tls.getInputStream().read();
            if (b < 0 || b == '\n') break;
            status.append((char) b);
          }
          var match = java.util.regex.Pattern.compile("HTTP/1\\.[01] ([0-9]{3})").matcher(status);
          if (!match.find()) throw new java.io.IOException();
          int code = Integer.parseInt(match.group(1));
          return obj(
              "url",
              value,
              "status",
              code,
              "state",
              code == 404 || code == 410
                  ? "broken"
                  : code >= 200 && code < 300 ? "ok" : "unverified",
              "message",
              code == 404 || code == 410
                  ? "链接已失效"
                  : code >= 200 && code < 300 ? "链接可访问" : "跳转或访问限制，需人工确认");
        }
      }
    } catch (IllegalArgumentException error) {
      return obj("url", value, "state", "blocked", "message", "仅检查公开HTTPS地址，私有网络和特殊协议已拒绝");
    } catch (Exception error) {
      return obj("url", value, "state", "unverified", "message", "暂未确认可访问性，请人工复核");
    }
  }

  public static boolean publicAddress(InetAddress address) {
    if (address.isAnyLocalAddress()
        || address.isLoopbackAddress()
        || address.isSiteLocalAddress()
        || address.isLinkLocalAddress()
        || address.isMulticastAddress()) return false;
    byte[] bytes = address.getAddress();
    if (bytes.length == 4) {
      int a = bytes[0] & 255, b = bytes[1] & 255;
      if (a == 0 || a == 100 && b >= 64 && b <= 127 || a == 198 && (b == 18 || b == 19) || a >= 224)
        return false;
    } else if ((bytes[0] & 254) == 252) return false;
    return true;
  }

  @jakarta.annotation.PreDestroy
  public void close() {
    probes.shutdownNow();
  }
}
