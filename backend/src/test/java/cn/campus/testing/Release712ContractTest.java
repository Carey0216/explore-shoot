package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.auth.Security;
import cn.campus.notification.NotificationService;
import cn.campus.storage.StoreRepository;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Release712ContractTest {
  @TempDir Path temp;

  @Test
  void administratorInboxPaginationBatchAndMuteDoNotResolveRequests() throws Exception {
    try (var app = new ApiFixture(temp)) {
      var a = app.admin();
      a.login("admin");
      app.close();
      try (var s = new StoreRepository(app.root, app.directory.resolve("data"), "test")) {
        for (int i = 0; i < 55; i++)
          s.rows("reports")
              .add(
                  obj(
                      "id",
                      Security.id(),
                      "status",
                      "pending",
                      "createdAt",
                      Instant.now().plusSeconds(i).toString()));
        s.save();
      }
      app.start();
      a.login("admin");
      var first = a.get("/api/admin/inbox?category=review");
      assertEquals(50, rows(first.get("items")).size());
      assertEquals(
          5,
          rows(a.get("/api/admin/inbox?category=review&before=" + first.get("next")).get("items"))
              .size());
      var ids = rows(first.get("items")).subList(0, 2).stream().map(n -> n.get("id")).toList();
      a.send("/api/admin/inbox/read", "POST", obj("ids", ids), 200);
      assertEquals(53, integer(a.get("/api/admin/inbox/summary").get("unread")));
      a.send("/api/admin/inbox/preferences", "PATCH", obj("hours", 1), 404);
      assertEquals(53, integer(a.get("/api/admin/inbox/summary").get("badge")));
      assertEquals(
          55,
          rows(app.data().get("reports")).stream()
              .filter(r -> eq(r.get("status"), "pending"))
              .count());
      app.advance(3600001);
      assertEquals(53, integer(a.get("/api/admin/inbox/summary").get("badge")));
      assertTrue(rows(a.get("/api/admin/inbox?category=message").get("items")).isEmpty());
    }
  }

  Map<String, Object> spot(ApiFixture.Client admin, Map<String, Object> p, Object image)
      throws Exception {
    var b =
        obj(
            "pointId",
            p.get("id"),
            "title",
            "步道取景",
            "standDescription",
            "站在公共步道内侧",
            "lng",
            p.get("lng"),
            "lat",
            p.get("lat"),
            "bearing",
            90,
            "bestTime",
            "傍晚",
            "status",
            "published");
    if (image != null) b.put("exampleMediaId", image);
    return admin.send("/api/admin/shooting-spots", "POST", b, 201);
  }

  @Test
  void classifiedBatchReadsMuteAndRestartRemainOwnerBound() throws Exception {
    try (var app = new ApiFixture(temp)) {
      var alice = app.user();
      var a = alice.register("inbox_712_alice", "");
      var bob = app.user();
      var b = bob.register("inbox_712_bob", "");
      app.close();
      try (var s = new StoreRepository(app.root, app.directory.resolve("data"), "test")) {
        for (int i = 0; i < 35; i++)
          NotificationService.add(s, a.get("id"), "n" + i, "activity", "活动" + i, "内容", "#topics");
        NotificationService.add(s, a.get("id"), "message1", "message", "私信", "保留消息", "#contact");
        NotificationService.add(s, b.get("id"), "private", "message", "另一用户", "不应读到", "#contact");
        s.save();
      }
      app.start();
      alice.login("inbox_712_alice");
      bob.login("inbox_712_bob");
      var page = alice.get("/api/notifications?category=activity");
      assertEquals(30, rows(page.get("items")).size());
      assertEquals(
          5,
          rows(alice
                  .get("/api/notifications?category=activity&before=" + page.get("next"))
                  .get("items"))
              .size());
      var ids = rows(page.get("items")).subList(0, 2).stream().map(n -> n.get("id")).toList();
      alice.send("/api/notifications/read", "POST", obj("ids", ids), 200);
      assertEquals(34, integer(alice.get("/api/notifications/summary").get("unread")));
      String foreign = str(rows(bob.get("/api/notifications").get("items")).getFirst().get("id"));
      alice.request("/api/notifications/read", "POST", obj("ids", List.of(foreign)), 404);
      alice.send("/api/notifications/read", "POST", obj("all", true, "category", "activity"), 200);
      assertEquals(1, integer(alice.get("/api/notifications/summary").get("unread")));
      alice.send("/api/notifications/preferences", "PATCH", obj("hours", 8), 404);
      var summary = alice.get("/api/notifications/summary");
      assertEquals(1, integer(summary.get("unread")));
      assertEquals(1, integer(summary.get("badge")));
      assertEquals(1, integer(bob.get("/api/notifications/summary").get("badge")));
      app.restart();
      alice.login("inbox_712_alice");
      assertEquals(1, integer(alice.get("/api/notifications/summary").get("badge")));
      app.advance(8 * 3600000L + 1);
      assertEquals(1, integer(alice.get("/api/notifications/summary").get("badge")));
      alice.request("/api/notifications?category=secret", "GET", null, 400);
    }
  }

  @Test
  void collectionsAndRevocableSnapshotsNeverExposePrivatePlanState() throws Exception {
    try (var app = new ApiFixture(temp)) {
      var admin = app.admin();
      admin.login("admin");
      var a = app.user();
      a.register("plan_712_alice", "");
      var b = app.user();
      b.register("plan_712_bob", "");
      var guest = app.user();
      var p = rows(guest.get("/api/catalog").get("points")).getFirst();
      var s = spot(admin, p, null);
      a.send("/api/bookmarks", "POST", obj("pointId", p.get("id")), 200);
      var group =
          a.send(
              "/api/my/collections",
              "POST",
              obj("title", "建筑光影", "pointIds", List.of(p.get("id"))),
              201);
      b.request("/api/my/collections/" + group.get("id"), "DELETE", obj("revision", 1), 404);
      a.request(
          "/api/my/collections/" + group.get("id"),
          "PUT",
          obj("title", "变更", "pointIds", List.of(), "revision", 9),
          409);
      assertFalse(write(a.get("/api/my/collections")).contains("ownerId"));
      var plan =
          a.send(
              "/api/my/plans",
              "POST",
              obj(
                  "title",
                  "周末取景",
                  "items",
                  List.of(
                      obj(
                          "id",
                          Security.id(),
                          "spotId",
                          s.get("id"),
                          "composition",
                          "PRIVATE_NOTE",
                          "done",
                          true))),
              201);
      String path = "/api/my/plans/" + plan.get("id") + "/share";
      b.request(path, "POST", obj("revision", 1), 404);
      var share = a.send(path, "POST", obj("revision", 1, "includeComposition", false), 201);
      String publicPath = "/api/plan-shares/" + share.get("token");
      String text = write(guest.get(publicPath));
      assertFalse(text.contains("ownerId"));
      assertFalse(text.contains("done"));
      assertFalse(text.contains("PRIVATE_NOTE"));
      var body = obj("submissionId", Security.id());
      var copy = b.send(publicPath + "/import", "POST", body, 201);
      assertFalse(yes(rows(copy.get("items")).getFirst().get("done")));
      assertEquals(copy.get("id"), b.send(publicPath + "/import", "POST", body, 201).get("id"));
      a.send(path, "DELETE", obj("revision", 1), 200);
      guest.request(publicPath, "GET", null, 404);
      assertEquals(1, rows(b.get("/api/my/plans").get("items")).size());
      var next = a.send(path, "POST", obj("revision", 1, "includeComposition", true), 201);
      assertTrue(
          write(guest.get("/api/plan-shares/" + next.get("token"))).contains("PRIVATE_NOTE"));
      a.send("/api/my/plans/" + plan.get("id"), "DELETE", obj("revision", 1), 200);
      guest.request("/api/plan-shares/" + next.get("token"), "GET", null, 404);
      app.restart();
      b.login("plan_712_bob");
      assertEquals(1, rows(b.get("/api/my/plans").get("items")).size());
    }
  }

  @Test
  void uploadRetryAndAuthorizedThumbnailRevalidationAvoidDuplicateTraffic() throws Exception {
    try (var app = new ApiFixture(temp)) {
      app.promoteFixtureOwner();
      var top = app.admin();
      top.login("admin");
      var user = app.user();
      user.register("media_712_alice", "");
      String photo =
          "data:image/jpeg;base64,"
              + Base64.getEncoder()
                  .encodeToString(
                      Files.readAllBytes(app.root.resolve("dist/shared/nmu-library.jpg")));
      var body = obj("photo", photo, "submissionId", Security.id());
      var upload = top.send("/api/media", "POST", body, 201);
      assertEquals(upload.get("id"), top.send("/api/media", "POST", body, 201).get("id"));
      assertEquals(1, rows(app.data().get("media")).size());
      var bad = copy(body);
      bad.put("photo", "different");
      top.request("/api/media", "POST", bad, 409);
      var p = rows(user.get("/api/catalog").get("points")).getFirst();
      var s = spot(top, p, upload.get("id"));
      String path = "/api/shooting-spots/" + s.get("id") + "/photo?size=thumb";
      var http = HttpClient.newHttpClient();
      var uri = URI.create("http://127.0.0.1:" + app.userPort + path);
      var response =
          http.send(HttpRequest.newBuilder(uri).build(), HttpResponse.BodyHandlers.ofByteArray());
      assertEquals(200, response.statusCode());
      assertTrue(
          response.body().length < Files.size(app.root.resolve("dist/shared/nmu-library.jpg")));
      var tag = response.headers().firstValue("etag").orElseThrow();
      assertEquals(
          304,
          http.send(
                  HttpRequest.newBuilder(uri).header("If-None-Match", tag).build(),
                  HttpResponse.BodyHandlers.ofByteArray())
              .statusCode());
      assertTrue(integer(top.get("/api/admin/performance/images").get("hits")) >= 1);
      var edit =
          obj(
              "pointId",
              p.get("id"),
              "title",
              "步道取景",
              "standDescription",
              "站在公共步道内侧",
              "lng",
              p.get("lng"),
              "lat",
              p.get("lat"),
              "bearing",
              90,
              "bestTime",
              "傍晚",
              "status",
              "draft",
              "revision",
              s.get("revision"));
      top.send("/api/admin/shooting-spots/" + s.get("id"), "PATCH", edit, 200);
      assertEquals(
          404,
          http.send(
                  HttpRequest.newBuilder(uri).header("If-None-Match", tag).build(),
                  HttpResponse.BodyHandlers.ofByteArray())
              .statusCode());
    }
  }

  @Test
  void subscribedActivityRemindersAreIdempotentAndCancellationIsRespected() throws Exception {
    try (var app = new ApiFixture(temp)) {
      var admin = app.admin();
      admin.login("admin");
      var a = app.user();
      a.register("reminder_712_alice", "");
      var b = app.user();
      b.register("reminder_712_bob", "");
      var p = rows(a.get("/api/catalog").get("points")).getFirst();
      var t =
          admin.send(
              "/api/admin/topics",
              "POST",
              obj(
                  "title",
                  "秋日计划",
                  "description",
                  "校园公共步道",
                  "theme",
                  "autumn",
                  "startsAt",
                  Instant.now().plusSeconds(2 * 86400).toString(),
                  "endsAt",
                  Instant.now().plusSeconds(4 * 86400).toString(),
                  "pointIds",
                  List.of(p.get("id")),
                  "ruleIds",
                  List.of(),
                  "published",
                  true),
              201);
      a.send("/api/my/topic-reminders", "POST", obj("topicId", t.get("id"), "enabled", true), 200);
      app.advance(86400001L);
      var notices = rows(a.get("/api/notifications?category=activity").get("items"));
      assertEquals(
          1, notices.stream().filter(n -> str(n.get("title")).startsWith("活动即将开始")).count());
      assertEquals(
          notices.size(), rows(a.get("/api/notifications?category=activity").get("items")).size());
      assertTrue(
          rows(b.get("/api/notifications").get("items")).stream()
              .noneMatch(n -> str(n.get("title")).startsWith("活动即将开始")));
      a.send("/api/my/topic-reminders", "POST", obj("topicId", t.get("id"), "enabled", false), 200);
      app.advance(86400001L);
      assertTrue(
          rows(a.get("/api/notifications").get("items")).stream()
              .noneMatch(n -> str(n.get("title")).startsWith("订阅活动已开始")));
    }
  }
}
