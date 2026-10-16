package cn.campus.miniprogram;

import static org.junit.jupiter.api.Assertions.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class WechatIdentityClientTest {
  @Test
  void exchangesOnlyServerSideAndHashesScopedIdentityWithoutPersistingSessionKey()
      throws Exception {
    var body =
        new AtomicReference<>("{\"openid\":\"same-user\",\"session_key\":\"never-return-this\"}");
    var query = new AtomicReference<String>();
    var server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
    server.createContext(
        "/sns/jscode2session",
        e -> {
          query.set(e.getRequestURI().getRawQuery());
          byte[] bytes = body.get().getBytes(StandardCharsets.UTF_8);
          e.sendResponseHeaders(200, bytes.length);
          e.getResponseBody().write(bytes);
          e.close();
        });
    server.start();
    try {
      var client =
          new WechatIdentityClient(
              "wx1234567890abcdef",
              "server-secret",
              URI.create(
                  "http://127.0.0.1:" + server.getAddress().getPort() + "/sns/jscode2session"));
      assertEquals(
          Security.digest("wx1234567890abcdef:same-user"), client.identity("temporary-code"));
      assertTrue(query.get().contains("js_code=temporary-code"));
      assertTrue(query.get().contains("grant_type=authorization_code"));
      body.set("{\"errcode\":40029,\"errmsg\":\"server-secret\"}");
      var error = assertThrows(ApiException.class, () -> client.identity("expired-code"));
      assertEquals(401, error.status);
      assertFalse(error.getMessage().contains("secret"));
      assertThrows(ApiException.class, () -> client.identity(""));
      assertEquals(
          503,
          assertThrows(
                  ApiException.class,
                  () ->
                      new WechatIdentityClient("", "", URI.create("https://example.invalid"))
                          .identity("code"))
              .status);
    } finally {
      server.stop(0);
    }
  }
}
