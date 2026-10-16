package cn.campus.tools;

import cn.campus.common.Json;
import com.sun.net.httpserver.*;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.Executors;

/** A user-only proxy; the administration listener never becomes public. */
public final class PhoneBridge implements AutoCloseable {
  private final HttpServer server;
  private final HttpClient client =
      HttpClient.newBuilder()
          .connectTimeout(Duration.ofSeconds(5))
          .followRedirects(HttpClient.Redirect.NEVER)
          .build();
  private final URI origin;
  private final int upstreamPort;
  private static final Set<String> HOP =
      Set.of(
          "connection",
          "host",
          "content-length",
          "transfer-encoding",
          "upgrade",
          "keep-alive",
          "te",
          "trailer",
          "proxy-authorization",
          "proxy-authenticate",
          "expect");

  public PhoneBridge(String origin, String bind, int port, int upstreamPort) throws IOException {
    this.origin = URI.create(origin);
    if (!Set.of("http", "https").contains(this.origin.getScheme())
        || this.origin.getHost() == null
        || this.origin.getUserInfo() != null
        || !origin.equals(this.origin.getScheme() + "://" + this.origin.getRawAuthority()))
      throw new IllegalArgumentException("Provide an exact HTTP/HTTPS origin.");
    this.upstreamPort = upstreamPort;
    server = HttpServer.create(new InetSocketAddress(bind, port), 32);
    server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
    server.createContext("/", this::proxy);
  }

  public void start() {
    server.start();
  }

  public int port() {
    return server.getAddress().getPort();
  }

  public void close() {
    server.stop(0);
  }

  private void reject(HttpExchange x, int status, String message) throws IOException {
    byte[] bytes = Json.write(Json.obj("error", message)).getBytes(StandardCharsets.UTF_8);
    x.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
    x.getResponseHeaders().set("Cache-Control", "no-store");
    x.sendResponseHeaders(status, bytes.length);
    x.getResponseBody().write(bytes);
    x.close();
  }

  private void proxy(HttpExchange x) throws IOException {
    String method = x.getRequestMethod(),
        source = x.getRequestHeaders().getFirst("Origin"),
        raw = x.getRequestURI().toString(),
        path = x.getRequestURI().getPath();
    if (!Objects.equals(x.getRequestHeaders().getFirst("Host"), origin.getRawAuthority())) {
      reject(x, 403, "手机测试入口域名不匹配");
      return;
    }
    boolean miniProgram = path.startsWith("/api/mini/") && source == null;
    if (source != null && !source.equals(origin.toString())
        || !miniProgram
            && !Set.of("GET", "HEAD").contains(method)
            && !Objects.equals(source, origin.toString())) {
      reject(x, 403, "请求来源不允许");
      return;
    }
    if (!raw.startsWith("/") || raw.startsWith("//") || path.startsWith("//")) {
      reject(x, 400, "地址无效");
      return;
    }
    if (path.matches("^/(?:api/admin|admin)(?:/.*)?$")) {
      reject(x, 404, "页面不存在");
      return;
    }
    if (path.equals("/__phone_health")) {
      byte[] body =
          Json.write(
                  Json.obj(
                      "app",
                      "explore-shoot-phone",
                      "backend",
                      "java",
                      "origin",
                      origin.toString(),
                      "secure",
                      origin.getScheme().equals("https")))
              .getBytes(StandardCharsets.UTF_8);
      x.getResponseHeaders().set("Content-Type", "application/json");
      x.getResponseHeaders().set("Cache-Control", "no-store");
      x.sendResponseHeaders(200, body.length);
      x.getResponseBody().write(body);
      x.close();
      return;
    }
    byte[] body = x.getRequestBody().readNBytes(8 * 1024 * 1024 + 1);
    if (body.length > 8 * 1024 * 1024) {
      reject(x, 413, "请求内容过大");
      return;
    }
    try {
      HttpRequest.Builder request =
          HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + upstreamPort + raw))
              .timeout(Duration.ofSeconds(30))
              .method(
                  method,
                  body.length == 0
                      ? HttpRequest.BodyPublishers.noBody()
                      : HttpRequest.BodyPublishers.ofByteArray(body));
      x.getRequestHeaders()
          .forEach(
              (name, values) -> {
                String lower = name.toLowerCase(Locale.ROOT);
                if (HOP.contains(lower)
                    || lower.equals("cookie")
                    || lower.equals("origin")
                    || lower.equals("forwarded")
                    || lower.startsWith("x-forwarded-")) return;
                values.forEach(v -> request.header(name, v));
              });
      if (source != null) request.header("Origin", "http://127.0.0.1:" + upstreamPort);
      String cookie = Objects.toString(x.getRequestHeaders().getFirst("Cookie"), "");
      String userCookie =
          String.join(
              ";",
              Arrays.stream(cookie.split(";"))
                  .map(String::trim)
                  .filter(c -> c.startsWith("nmu_user="))
                  .toList());
      if (!miniProgram && !userCookie.isEmpty()) request.header("Cookie", userCookie);
      HttpResponse<InputStream> response =
          client.send(request.build(), HttpResponse.BodyHandlers.ofInputStream());
      try (InputStream input = response.body()) {
        response
            .headers()
            .map()
            .forEach(
                (name, values) -> {
                  if (HOP.contains(name)) return;
                  for (String value : values) {
                    if (name.equals("set-cookie")
                        && origin.getScheme().equals("https")
                        && !value.toLowerCase(Locale.ROOT).matches(".*;\\s*secure(?:;.*)?$"))
                      value += "; Secure";
                    x.getResponseHeaders().add(name, value);
                  }
                });
        if (origin.getScheme().equals("https"))
          x.getResponseHeaders().set("Strict-Transport-Security", "max-age=3600");
        x.sendResponseHeaders(
            response.statusCode(),
            method.equals("HEAD") || Set.of(204, 304).contains(response.statusCode()) ? -1 : 0);
        if (!method.equals("HEAD")) input.transferTo(x.getResponseBody());
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      if (x.getResponseCode() == -1) reject(x, 502, "本地项目未启动，请先启动项目");
    } catch (Exception e) {
      if (x.getResponseCode() == -1) reject(x, 502, "本地项目未启动，请先启动项目");
    } finally {
      x.close();
    }
  }

  public static List<Map<String, Object>> addresses(boolean includeVirtual) throws SocketException {
    List<Map<String, Object>> out = new ArrayList<>();
    for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
      if (!network.isUp()) continue;
      for (InetAddress address : Collections.list(network.getInetAddresses()))
        if (address instanceof Inet4Address
            && !address.isLoopbackAddress()
            && (includeVirtual || !address.getHostAddress().startsWith("198.18.")))
          out.add(Json.obj("name", network.getDisplayName(), "address", address.getHostAddress()));
    }
    return out;
  }
}
