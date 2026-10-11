package cn.campus;

import static cn.campus.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ContentContractTest {
  @TempDir Path temporary;

  @Test
  void privateCheckinsPhotosSnapshotsAndIdempotentRetriesSurviveMigration() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var root = app.admin();
      var alice = app.user();
      var bob = app.user();
      var guest = app.user();
      root.login("admin");
      var a = alice.register("checkin_alice", "");
      bob.register("checkin_bob", "");
      var catalog = guest.get("/api/catalog");
      var point = rows(catalog.get("points")).getFirst();
      String id = str(point.get("id"));
      var template =
          rows(catalog.get("templates")).stream()
              .filter(t -> eq(t.get("pointId"), id))
              .findFirst()
              .orElseThrow();
      var body =
          obj(
              "submissionId",
              UUID.randomUUID().toString(),
              "pointId",
              id,
              "note",
              "今天图书馆前的光线很好",
              "templateId",
              template.get("id"));
      guest.request("/api/checkins", "GET", null, 401);
      guest.send("/api/checkins", "POST", body, 401);
      root.request("/api/checkins", "GET", null, 404);
      for (var override :
          List.of(
              obj("accountId", "other"),
              obj("note", obj()),
              obj("submissionId", "invalid"),
              obj("note", ""),
              obj("pointId", "missing"),
              obj("templateId", "missing"))) {
        var input = copy(body);
        input.putAll(override);
        int status =
            override.containsKey("accountId")
                ? 403
                : override.containsKey("pointId") || override.containsKey("templateId") ? 409 : 400;
        alice.send("/api/checkins", "POST", input, status);
      }
      var stale = copy(body);
      stale.put(
          "location",
          obj(
              "lng",
              point.get("lng"),
              "lat",
              point.get("lat"),
              "at",
              System.currentTimeMillis() - 61000,
              "accuracy",
              5));
      alice.send("/api/checkins", "POST", stale, 400);
      stale.put(
          "location",
          obj(
              "lng",
              point.get("lng"),
              "lat",
              point.get("lat"),
              "at",
              System.currentTimeMillis(),
              "accuracy",
              100));
      alice.send("/api/checkins", "POST", stale, 400);
      String photo =
          "data:image/jpeg;base64,"
              + Base64.getEncoder()
                  .encodeToString(
                      Files.readAllBytes(app.root.resolve("dist/shared/nmu-library.jpg")));
      var bmedia = bob.send("/api/media", "POST", obj("photo", photo), 201);
      var wrong = copy(body);
      wrong.put("mediaId", bmedia.get("id"));
      alice.send("/api/checkins", "POST", wrong, 403);
      var media = alice.send("/api/media", "POST", obj("photo", photo), 201);
      var posted = copy(body);
      posted.put("mediaId", media.get("id"));
      posted.put(
          "location",
          obj(
              "lng",
              point.get("lng"),
              "lat",
              point.get("lat"),
              "at",
              System.currentTimeMillis(),
              "accuracy",
              7));
      var record = alice.send("/api/checkins", "POST", posted, 201);
      assertEquals(a.get("id"), record.get("ownerId"));
      assertTrue(yes(map(record.get("location")).get("nearby")));
      assertFalse(map(record.get("location")).containsKey("lng"));
      var replay = copy(body);
      replay.put("note", "重试改写文字");
      assertEquals(record.get("id"), alice.send("/api/checkins", "POST", replay, 200).get("id"));
      assertEquals(1, alice.list("/api/checkins").size());
      assertTrue(bob.list("/api/checkins").isEmpty());
      String url = "/media/" + media.get("id");
      guest.request(url, "GET", null, 404);
      bob.request(url, "GET", null, 404);
      root.request(url, "GET", null, 404);
      alice.request(url, "GET", null, 200);
      bob.request("/api/checkins/" + record.get("id"), "DELETE", null, 404);
      var session =
          alice.send(
              "/api/sessions",
              "POST",
              obj(
                  "routeId",
                  "nroute1",
                  "preferences",
                  obj(
                      "budget",
                      30,
                      "people",
                      1,
                      "intensity",
                      "轻松",
                      "theme",
                      "全部",
                      "mode",
                      "fixed")),
              201);
      alice.send(
          "/api/sessions/" + session.get("id"),
          "PATCH",
          obj(
              "action",
              "photo",
              "taskId",
              rows(session.get("tasks")).getFirst().get("id"),
              "mediaId",
              media.get("id")),
          200);
      alice.request("/api/sessions/" + session.get("id"), "DELETE", null, 200);
      alice.request(url, "GET", null, 200);
      root.send("/api/admin/points/" + id, "PATCH", obj("name", "改名后的地点", "open", false), 200);
      var fresh = copy(body);
      fresh.put("submissionId", UUID.randomUUID().toString());
      alice.send("/api/checkins", "POST", fresh, 409);
      assertEquals(record.get("id"), alice.send("/api/checkins", "POST", body, 200).get("id"));
      assertEquals(point.get("name"), alice.list("/api/checkins").getFirst().get("pointName"));
      assertFalse(root.get("/api/admin/overview").containsKey("checkins"));
      app.restart();
      assertEquals(record.get("id"), alice.list("/api/checkins").getFirst().get("id"));
      alice.request("/api/checkins/" + record.get("id"), "DELETE", null, 200);
      alice.request(url, "GET", null, 404);
      assertFalse(Files.exists(app.directory.resolve("data/media/" + media.get("id") + ".jpg")));
      System.out.println("Java checkin/media API checks: " + app.checks);
    }
  }

  @Test
  void popularityIsPrivateDeduplicatedAuditedAndPersistent() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var root = app.admin();
      var normal = app.admin();
      var guest = app.user();
      root.login("admin");
      root.send(
          "/api/admin/admins",
          "POST",
          obj(
              "username",
              "moderator",
              "name",
              "普通管理员",
              "role",
              "normal",
              "password",
              ApiFixture.PASSWORD),
          201);
      normal.login("moderator");
      var points = rows(guest.get("/api/catalog").get("points"));
      String id = str(points.getFirst().get("id")),
          url = "/api/points/" + id + "/view",
          adjust = "/api/admin/points/" + id + "/popularity",
          visitor = UUID.randomUUID().toString();
      assertFalse(write(points).contains("viewCount"));
      assertFalse(write(points).contains("popularity"));
      normal.send(adjust, "PATCH", obj("popularity", 20), 403);
      guest.send(adjust, "PATCH", obj("popularity", 20), 404);
      guest.send(url, "POST", obj("clientId", "invalid"), 400);
      guest.send(url, "POST", obj("clientId", visitor, "viewCount", 100), 400);
      guest.send(url, "POST", obj("clientId", visitor), 200);
      guest.send(url, "POST", obj("clientId", visitor), 200);
      assertEquals(
          1,
          integer(
              find(rows(root.get("/api/admin/overview").get("points")), "id", id)
                  .get("viewCount")));
      app.advance(30 * 60000L);
      guest.send(url, "POST", obj("clientId", visitor), 200);
      assertEquals(
          2,
          integer(
              find(rows(root.get("/api/admin/overview").get("points")), "id", id)
                  .get("viewCount")));
      for (Object invalid : List.of(-1, 1.2, 1000000001, "2"))
        root.send(adjust, "PATCH", obj("popularity", invalid), 400);
      root.send(adjust, "PATCH", obj("popularity", 22, "useActual", true), 400);
      var changed = root.send(adjust, "PATCH", obj("popularity", 22), 200);
      assertEquals(22, integer(changed.get("popularity")));
      assertTrue(yes(changed.get("popularityAdjusted")));
      guest.send(url, "POST", obj("clientId", UUID.randomUUID().toString()), 200);
      assertEquals(
          23,
          integer(
              find(rows(root.get("/api/admin/overview").get("points")), "id", id)
                  .get("popularity")));
      var edited =
          normal.send(
              "/api/admin/points/" + id,
              "PATCH",
              obj("viewCount", 999, "popularityOffset", 999),
              200);
      assertFalse(write(edited).contains("viewCount"));
      assertFalse(write(edited).contains("popularity"));
      var overview = normal.get("/api/admin/overview");
      assertFalse(write(overview.get("points")).contains("viewCount"));
      assertEquals(
          "热度详情仅超级管理员可见",
          rows(overview.get("audit")).stream()
              .filter(e -> eq(e.get("action"), "调整机位热度"))
              .findFirst()
              .orElseThrow()
              .get("detail"));
      assertEquals(id, list(guest.get("/api/catalog").get("popularPointIds")).getFirst());
      assertEquals(
          id,
          rows(guest
                  .send("/api/points/search", "POST", obj("filter", "popular"), 200)
                  .get("points"))
              .getFirst()
              .get("id"));
      root.send("/api/admin/points/" + id, "PATCH", obj("published", false), 200);
      guest.send(url, "POST", obj("clientId", UUID.randomUUID().toString()), 404);
      app.restart();
      assertEquals(
          23,
          integer(
              find(rows(root.get("/api/admin/overview").get("points")), "id", id)
                  .get("popularity")));
      assertEquals(
          3, integer(root.send(adjust, "PATCH", obj("useActual", true), 200).get("popularity")));
      System.out.println("Java popularity API checks: " + app.checks);
    }
  }
}
