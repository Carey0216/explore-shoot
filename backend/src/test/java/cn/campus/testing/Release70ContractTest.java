package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.auth.Security;
import cn.campus.storage.StoreRepository;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Release70ContractTest {
  @TempDir Path temporary;

  private void owner(ApiFixture app) throws Exception {
    app.close();
    try (var store = new StoreRepository(app.root, app.directory.resolve("data"), "test")) {
      store
          .rows("admins")
          .add(
              obj(
                  "id",
                  Security.id(),
                  "username",
                  "fixture_owner",
                  "name",
                  "测试顶级管理员",
                  "role",
                  "owner",
                  "enabled",
                  true,
                  "passwordHash",
                  Security.hashPassword(ApiFixture.PASSWORD)));
      store.save();
    }
    app.start();
  }

  private Map<String, Object> spot(ApiFixture.Client admin, Map<String, Object> p)
      throws Exception {
    return admin.send(
        "/api/admin/shooting-spots",
        "POST",
        obj(
            "pointId",
            p.get("id"),
            "title",
            "公共步道站位",
            "standDescription",
            "站在步道内侧，不进入草坪",
            "lng",
            p.get("lng"),
            "lat",
            p.get("lat"),
            "bearing",
            90,
            "heightMeters",
            1.5,
            "heightAdvice",
            "镜头平视",
            "bestTime",
            "傍晚",
            "status",
            "published"),
        201);
  }

  @Test
  void ownerPermissionsAreServerEnforcedAndSecretIsWriteOnly() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      owner(app);
      var top = app.admin();
      var superAdmin = app.admin();
      top.login("fixture_owner");
      var account = superAdmin.login("admin");
      superAdmin.request("/api/admin/admins", "POST", obj(), 403);
      superAdmin.request("/api/admin/features", "GET", null, 403);
      top.send(
          "/api/admin/admins/" + account.get("id"),
          "PATCH",
          obj(
              "permissionRevision",
              0,
              "permissionOverrides",
              obj(
                  "points.read",
                  false,
                  "points.write",
                  false,
                  "statistics.read",
                  false,
                  "statistics.write",
                  false)),
          200);
      superAdmin.request("/api/admin/overview", "GET", null, 401);
      superAdmin.login("admin");
      assertTrue(rows(superAdmin.get("/api/admin/overview").get("points")).isEmpty());
      superAdmin.request("/api/admin/points/not-a-point", "PATCH", obj("published", true), 403);
      superAdmin.request(
          "/api/admin/points/not-a-point/popularity", "PUT", obj("popularity", 3), 403);
      var topAccount = map(top.get("/api/auth/me").get("account"));
      top.request("/api/admin/admins/" + topAccount.get("id"), "DELETE", null, 403);
      var flags = top.get("/api/admin/features");
      var config = map(flags.get("features"));
      map(config.get("plans")).put("enabled", false);
      top.send(
          "/api/admin/features",
          "PUT",
          obj("revision", flags.get("revision"), "features", config),
          200);
      var user = app.user();
      user.register("plans_disabled", "");
      user.request("/api/my/plans", "GET", null, 403);
      String key = "fixture-secret-only-in-encrypted-file";
      top.send(
          "/api/admin/ai-settings",
          "PUT",
          obj(
              "base",
              "https://example.invalid/v1",
              "model",
              "fixture-model",
              "key",
              key,
              "currentPassword",
              ApiFixture.PASSWORD,
              "revision",
              0),
          200);
      var status = top.get("/api/admin/ai-settings");
      assertEquals(true, status.get("keyConfigured"));
      assertFalse(write(status).contains(key));
      assertFalse(
          Files.readString(app.directory.resolve("data/test-store-snapshot.json")).contains(key));
      byte[] ciphertext =
          Files.readAllBytes(app.directory.resolve("data/secrets/assistant/provider.enc"));
      assertFalse(
          new String(ciphertext, java.nio.charset.StandardCharsets.ISO_8859_1).contains(key));
      app.restart();
      top.login("fixture_owner");
      assertEquals(true, top.get("/api/admin/ai-settings").get("keyConfigured"));
      top.send(
          "/api/admin/owner-account",
          "PUT",
          obj(
              "username",
              "fixture_owner_new",
              "currentPassword",
              ApiFixture.PASSWORD,
              "password",
              ""),
          200);
      top.request("/api/admin/overview", "GET", null, 401);
      top.login("fixture_owner_new");
      assertEquals(
          1,
          rows(app.data().get("admins")).stream().filter(a -> eq(a.get("role"), "owner")).count());
    }
  }

  @Test
  void plansTopicsExperienceAndPublishedAnnouncementLifecycle() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin();
      admin.login("admin");
      var alice = app.user();
      var bob = app.user();
      var guest = app.user();
      alice.register("photo_alice", "");
      bob.register("photo_bob", "");
      var p = rows(guest.get("/api/catalog").get("points")).getFirst();
      var s = spot(admin, p);
      var s2 = spot(admin, p);
      var one =
          obj("id", Security.id(), "spotId", s.get("id"), "composition", "树叶作为前景", "done", false);
      var two =
          obj("id", Security.id(), "spotId", s2.get("id"), "composition", "逆光剪影", "done", true);
      var plan =
          alice.send(
              "/api/my/plans", "POST", obj("title", "周末拍摄", "items", List.of(one, two)), 201);
      String path = "/api/my/plans/" + plan.get("id");
      bob.request(path, "PUT", obj("title", "越权", "items", List.of(), "revision", 1), 404);
      alice.send(path, "PUT", obj("title", "周末拍摄", "items", List.of(two, one), "revision", 1), 200);
      alice.send(path, "PUT", obj("title", "旧稿", "items", List.of(), "revision", 1), 409);
      assertEquals(
          two.get("id"),
          rows(rows(alice.get("/api/my/plans").get("items")).getFirst().get("items"))
              .getFirst()
              .get("id"));
      var rule =
          admin.send(
              "/api/admin/passport/themes",
              "POST",
              obj(
                  "title",
                  "专题建筑",
                  "description",
                  "专题期间打卡",
                  "symbol",
                  "building",
                  "kind",
                  "visits",
                  "target",
                  1,
                  "pointIds",
                  List.of(p.get("id")),
                  "published",
                  true),
              201);
      var topic =
          admin.send(
              "/api/admin/topics",
              "POST",
              obj(
                  "title",
                  "校园秋色",
                  "description",
                  "公共步道拍摄",
                  "theme",
                  "autumn",
                  "startsAt",
                  Instant.now().minusSeconds(60).toString(),
                  "endsAt",
                  Instant.now().plusSeconds(3600).toString(),
                  "pointIds",
                  List.of(p.get("id")),
                  "ruleIds",
                  List.of(rule.get("id")),
                  "published",
                  true),
              201);
      var media =
          alice.send(
              "/api/media",
              "POST",
              obj(
                  "photo",
                  "data:image/jpeg;base64,"
                      + Base64.getEncoder()
                          .encodeToString(
                              Files.readAllBytes(app.root.resolve("dist/shared/nmu-library.jpg")))),
              201);
      var record =
          alice.send(
              "/api/checkins",
              "POST",
              obj(
                  "pointId",
                  p.get("id"),
                  "spotId",
                  s.get("id"),
                  "submissionId",
                  Security.id(),
                  "note",
                  "PRIVATE-NOTE",
                  "mediaId",
                  media.get("id")),
              201);
      var experience =
          obj(
              "takenAt",
              Instant.now().toString(),
              "device",
              "测试相机",
              "focalLength",
              "35mm",
              "tips",
              "站在步道边等柔和光线");
      var work =
          alice.send(
              "/api/checkins/" + record.get("id") + "/sharing",
              "PUT",
              obj(
                  "public",
                  true,
                  "spotId",
                  s.get("id"),
                  "caption",
                  "公开配文",
                  "experience",
                  experience),
              200);
      admin.send(
          "/api/admin/works/" + work.get("id"),
          "PATCH",
          obj("revision", 1, "status", "approved"),
          200);
      var publicWorks = guest.get("/api/works?spotId=" + s.get("id"));
      assertTrue(write(publicWorks).contains("35mm"));
      assertFalse(write(publicWorks).contains("PRIVATE-NOTE"));
      assertFalse(write(publicWorks).contains("ownerId"));
      experience.put("tips", "更新经验需要重新审核");
      alice.send(
          "/api/checkins/" + record.get("id") + "/sharing",
          "PUT",
          obj("public", true, "spotId", s.get("id"), "caption", "公开配文", "experience", experience),
          200);
      assertTrue(rows(guest.get("/api/works?spotId=" + s.get("id")).get("items")).isEmpty());
      assertEquals(
          1, integer(rows(alice.get("/api/topics").get("items")).getFirst().get("visited")));
      assertEquals(0, integer(rows(bob.get("/api/topics").get("items")).getFirst().get("visited")));
      assertEquals(
          true,
          rows(rows(alice.get("/api/topics").get("items")).getFirst().get("stamps"))
              .getFirst()
              .get("earned"));
      app.advance(3600001);
      assertEquals("ended", rows(alice.get("/api/topics").get("items")).getFirst().get("phase"));
      admin.send("/api/admin/topics/" + topic.get("id"), "DELETE", obj("revision", 1), 200);
      assertTrue(rows(guest.get("/api/topics").get("items")).isEmpty());
      var content = SiteContentContractTest.announcement("all", List.of());
      var a =
          admin.send(
              "/api/admin/announcements",
              "POST",
              obj("revision", 0, "action", "publish", "content", content),
              200);
      String ap = "/api/admin/announcements/" + a.get("id");
      content.put("audience", "selected");
      content.put(
          "userIds",
          List.of(
              alice.get("/api/auth/me").get("account") instanceof Map<?, ?>
                  ? map(alice.get("/api/auth/me").get("account")).get("id")
                  : ""));
      admin.send(ap, "PUT", obj("revision", 1, "action", "publish", "content", content), 200);
      admin.send(ap, "PUT", obj("revision", 1, "action", "unpublish", "content", content), 409);
      admin.send(ap, "DELETE", obj("revision", 2), 200);
      assertTrue(rows(admin.get("/api/admin/announcements").get("items")).isEmpty());
      app.restart();
      alice.login("photo_alice");
      assertEquals(
          2, integer(rows(alice.get("/api/my/plans").get("items")).getFirst().get("revision")));
    }
  }
}
