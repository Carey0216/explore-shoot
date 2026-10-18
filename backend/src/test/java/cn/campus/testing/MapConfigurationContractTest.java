package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class MapConfigurationContractTest {
  @TempDir Path temporary;
  static final String KEY = "TEST1-TEST2-TEST3-TEST4-TEST5-TEST6";

  @Test
  void sdkConfigurationRequiresSuperSessionAndSecondaryCredentialsAndNeverLeaksSecrets()
      throws Exception {
    try (var app = new ApiFixture(temporary)) {
      app.promoteFixtureOwner();
      var root = app.admin();
      var other = app.admin();
      var normal = app.admin();
      var guest = app.user();
      var anonymous = app.admin();
      root.login("admin");
      var verifier =
          root.send(
              "/api/admin/admins",
              "POST",
              obj(
                  "username",
                  "verifier",
                  "name",
                  "另一个超管",
                  "role",
                  "super",
                  "password",
                  ApiFixture.PASSWORD),
              201);
      root.send(
          "/api/admin/admins",
          "POST",
          obj(
              "username",
              "normal",
              "name",
              "普通管理员",
              "role",
              "normal",
              "password",
              ApiFixture.PASSWORD),
          201);
      normal.login("normal");
      other.login("admin");
      assertNull(root.get("/api/admin/overview").get("settings"));
      assertNull(normal.get("/api/admin/overview").get("settings"));
      var credentials = obj("username", "admin", "password", ApiFixture.PASSWORD);
      anonymous.send("/api/admin/map-config/read", "POST", obj("verification", "fake"), 401);
      root.send("/api/admin/map-config/read", "POST", obj("verification", "fake"), 403);
      normal.send("/api/admin/map-config/unlock", "POST", credentials, 403);
      guest.send("/api/admin/map-config/unlock", "POST", credentials, 404);
      root.send(
          "/api/admin/map-config/unlock",
          "POST",
          obj("username", "verifier", "password", "wrong"),
          403);
      var grant = root.send("/api/admin/map-config/unlock", "POST", credentials, 200);
      assertEquals(map(root.get("/api/auth/me").get("account")).get("id"), grant.get("verifiedBy"));
      var token = grant.get("token");
      other.send("/api/admin/map-config/read", "POST", obj("verification", token), 403);
      root.send(
          "/api/admin/settings",
          "PATCH",
          obj("verification", token, "mapProvider", "tencent", "tencentKey", KEY),
          200);
      assertEquals(KEY, map(guest.get("/api/catalog").get("map")).get("tencentKey"));
      root.send(
          "/api/admin/settings",
          "PATCH",
          obj(
              "verification",
              token,
              "mapProvider",
              "amap",
              "amapKey",
              "a".repeat(32),
              "amapSecurity",
              "b".repeat(32),
              "activate",
              false),
          200);
      assertEquals("tencent", map(guest.get("/api/catalog").get("map")).get("provider"));
      var config = root.send("/api/admin/map-config/read", "POST", obj("verification", token), 200);
      assertTrue(yes(config.get("amapSecurityConfigured")));
      assertFalse(write(config).contains("b".repeat(32)));
      for (var bad :
          List.of(
              obj("mapProvider", "evil"),
              obj("mapProvider", "amap", "amapKey", "bad"),
              obj("mapProvider", "baidu", "baiduKey", "short"),
              obj("mapProvider", "tencent", "tencentKey", KEY, "secret", "extra"),
              obj("mapProvider", "amap", "amapKey", "a".repeat(32), "clearAmapSecurity", true))) {
        String before = write(app.data());
        var input = copy(bad);
        input.put("verification", token);
        root.send("/api/admin/settings", "PATCH", input, 400);
        assertEquals(before, write(app.data()));
      }
      root.send(
          "/api/admin/settings",
          "PATCH",
          obj("verification", token, "mapProvider", "amap", "amapKey", "a".repeat(32)),
          200);
      assertEquals(
          obj("provider", "amap", "configured", true, "amapKey", "a".repeat(32), "amapProxy", true),
          guest.get("/api/catalog").get("map"));
      root.send(
          "/api/admin/settings",
          "PATCH",
          obj("verification", token, "mapProvider", "baidu", "baiduKey", "FixtureBaiduKey123456"),
          200);
      assertEquals(
          Set.of("provider", "configured", "baiduKey"),
          map(guest.get("/api/catalog").get("map")).keySet());
      assertEquals(KEY, map(app.data().get("settings")).get("tencentKey"));
      assertFalse(write(normal.get("/api/admin/overview")).contains(KEY));
      assertFalse(write(app.data().get("audit")).contains(KEY));
      assertFalse(write(app.data().get("audit")).contains("b".repeat(32)));
      app.advance(180001);
      root.send("/api/admin/map-config/read", "POST", obj("verification", token), 403);
      app.advance(61000);
      var revoked = root.send("/api/admin/map-config/unlock", "POST", credentials, 200);
      root.send("/api/auth/logout", "POST", obj(), 200);
      root.login("admin");
      root.send(
          "/api/admin/map-config/read", "POST", obj("verification", revoked.get("token")), 403);

      var locked = root.send("/api/admin/map-config/unlock", "POST", credentials, 200);
      root.send(
          "/api/admin/map-config/lock", "POST", obj("verification", locked.get("token")), 200);
      root.send(
          "/api/admin/map-config/read", "POST", obj("verification", locked.get("token")), 403);
      System.out.println("Java SDK configuration API checks: " + app.checks);
    }
  }
}
