package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class MiniProgramContractTest {
  @TempDir Path temporary;

  @Test
  void nativeSessionsReuseJavaRulesWithoutAcceptingWebCookiesOrAdminCredentials() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var mini = app.user();
      var web = app.user();
      var other = app.user();
      var admin = app.admin();
      var registration =
          mini.send(
              "/api/mini/auth/register",
              "POST",
              obj(
                  "username",
                  "mini_alice",
                  "nickname",
                  "小程序测试",
                  "password",
                  ApiFixture.PASSWORD,
                  "inviteCode",
                  ""),
              201);
      String token = str(registration.get("token"));
      assertTrue(token.matches("[a-f0-9]{64}"));
      assertEquals("", mini.cookie, "Native sessions must not issue a browser Cookie");
      var headers = Map.of("Authorization", "Bearer " + token);
      var me = map(mini.request("/api/mini/auth/me", "GET", null, 200, headers));
      String id = str(map(me.get("account")).get("id"));
      assertEquals("none", map(me.get("account")).get("scoutStatus"));
      assertFalse(
          write(app.data()).contains(token), "Only a digest of the bearer token is persisted");
      web.login("mini_alice");
      web.request("/api/mini/checkins", "GET", null, 401);
      assertNull(mini.get("/api/auth/me").get("account"));
      assertNull(map(mini.request("/api/auth/me", "GET", null, 200, headers)).get("account"));
      mini.request(
          "/api/mini/auth/me",
          "GET",
          null,
          403,
          Map.of("Origin", "http://127.0.0.1:" + app.userPort));
      for (String denied :
          List.of(
              "/api/mini/admin/overview",
              "/api/mini/health",
              "/api/mini/api/admin/overview",
              "/api/mini/../admin/overview")) mini.request(denied, "GET", null, 404, headers);
      admin.request(
          "/api/mini/auth/login",
          "POST",
          obj("username", "admin", "password", ApiFixture.PASSWORD),
          404);
      var catalog = map(mini.request("/api/mini/catalog", "GET", null, 200, headers));
      assertFalse(write(catalog).contains("viewCount"));
      assertFalse(write(catalog).contains("popularity"));
      String point = str(rows(catalog.get("points")).getFirst().get("id"));
      String jpeg =
          "data:image/jpeg;base64,"
              + Base64.getEncoder()
                  .encodeToString(
                      Files.readAllBytes(app.root.resolve("dist/shared/nmu-library.jpg")));
      var upload = map(mini.request("/api/mini/media", "POST", obj("photo", jpeg), 201, headers));
      String fileRoute = "/api/mini/media-file/" + upload.get("id");
      var thumbnail = (byte[]) mini.request(fileRoute + "?size=thumb", "GET", null, 200, headers);
      assertTrue(thumbnail.length > 100);
      mini.request(fileRoute, "GET", null, 404);
      web.request(fileRoute, "GET", null, 404);
      var input =
          obj(
              "pointId",
              point,
              "accountId",
              id,
              "submissionId",
              UUID.randomUUID().toString(),
              "note",
              "从小程序保存的私密打卡");
      input.put("mediaId", upload.get("id"));
      var record = map(mini.request("/api/mini/checkins", "POST", input, 201, headers));
      assertEquals(
          record.get("id"),
          map(mini.request("/api/mini/checkins", "POST", input, 200, headers)).get("id"));
      assertEquals(1, web.list("/api/checkins").size());
      assertEquals(
          1,
          integer(
              map(map(mini.request("/api/mini/my/passport", "GET", null, 200, headers))
                      .get("summary"))
                  .get("visits")));
      var reaction =
          map(
              mini.request(
                  "/api/mini/points/" + point + "/reaction",
                  "PUT",
                  obj("value", "dislike"),
                  200,
                  headers));
      assertFalse(write(reaction).contains("dislikeCount"));
      assertEquals(
          point,
          rows(map(mini.request(
                      "/api/mini/points/search", "POST", obj("filter", "popular"), 200, headers))
                  .get("points"))
              .getLast()
              .get("id"));
      other.register("mini_bob", "");
      var bobLogin =
          other.send(
              "/api/mini/auth/login",
              "POST",
              obj("username", "mini_bob", "password", ApiFixture.PASSWORD),
              200);
      other.request(
          fileRoute, "GET", null, 404, Map.of("Authorization", "Bearer " + bobLogin.get("token")));
      assertTrue(
          rows(other.request(
                  "/api/mini/checkins",
                  "GET",
                  null,
                  200,
                  Map.of("Authorization", "Bearer " + bobLogin.get("token"))))
              .isEmpty());
      mini.request("/api/mini/wechat/login", "POST", obj("code", "not-a-real-code"), 503);
      mini.request("/api/mini/wechat/bind", "POST", obj("code", "not-a-real-code"), 401);
      mini.request("/api/mini/auth/logout", "POST", obj(), 200, headers);
      mini.request("/api/mini/checkins", "GET", null, 401, headers);
      assertEquals(
          1, web.list("/api/checkins").size(), "Logging out native must not revoke web sessions");
    }
  }

  @Test
  void disabledAccountsExpiryAndPasswordRotationInvalidateNativeTokens() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var client = app.user();
      var admin = app.admin();
      client.register("mini_security", "");
      admin.login("admin");
      var login =
          client.send(
              "/api/mini/auth/login",
              "POST",
              obj("username", "mini_security", "password", ApiFixture.PASSWORD),
              200);
      var bearer = Map.of("Authorization", "Bearer " + login.get("token"));
      client.request(
          "/api/mini/auth/password",
          "PATCH",
          obj("currentPassword", ApiFixture.PASSWORD, "newPassword", "MiniNew2026!"),
          200,
          bearer);
      client.request("/api/mini/checkins", "GET", null, 401, bearer);
      login =
          client.send(
              "/api/mini/auth/login",
              "POST",
              obj("username", "mini_security", "password", "MiniNew2026!"),
              200);
      bearer = Map.of("Authorization", "Bearer " + login.get("token"));
      admin.send(
          "/api/admin/users/" + map(login.get("account")).get("id"),
          "PATCH",
          obj("enabled", false),
          200);
      client.request("/api/mini/checkins", "GET", null, 401, bearer);
      client.send(
          "/api/mini/auth/login",
          "POST",
          obj("username", "mini_security", "password", "MiniNew2026!"),
          403);
      admin.send(
          "/api/admin/users/" + map(login.get("account")).get("id"),
          "PATCH",
          obj("enabled", true),
          200);
      login =
          client.send(
              "/api/mini/auth/login",
              "POST",
              obj("username", "mini_security", "password", "MiniNew2026!"),
              200);
      bearer = Map.of("Authorization", "Bearer " + login.get("token"));
      app.advance(8 * 86400000L);
      client.request("/api/mini/checkins", "GET", null, 401, bearer);
    }
  }
}
