package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class AccountContractTest {
  @TempDir Path temporary;

  private static Map<String, Object> registration(String name, Object invite) {
    return obj(
        "username",
        name,
        "nickname",
        "注册测试",
        "password",
        ApiFixture.PASSWORD,
        "inviteCode",
        invite);
  }

  @Test
  void registrationRolesInviteCapacityAndApprovalAreServerControlled() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var root = app.admin();
      var guest = app.user();
      var ordinary = app.user();
      var invited = app.user();
      root.login("admin");
      root.send("/api/auth/register", "POST", registration("bad_admin", ""), 404);
      root.request("/api/admin/invites", "POST", obj("maxUses", 1, "days", 1), 404);
      var body = registration("ordinary", "");
      body.put("scoutStatus", "approved");
      body.put("role", "super");
      var regular = map(ordinary.send("/api/auth/register", "POST", body, 201).get("account"));
      assertEquals("none", regular.get("scoutStatus"));
      assertNull(regular.get("inviteId"));
      assertEquals("open", regular.get("registrationMethod"));
      assertFalse(regular.containsKey("role"));
      assertFalse(regular.containsKey("passwordHash"));
      ordinary.send("/api/points", "POST", obj(), 403);
      var application =
          ordinary.send("/api/scout/apply", "POST", obj("reason", "希望贡献真实校园拍摄地点"), 201);
      assertEquals("pending", map(ordinary.get("/api/auth/me").get("account")).get("scoutStatus"));
      root.send(
          "/api/admin/applications/" + application.get("id"),
          "PATCH",
          obj("status", "approved"),
          200);
      assertEquals("approved", map(ordinary.get("/api/auth/me").get("account")).get("scoutStatus"));
      for (Object invalid : List.of("NO-SUCH-CODE", 123, "x".repeat(31)))
        guest.send("/api/auth/register", "POST", registration("invalid", invalid), 400);
      assertFalse(root.get("/api/admin/overview").containsKey("invites"));
      assertFalse(app.data().containsKey("invites"));
      app.restart();
      assertEquals("approved", map(ordinary.get("/api/auth/me").get("account")).get("scoutStatus"));
      assertFalse(write(root.get("/api/admin/overview")).contains("passwordHash"));
      System.out.println("Java registration API checks: " + app.checks);
    }
  }

  @Test
  void preferencesProfilesAndPasswordRevocationRemainPrivateAcrossDevices() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var a = app.user();
      var b = app.user();
      var device = app.user();
      var guest = app.user();
      var root = app.admin();
      root.login("admin");
      var alice = a.register("profile_alice", "");
      b.register("profile_bob", "");
      device.login("profile_alice");
      guest.send("/api/auth/preferences", "PATCH", obj("language", "en"), 401);
      for (var invalid :
          List.of(
              obj("language", "fr"),
              obj("language", "en", "role", "super"),
              obj("mapFollow", "false"),
              obj("voiceId", "unknown"),
              obj("textSize", "huge"),
              obj("motion", "full"),
              obj(),
              obj("id", alice.get("id")))) a.send("/api/auth/preferences", "PATCH", invalid, 400);
      var prefs =
          obj(
              "textSize",
              "large",
              "motion",
              "reduce",
              "mapFollow",
              false,
              "voiceId",
              "zhou",
              "assistantAvatar",
              "orbit");
      var saved = a.send("/api/auth/preferences", "PATCH", prefs, 200);
      assertEquals(prefs, saved.get("preferences"));
      assertEquals(1, integer(saved.get("revision")));
      assertEquals(prefs, device.get("/api/auth/preferences").get("preferences"));
      device.send("/api/auth/preferences", "PATCH", obj("motion", "system"), 200);
      assertEquals(
          "system",
          map(map(a.get("/api/auth/me").get("account")).get("preferences")).get("motion"));
      assertFalse(map(b.get("/api/auth/preferences").get("preferences")).containsKey("language"));
      for (var invalid :
          List.of(
              obj("nickname", ""),
              obj("nickname", 12),
              obj("nickname", "x".repeat(25)),
              obj("nickname", "bad\nname"),
              obj("role", "super"),
              obj("accountId", alice.get("id")),
              obj("avatar", "data:image/svg+xml;base64,AAAA")))
        a.send("/api/auth/profile", "PATCH", invalid, 400);
      String avatar =
          "data:image/jpeg;base64,"
              + Base64.getEncoder()
                  .encodeToString(
                      Files.readAllBytes(app.root.resolve("dist/shared/nmu-library.jpg")));
      var changed =
          map(
              a.send("/api/auth/profile", "PATCH", obj("nickname", "新的昵称", "avatar", avatar), 200)
                  .get("account"));
      assertEquals("新的昵称", changed.get("nickname"));
      assertEquals(alice.get("id"), changed.get("id"));
      assertFalse(changed.containsKey("passwordHash"));
      assertTrue(yes(changed.get("hasAvatar")));
      a.request("/api/auth/avatar", "GET", null, 200);
      assertEquals("新的昵称", map(device.get("/api/auth/me").get("account")).get("nickname"));
      assertEquals("profile_bob", map(b.get("/api/auth/me").get("account")).get("nickname"));
      a.send(
          "/api/auth/password",
          "PATCH",
          obj("currentPassword", "wrong", "newPassword", "ChangedJava2026!"),
          403);
      a.send(
          "/api/auth/password",
          "PATCH",
          obj("currentPassword", ApiFixture.PASSWORD, "newPassword", "ChangedJava2026!"),
          200);
      assertNull(device.get("/api/auth/me").get("account"));
      a.send(
          "/api/auth/login",
          "POST",
          obj("username", "profile_alice", "password", ApiFixture.PASSWORD),
          401);
      a.send(
          "/api/auth/login",
          "POST",
          obj("username", "profile_alice", "password", "ChangedJava2026!"),
          200);
      app.restart();
      assertEquals("system", map(a.get("/api/auth/preferences").get("preferences")).get("motion"));
      root.send("/api/admin/users/" + alice.get("id"), "PATCH", obj("enabled", false), 200);
      a.send("/api/auth/preferences", "PATCH", obj("language", "en"), 401);
      var audit = rows(root.get("/api/admin/overview").get("audit"));
      assertTrue(
          audit.stream()
              .anyMatch(
                  x ->
                      eq(x.get("actorId"), alice.get("id"))
                          && eq(x.get("action"), "修改自己的设置")
                          && x.get("at") != null
                          && x.get("ip") != null));
      System.out.println("Java profile/preferences API checks: " + app.checks);
    }
  }
}
