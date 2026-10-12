package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ExplorationContractTest {
  @TempDir Path temporary;

  @Test
  void communityReviewExplorationTracksAndExportsKeepTheirExistingContracts() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var root = app.admin();
      var normal = app.admin();
      var alice = app.user();
      var bob = app.user();
      var guest = app.user();
      assertEquals("java", guest.get("/api/health").get("backend"));
      assertEquals("6.2.0", guest.get("/api/health").get("release"));
      guest.request("/api/admin/overview", "GET", null, 404);
      root.request("/api/catalog", "GET", null, 404);
      for (String path :
          List.of(
              "/admin",
              "/admin/app.js",
              "/data/store-v2.json",
              "/backend/pom.xml",
              "/lib/security.cjs")) guest.request(path, "GET", null, 404);
      root.request("/user/app.js", "GET", null, 404);
      assertFalse(((String) guest.request("/", "GET", null, 200)).contains("admin.localhost"));
      root.request("/register.html", "GET", null, 404);
      guest.request("/shared/ui.js", "GET", null, 200);
      root.send("/api/auth/login", "POST", obj("username", "admin", "password", "wrong"), 401);
      root.login("admin");
      var moderator =
          root.send(
              "/api/admin/admins",
              "POST",
              obj(
                  "username",
                  "moderator",
                  "name",
                  "普通管理员",
                  "password",
                  ApiFixture.PASSWORD,
                  "role",
                  "normal"),
              201);
      normal.login("moderator");
      normal.send("/api/admin/admins", "POST", obj(), 403);
      var superAdmin =
          rows(root.get("/api/admin/overview").get("admins")).stream()
              .filter(x -> eq(x.get("username"), "admin"))
              .findFirst()
              .orElseThrow();
      root.send("/api/admin/admins/" + superAdmin.get("id"), "PATCH", obj("enabled", false), 400);
      var a = alice.register("explore_alice", "");
      bob.register("explore_bob", "");
      alice.send("/api/points", "POST", obj(), 403);
      alice.send("/api/reports", "POST", obj("pointId", "nmu1", "description", "测试问题描述"), 403);
      var apply = alice.send("/api/scout/apply", "POST", obj("reason", "我想拍摄和贡献真实校园地点"), 201);
      alice.send("/api/scout/apply", "POST", obj("reason", "重复申请不能通过"), 400);
      normal.send(
          "/api/admin/applications/" + apply.get("id"), "PATCH", obj("status", "approved"), 200);
      byte[] jpeg = Files.readAllBytes(app.root.resolve("dist/shared/nmu-library.jpg")),
          metadata = "GPS TEST SECRET".getBytes(StandardCharsets.US_ASCII);
      var image = new java.io.ByteArrayOutputStream();
      image.write(jpeg, 0, 2);
      image.write(new byte[] {(byte) 255, (byte) 225, 0, (byte) (metadata.length + 2)});
      image.write(metadata);
      image.write(jpeg, 2, jpeg.length - 2);
      String photo =
          "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(image.toByteArray());
      var media = alice.send("/api/media", "POST", obj("photo", photo), 201);
      String mediaUrl = str(media.get("url"));
      assertFalse(
          new String(
                  (byte[]) alice.request(mediaUrl, "GET", null, 200), StandardCharsets.ISO_8859_1)
              .contains("GPS TEST SECRET"));
      for (var client : List.of(bob, root, guest)) client.request(mediaUrl, "GET", null, 404);
      alice.send("/api/media", "POST", obj("photo", "data:image/svg+xml;base64,AA=="), 400);
      var draft =
          obj(
              "name",
              "测试共创点位",
              "description",
              "用于验证发布审核流程的测试描述",
              "condition",
              "只在公共开放区域拍摄",
              "theme",
              "建筑",
              "lng",
              106.10244,
              "lat",
              38.49462,
              "mediaId",
              media.get("id"),
              "submissionId",
              UUID.randomUUID().toString());
      var bad = copy(draft);
      bad.put("lng", 116);
      bad.put("lat", 40);
      alice.send("/api/points", "POST", bad, 400);
      bob.send("/api/points", "POST", draft, 403);
      var point = alice.send("/api/points", "POST", draft, 201);
      assertEquals("community", point.get("trust"));
      assertEquals(point.get("id"), alice.send("/api/points", "POST", draft, 200).get("id"));
      assertFalse(write(point).contains("viewCount"));
      guest.request(mediaUrl, "GET", null, 200);
      normal.send("/api/admin/points/" + point.get("id"), "PATCH", obj("certify", true), 200);
      assertEquals(
          "certified",
          find(rows(guest.get("/api/catalog").get("points")), "id", point.get("id")).get("trust"));
      normal.send(
          "/api/admin/points/" + point.get("id"),
          "PATCH",
          obj("name", "不应保存", "theme", "invalid"),
          400);
      assertEquals(
          point.get("name"),
          find(rows(guest.get("/api/catalog").get("points")), "id", point.get("id")).get("name"));
      var report =
          alice.send(
              "/api/reports",
              "POST",
              obj("pointId", point.get("id"), "category", "通行变化", "description", "测试反馈：现场通道暂时不能进入"),
              201);
      normal.send(
          "/api/admin/reports/" + report.get("id"),
          "PATCH",
          obj("action", "offline", "note", "已核对测试反馈"),
          200);
      assertNull(find(rows(guest.get("/api/catalog").get("points")), "id", point.get("id")));
      assertEquals(
          "resolved", rows(alice.get("/api/my/community").get("reports")).getFirst().get("status"));
      normal.send(
          "/api/admin/points/" + point.get("id"),
          "PATCH",
          obj("published", true, "open", true),
          200);
      var prefs =
          obj("budget", 20, "people", 2, "intensity", "轻松", "theme", "建筑", "mode", "personal");
      var plans = rows(alice.request("/api/plan", "POST", prefs, 200));
      assertTrue(yes(find(plans, "id", "nroute1").get("available")));
      for (var p : plans)
        assertEquals(
            integer(p.get("total")),
            integer(p.get("walk")) + integer(p.get("stay")) + integer(p.get("buffer")));
      var invalidPrefs = copy(prefs);
      invalidPrefs.put("budget", 999);
      alice.request("/api/plan", "POST", invalidPrefs, 400);
      alice.send("/api/sessions", "POST", obj("routeId", "nroute3", "preferences", prefs), 409);
      var session =
          alice.send("/api/sessions", "POST", obj("routeId", "nroute1", "preferences", prefs), 201);
      Object sid = session.get("id");
      String sessionUrl = "/api/sessions/" + sid;
      var tasks = rows(session.get("tasks"));
      assertEquals(3, tasks.size());
      assertTrue(str(session.get("generation")).contains("未接入 AI"));
      assertEquals(
          sid,
          alice
              .send("/api/sessions", "POST", obj("routeId", "nroute1", "preferences", prefs), 200)
              .get("id"));
      assertTrue(bob.list("/api/sessions").isEmpty());
      bob.send(sessionUrl, "PATCH", obj("action", "pause"), 404);
      bob.request(sessionUrl + "/export", "GET", null, 404);
      alice.send(sessionUrl, "PATCH", obj("action", "finish"), 400);
      var privateMedia = alice.send("/api/media", "POST", obj("photo", photo), 201);
      alice.send(
          sessionUrl,
          "PATCH",
          obj(
              "action",
              "photo",
              "taskId",
              tasks.getFirst().get("id"),
              "mediaId",
              privateMedia.get("id")),
          200);
      bob.request(str(privateMedia.get("url")), "GET", null, 404);
      long at = System.currentTimeMillis();
      var coordinate = obj("lng", 106.10244, "lat", 38.49462, "accuracy", 10, "at", at - 100);
      var older = copy(coordinate);
      older.put("at", at - 200);
      alice.send(
          sessionUrl + "/track",
          "POST",
          obj("points", List.of(coordinate, older, coordinate)),
          200);
      assertEquals(2, list(alice.list("/api/sessions").getFirst().get("track")).size());
      var foreign = copy(coordinate);
      foreign.put("lng", 116);
      foreign.put("lat", 40);
      alice.send(sessionUrl + "/track", "POST", obj("points", List.of(foreign)), 400);
      foreign = copy(coordinate);
      foreign.put("accuracy", 900);
      alice.send(sessionUrl + "/track", "POST", obj("points", List.of(foreign)), 400);
      var adminSession = find(rows(normal.get("/api/admin/overview").get("sessions")), "id", sid);
      assertEquals(2, integer(adminSession.get("trackCount")));
      assertFalse(adminSession.containsKey("track"));
      assertFalse(write(adminSession).contains(str(privateMedia.get("id"))));
      normal.request(str(privateMedia.get("url")), "GET", null, 404);
      alice.send(sessionUrl, "PATCH", obj("action", "pause"), 200);
      alice.send(sessionUrl + "/track", "POST", obj("points", List.of(coordinate)), 400);
      alice.send(
          sessionUrl,
          "PATCH",
          obj("action", "task", "taskId", tasks.getFirst().get("id"), "status", "done"),
          400);
      alice.send(sessionUrl, "PATCH", obj("action", "resume"), 200);
      normal.send("/api/admin/points/nmu1", "PATCH", obj("published", false), 200);
      alice.send(
          sessionUrl,
          "PATCH",
          obj("action", "task", "taskId", tasks.getFirst().get("id"), "status", "done"),
          409);
      normal.send("/api/admin/points/nmu1", "PATCH", obj("published", true), 200);
      alice.send(
          sessionUrl,
          "PATCH",
          obj("action", "task", "taskId", tasks.getFirst().get("id"), "status", "done"),
          200);
      alice.send(
          sessionUrl,
          "PATCH",
          obj(
              "action",
              "task",
              "taskId",
              tasks.get(1).get("id"),
              "status",
              "skipped",
              "reason",
              ""),
          400);
      alice.send(
          sessionUrl,
          "PATCH",
          obj(
              "action",
              "task",
              "taskId",
              tasks.get(1).get("id"),
              "status",
              "skipped",
              "reason",
              "现场无法进入"),
          200);
      alice.send(
          sessionUrl,
          "PATCH",
          obj("action", "task", "taskId", tasks.getLast().get("id"), "status", "done"),
          200);
      alice.send(sessionUrl, "PATCH", obj("action", "finish"), 200);
      alice.send(
          sessionUrl, "PATCH", obj("action", "feedback", "feedback", "路线体验不错", "rating", 5), 200);
      var library = alice.get("/api/my/library");
      assertEquals(2, integer(map(library.get("summary")).get("visits")));
      assertEquals(2, integer(map(library.get("summary")).get("unique")));
      assertEquals(0, integer(map(bob.get("/api/my/library").get("summary")).get("visits")));
      guest.request("/api/my/library", "GET", null, 401);
      root.request("/api/my/library", "GET", null, 404);
      String export = (String) alice.request(sessionUrl + "/export", "GET", null, 200);
      assertTrue(export.contains("data:image/jpeg;base64"));
      assertTrue(export.contains("路线体验不错"));
      assertFalse(export.contains("106.10244"));
      for (int minutes : List.of(7, 6, 8))
        normal.send("/api/admin/routes/nroute1", "PATCH", obj("timing", minutes), 200);
      assertTrue(
          yes(
              find(rows(normal.get("/api/admin/overview").get("routes")), "id", "nroute1")
                  .get("measured")));
      normal.send("/api/admin/templates/nt1", "PATCH", obj("approved", false), 200);
      normal.send("/api/admin/templates/nt2", "PATCH", obj("approved", false), 200);
      assertFalse(
          yes(
              find(rows(alice.request("/api/plan", "POST", prefs, 200)), "id", "nroute1")
                  .get("available")));
      normal.send("/api/admin/settings", "PATCH", obj("mapProvider", "amap", "amapKey", ""), 403);
      assertFalse(write(normal.get("/api/admin/overview")).contains("passwordHash"));
      app.restart();
      assertEquals("completed", alice.list("/api/sessions").getFirst().get("status"));
      alice.request(sessionUrl, "DELETE", null, 200);
      alice.request(str(privateMedia.get("url")), "GET", null, 404);
      guest.request(mediaUrl, "GET", null, 200);
      root.send("/api/admin/admins/" + moderator.get("id"), "PATCH", obj("enabled", false), 200);
      normal.request("/api/admin/overview", "GET", null, 401);
      assertFalse(write(app.data()).contains(ApiFixture.PASSWORD));
      System.out.println("Java exploration/domain/privacy API checks: " + app.checks);
    }
  }
}
