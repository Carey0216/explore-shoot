package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.auth.Security;
import cn.campus.storage.StoreRepository;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DeletionContractTest {
  @TempDir Path temporary;

  static Map<String, Object> prepare(
      ApiFixture.Client client, String type, Object id, Map<String, Object> extra, int status)
      throws Exception {
    var body = obj("type", type, "id", id);
    body.putAll(extra);
    return client.send("/api/admin/content-deletion/prepare", "POST", body, status);
  }

  static Map<String, Object> commit(
      ApiFixture.Client client, Map<String, Object> prepared, boolean confirmed, int status)
      throws Exception {
    return client.send(
        "/api/admin/content-deletion/commit",
        "POST",
        obj("confirmationToken", prepared.get("confirmationToken"), "confirmed", confirmed),
        status);
  }

  @Test
  void twoConfirmationsPhotoReferencesExpiryAuditAndSessionRevocationRemainEnforced()
      throws Exception {
    try (var app = new ApiFixture(temporary)) {
      app.close();
      String unique = UUID.randomUUID().toString(),
          shared = UUID.randomUUID().toString(),
          personal = UUID.randomUUID().toString();
      String userId = UUID.randomUUID().toString(), normalId = UUID.randomUUID().toString();
      List<String> pointIds = new ArrayList<>();
      try (var store = new StoreRepository(app.root, app.directory.resolve("data"))) {
        store
            .rows("admins")
            .add(
                obj(
                    "id",
                    normalId,
                    "username",
                    "moderator",
                    "name",
                    "普通管理员",
                    "role",
                    "normal",
                    "enabled",
                    true,
                    "passwordHash",
                    Security.hashPassword(ApiFixture.PASSWORD)));
        store
            .rows("users")
            .add(
                obj(
                    "id",
                    userId,
                    "username",
                    "scout",
                    "nickname",
                    "测试探索官",
                    "enabled",
                    true,
                    "passwordHash",
                    Security.hashPassword(ApiFixture.PASSWORD),
                    "scoutStatus",
                    "approved",
                    "bookmarks",
                    new ArrayList<>()));
        for (String photo : List.of(unique, shared, personal)) {
          store.rows("media").add(obj("id", photo, "ownerId", userId, "public", true));
          Files.copy(
              app.root.resolve("dist/shared/nmu-library.jpg"),
              store.directory.resolve("media/" + photo + ".jpg"));
        }
        for (int i = 0; i < 6; i++) {
          var p = copy(store.rows("points").getFirst());
          String id = UUID.randomUUID().toString();
          pointIds.add(id);
          p.putAll(
              obj(
                  "id",
                  id,
                  "name",
                  "删除测试" + i,
                  "published",
                  i == 2,
                  "mediaId",
                  i == 0 ? unique : i == 1 || i == 2 ? shared : i == 3 ? personal : null,
                  "cover",
                  i == 0
                      ? "/media/" + unique
                      : i == 1 || i == 2
                          ? "/media/" + shared
                          : i == 3 ? "/media/" + personal : null));
          store.rows("points").add(p);
        }
        store
            .rows("sessions")
            .add(
                obj(
                    "id",
                    UUID.randomUUID().toString(),
                    "ownerId",
                    userId,
                    "tasks",
                    List.of(
                        obj(
                            "id",
                            "snapshot",
                            "pointId",
                            pointIds.get(3),
                            "pointName",
                            "旧地点",
                            "mediaId",
                            personal,
                            "status",
                            "done"))));
        store
            .rows("routes")
            .add(
                obj(
                    "id",
                    "deletion-route",
                    "name",
                    "关联路线",
                    "points",
                    new ArrayList<>(List.of(pointIds.getFirst(), "nmu1")),
                    "active",
                    true,
                    "version",
                    1));
        store
            .rows("templates")
            .add(
                obj(
                    "id",
                    "deletion-template",
                    "pointId",
                    pointIds.getFirst(),
                    "title",
                    "旧机位",
                    "approved",
                    true));
        store.rows("reports").add(obj("id", "deletion-report", "pointId", pointIds.getFirst()));
        list(store.rows("users").getFirst().get("bookmarks")).add(pointIds.getFirst());
        store.save();
      }
      app.start();
      var root = app.admin();
      var second = app.admin();
      var mod = app.admin();
      var anonymous = app.admin();
      var user = app.user();
      root.login("admin");
      second.login("admin");
      mod.login("moderator");
      user.login("scout");
      var password = obj("password", ApiFixture.PASSWORD, "remember", true);
      prepare(anonymous, "points", pointIds.getFirst(), obj(), 401);
      prepare(user, "points", pointIds.getFirst(), obj(), 404);
      prepare(root, "points", "nmu1", password, 409);
      prepare(root, "admins", normalId, password, 400);
      prepare(root, "points", pointIds.getFirst(), obj("password", "wrong"), 403);
      var first = prepare(root, "points", pointIds.getFirst(), password, 200);
      assertEquals(1, integer(map(first.get("preview")).get("deletedPhotos")));
      assertEquals(1, integer(map(first.get("preview")).get("affectedRoutes")));
      assertEquals(1, integer(map(first.get("preview")).get("relatedTemplates")));
      commit(root, first, false, 400);
      commit(mod, first, true, 403);
      commit(second, first, true, 403);
      root.request("/api/admin/points/" + pointIds.getFirst(), "DELETE", null, 404);
      var deleted = commit(root, first, true, 200);
      assertEquals(0, integer(deleted.get("cleanupPending")));
      assertFalse(Files.exists(app.directory.resolve("data/media/" + unique + ".jpg")));
      assertNull(find(rows(app.data().get("points")), "id", pointIds.getFirst()));
      assertNull(find(rows(app.data().get("templates")), "id", "deletion-template"));
      assertFalse(yes(find(rows(app.data().get("routes")), "id", "deletion-route").get("active")));
      commit(root, first, true, 403);
      var log =
          rows(app.data().get("audit")).stream()
              .filter(e -> eq(e.get("action"), "永久删除内容"))
              .findFirst()
              .orElseThrow();
      assertEquals("admin", log.get("actor"));
      assertEquals("super", log.get("actorRole"));
      assertEquals("127.0.0.1", log.get("ip"));
      assertNotNull(log.get("at"));
      var keepShared = prepare(mod, "points", pointIds.get(1), password, 200);
      assertEquals(1, integer(map(keepShared.get("preview")).get("preservedPhotos")));
      commit(mod, keepShared, true, 200);
      assertTrue(Files.exists(app.directory.resolve("data/media/" + shared + ".jpg")));
      assertTrue(yes(find(rows(app.data().get("media")), "id", shared).get("public")));
      var keepPersonal = prepare(mod, "points", pointIds.get(3), obj("remember", true), 200);
      assertEquals(1, integer(map(keepPersonal.get("preview")).get("preservedPhotos")));
      commit(mod, keepPersonal, true, 200);
      assertTrue(Files.exists(app.directory.resolve("data/media/" + personal + ".jpg")));
      assertFalse(yes(find(rows(app.data().get("media")), "id", personal).get("public")));
      app.user().request("/media/" + personal, "GET", null, 404);
      user.request("/media/" + personal, "GET", null, 200);
      var cancel = prepare(mod, "points", pointIds.get(5), obj("remember", true), 200);
      assertNotNull(find(rows(app.data().get("points")), "id", pointIds.get(5)));
      mod.send("/api/admin/content-deletion/commit", "POST", obj("confirmed", true), 403);
      prepare(mod, "points", pointIds.get(4), obj("remember", false), 403);
      app.advance(61000);
      var changed = prepare(root, "points", pointIds.get(4), obj("remember", true), 200);
      root.send("/api/admin/points/" + pointIds.get(4), "PATCH", obj("name", "名称已变更"), 200);
      commit(root, changed, true, 409);
      var expired = prepare(root, "points", pointIds.get(5), obj("remember", true), 200);
      app.advance(6 * 60000L);
      commit(root, expired, true, 403);
      app.advance(10 * 60000L);
      assertNull(root.get("/api/admin/content-deletion/verification").get("verifiedUntil"));
      prepare(root, "points", pointIds.get(5), obj("remember", true), 403);
      var verified = prepare(root, "points", pointIds.get(5), password, 200);
      root.send(
          "/api/auth/password",
          "PATCH",
          obj("currentPassword", ApiFixture.PASSWORD, "newPassword", "ChangedDelete2026!"),
          200);
      commit(root, verified, true, 403);
      assertNull(root.get("/api/admin/content-deletion/verification").get("verifiedUntil"));
      var modIntent = prepare(mod, "points", pointIds.get(5), password, 200);
      root.send("/api/admin/admins/" + normalId, "PATCH", obj("enabled", false), 200);
      commit(mod, modIntent, true, 401);
      var page = root.get("/api/admin/audit?limit=2&deletions=true");
      assertEquals(2, rows(page.get("events")).size());
      assertNotNull(page.get("nextBefore"));
      root.request("/api/admin/audit?before=invalid", "GET", null, 400);
      user.request("/api/admin/audit", "GET", null, 404);
      app.restart();
      assertNull(root.get("/api/admin/content-deletion/verification").get("verifiedUntil"));
      assertNull(find(rows(app.data().get("points")), "id", pointIds.getFirst()));
      assertFalse(rows(app.data().get("sessions")).isEmpty());
      System.out.println("Java deletion API checks: " + app.checks);
    }
  }
}
