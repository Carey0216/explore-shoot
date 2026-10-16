package cn.campus.miniprogram;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.stereotype.Component;

/** AppSecret and session_key never reach the client, persisted store, or diagnostic output. */
@Component
public class WechatIdentityClient {
  private final String appId, secret;
  private final URI endpoint;
  private final HttpClient http =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

  @org.springframework.beans.factory.annotation.Autowired
  public WechatIdentityClient() {
    this(
        System.getenv().getOrDefault("WECHAT_APP_ID", ""),
        System.getenv().getOrDefault("WECHAT_APP_SECRET", ""),
        URI.create("https://api.weixin.qq.com/sns/jscode2session"));
  }

  WechatIdentityClient(String appId, String secret, URI endpoint) {
    this.appId = appId;
    this.secret = secret;
    this.endpoint = endpoint;
  }

  public boolean configured() {
    return appId.matches("wx[a-f0-9]{16}") && !secret.isBlank();
  }

  public String identity(Object code) {
    if (!configured()) throw new ApiException("微信登录尚未配置，请使用现有账号登录", 503);
    if (!(code instanceof String value) || value.isBlank() || value.length() > 512)
      throw new ApiException("微信登录凭证无效，请重新登录");
    try {
      String query =
          "appid="
              + encode(appId)
              + "&secret="
              + encode(secret)
              + "&js_code="
              + encode(value)
              + "&grant_type=authorization_code";
      var response =
          http.send(
              HttpRequest.newBuilder(URI.create(endpoint + "?" + query))
                  .timeout(Duration.ofSeconds(8))
                  .GET()
                  .build(),
              HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() != 200 || response.body().length() > 16384)
        throw new ApiException("微信登录服务暂不可用，请稍后重试", 502);
      var result = parse(response.body());
      String openId = str(result.get("openid"));
      if (integer(result.get("errcode")) != 0 || openId.isBlank() || openId.length() > 128)
        throw new ApiException("微信登录凭证已失效，请重新登录", 401);
      return Security.digest(appId + ":" + openId);
    } catch (ApiException e) {
      throw e;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new ApiException("微信登录已取消", 503);
    } catch (Exception e) {
      throw new ApiException("微信登录服务暂不可用，请稍后重试", 502);
    }
  }

  private static String encode(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }
}
