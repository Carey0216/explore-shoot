package cn.campus.miniprogram;

import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.common.RateLimiter;
import cn.campus.web.ApiContext;
import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Semaphore;
import org.springframework.stereotype.Service;

/** Issue WeChat-generated codes for the public home or a published point. */
@Service
public final class WechatShareCodes {
  private record Code(byte[] bytes, String type) {}
  private final String appId = System.getenv().getOrDefault("WECHAT_APP_ID", "");
  private final String secret = System.getenv().getOrDefault("WECHAT_APP_SECRET", "");
  private final boolean enabled = "1".equals(System.getenv("WECHAT_PUBLIC_SHARE_CODES"));
  private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();
  private final RateLimiter limits;
  private final Semaphore requests = new Semaphore(3);
  private final Map<String, Code> cache = new LinkedHashMap<>(32, 0.75f, true);
  private String accessToken = "";
  private long tokenUntil;

  public WechatShareCodes(RateLimiter limits) {
    this.limits = limits;
  }

  static String scene(String id) {
    if (id.matches("[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")) return id.replace("-", "");
    return id.matches("[a-z0-9-]{1,32}") && !id.matches("[a-f0-9]{32}") ? id : "";
  }

  public boolean handle(ApiContext c) throws IOException {
    if (!c.route("/api/share/mini-code", "GET")) return false;
    if (!c.audience.equals("user")) throw new ApiException("接口不存在", 404);
    String id = c.request.getParameter("point");
    boolean home = "campus".equals(c.request.getParameter("entry"));
    if (home && id != null) throw new ApiException("请选择一个分享入口");
    String page = home ? "pages/discover/index" : "pages/detail/index";
    String scene = home ? "jingyu" : scene(java.util.Objects.toString(id, ""));
    if (!home) {
      if (scene.isEmpty()) throw new ApiException("地点编号无效");
      try (var ignored = c.store.readAccess()) {
        var point = find(c.store.rows("points"), "id", id);
        if (point == null || !yes(point.get("published"))) throw new ApiException("地点已下线", 404);
      }
    }
    if (!enabled || !appId.matches("wx[a-f0-9]{16}") || secret.isBlank())
      throw new ApiException("小程序码暂未启用，可使用网页二维码", 503);
    String key = page + ":" + scene;
    Code code;
    synchronized (cache) { code = cache.get(key); }
    if (code == null) {
      limits.check(c.ip + ":mini-share-code", 10);
      if (!requests.tryAcquire()) throw new ApiException("小程序码生成繁忙，请稍后重试", 503);
      try {
        code = generate(page, scene);
        synchronized (cache) {
          cache.put(key, code);
          if (cache.size() > 128) cache.remove(cache.keySet().iterator().next());
        }
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new ApiException("小程序码生成已取消", 503);
      } catch (IOException | IllegalArgumentException | ApiException e) {
        throw new ApiException("微信小程序码暂不可用，可使用网页二维码", 502);
      } finally {
        requests.release();
      }
    }
    c.response.setContentType(code.type());
    c.response.setContentLength(code.bytes().length);
    c.response.setHeader("Cache-Control", "private, max-age=300");
    c.response.getOutputStream().write(code.bytes());
    return true;
  }

  private HttpResponse<java.io.InputStream> post(String path, Map<String, Object> body)
      throws IOException, InterruptedException {
    return http.send(HttpRequest.newBuilder(URI.create("https://api.weixin.qq.com/" + path))
        .timeout(Duration.ofSeconds(6)).header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(write(body))).build(),
        HttpResponse.BodyHandlers.ofInputStream());
  }

  private synchronized String token() throws IOException, InterruptedException {
    if (System.currentTimeMillis() < tokenUntil) return accessToken;
    var response = post("cgi-bin/stable_token", obj(
        "grant_type", "client_credential", "appid", appId, "secret", secret, "force_refresh", false));
    try (var body = response.body()) {
      if (response.statusCode() != 200) throw new IOException("WeChat token unavailable");
      var data = parse(new String(body.readNBytes(16384), StandardCharsets.UTF_8));
      String token = str(data.get("access_token"));
      long duration = integer(data.get("expires_in"));
      if (!token.matches("[A-Za-z0-9_-]{10,2048}") || duration <= 60)
        throw new IOException("WeChat token unavailable");
      accessToken = token;
      tokenUntil = System.currentTimeMillis() + (Math.min(duration, 7200) - 60) * 1000;
      return accessToken;
    }
  }

  private Code generate(String page, String scene) throws IOException, InterruptedException {
    String token = token();
    var response = post("wxa/getwxacodeunlimit?access_token=" + token,
        obj("scene", scene, "page", page, "check_path", true,
            "env_version", "release", "width", 430));
    try (var body = response.body()) {
      var bytes = body.readNBytes(262145);
      String type = response.headers().firstValue("Content-Type").orElse("").split(";")[0].trim();
      if (response.statusCode() != 200 || bytes.length < 16 || bytes.length > 262144
          || !validImage(type, bytes)) {
        if (type.equals("application/json")) {
          long error = integer(parse(new String(bytes, StandardCharsets.UTF_8)).get("errcode"));
          if (error == 40001 || error == 42001) {
            synchronized (this) { if (accessToken.equals(token)) tokenUntil = 0; }
          }
        }
        throw new IOException("WeChat code unavailable");
      }
      return new Code(bytes, type);
    }
  }

  private boolean validImage(String type, byte[] bytes) {
    return type.equals("image/jpeg") && bytes[0] == (byte) 0xff && bytes[1] == (byte) 0xd8
        || type.equals("image/png") && bytes[0] == (byte) 0x89 && bytes[1] == 'P'
            && bytes[2] == 'N' && bytes[3] == 'G';
  }
}
