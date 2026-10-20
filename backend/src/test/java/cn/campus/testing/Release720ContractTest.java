package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.auth.Security;
import cn.campus.storage.StoreRepository;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Release720ContractTest {
  @TempDir Path temp;

  @Test
  void databaseProjectionPagesAggregatesAndInboxSurviveEditsAndRestart() throws Exception {
    Path root = Path.of("..").toAbsolutePath().normalize();
    String user = "owner720";
    try (var s = new StoreRepository(root, temp.resolve("projection"), "test")) {
      for (int i = 0; i < 140; i++)
        s.rows("checkins")
            .add(
                obj(
                    "id",
                    "record-" + i,
                    "ownerId",
                    user,
                    "pointId",
                    i % 2 == 0 ? "nmu1" : "nmu2",
                    "mediaId",
                    i % 3 == 0 ? Security.id() : null,
                    "createdAt",
                    String.format("2026-10-%02dT12:00:%02dZ", 1 + i / 60, i % 60)));
      s.rows("checkins")
          .add(
              obj(
                  "id",
                  "other-record",
                  "ownerId",
                  "other",
                  "pointId",
                  "nmu3",
                  "mediaId",
                  Security.id(),
                  "createdAt",
                  "2026-10-01T12:00:00Z"));
      s.rows("sessions")
          .add(
              obj(
                  "id",
                  "session720",
                  "ownerId",
                  user,
                  "createdAt",
                  "2026-09-01T01:00:00Z",
                  "tasks",
                  List.of(
                      obj(
                          "id",
                          "task1",
                          "pointId",
                          "nmu3",
                          "pointName",
                          "测试楼",
                          "title",
                          "角度",
                          "status",
                          "done",
                          "completedAt",
                          "2026-10-01T12:05:00Z"),
                      obj("id", "skip", "status", "skipped", "pointId", "nmu4"))));
      for (int i = 0; i < 135; i++)
        s.rows("points")
            .add(
                obj(
                    "id",
                    "map720-" + i,
                    "name",
                    "地图测试" + i,
                    "published",
                    true,
                    "open",
                    true,
                    "lng",
                    106.099 + i * .00001,
                    "lat",
                    38.497));
      for (int i = 0; i < 76; i++)
        s.rows("contactRequests")
            .add(
                obj(
                    "id",
                    "request-" + i,
                    "userId",
                    user,
                    "status",
                    "pending",
                    "body",
                    "需要帮助" + i,
                    "createdAt",
                    String.format("2026-10-01T00:%02d:%02dZ", i / 60, i % 60)));
      s.rows("conversations")
          .add(
              obj(
                  "id",
                  "thread720",
                  "userId",
                  user,
                  "adminId",
                  "admin720",
                  "adminReadAt",
                  "2026-01-01T00:00:00Z"));
      s.rows("directMessages")
          .add(
              obj(
                  "id",
                  "message720",
                  "conversationId",
                  "thread720",
                  "from",
                  "user",
                  "body",
                  "私人回复",
                  "createdAt",
                  "2026-10-02T00:00:00Z"));
      s.save();
      var summary = s.journeys().summary(user);
      assertEquals(141, integer(summary.get("visits")));
      assertEquals(3, integer(summary.get("unique")));
      assertEquals(47, integer(summary.get("photos")));
      var records = s.journeys().records(user, 2, 12);
      assertEquals(12, records.items().size());
      assertEquals(141, records.total());
      assertTrue(records.hasMore());
      assertFalse(records.items().stream().anyMatch(r -> eq(r.get("id"), "other-record")));
      assertEquals(1, integer(s.journeys().summary("other").get("visits")));
      assertEquals(
          47,
          integer(
              s.journeys()
                  .achievement(user, obj("kind", "night", "target", 100, "pointIds", List.of()))
                  .get("progress")));
      var map = s.journeys().map(106.098, 38.496, 106.102, 38.498, 1, 60);
      assertTrue(map.total() >= 135);
      assertEquals(60, map.items().size());
      assertEquals(60, s.journeys().map(106.098, 38.496, 106.102, 38.498, 2, 60).items().size());
      var inbox =
          s.journeys().inbox(Set.of("messages"), "admin720", false, List.of(), "message", "");
      assertEquals(77, inbox.unread());
      assertEquals(50, inbox.items().size());
      assertNotNull(inbox.next());
      assertEquals(
          27,
          s.journeys()
              .inbox(Set.of("messages"), "admin720", false, List.of(), "message", inbox.next())
              .items()
              .size());
      assertEquals(
          76,
          s.journeys()
              .inbox(Set.of("messages"), "another", false, List.of(), "message", "")
              .unread());
      assertEquals(
          0, s.journeys().inbox(Set.of(), "admin720", true, List.of(), "all", "").unread());
      var selected =
          s.journeys()
              .availableInboxIds(
                  Set.of("messages"),
                  "another",
                  false,
                  List.of("message:message720", "contactRequests:request-0", "arbitrary"));
      assertEquals(Set.of("contactRequests:request-0"), selected);
      s.rows("conversations").getLast().put("adminReadAt", "2027-01-01T00:00:00Z");
      s.rows("contactRequests").getFirst().put("status", "resolved");
      s.rows("checkins").removeFirst();
      s.save();
      assertEquals(140, integer(s.journeys().summary(user).get("visits")));
      assertEquals(
          75,
          s.journeys().inbox(Set.of("messages"), "admin720", false, List.of(), "all", "").unread());
    }
    try (var s = new StoreRepository(root, temp.resolve("projection"), "test")) {
      assertEquals(140, integer(s.journeys().summary(user).get("visits")));
      assertEquals(4, s.rows("shootingGuides").size());
      assertEquals(
          75,
          s.journeys().inbox(Set.of("messages"), "admin720", false, List.of(), "all", "").unread());
    }
  }

  @Test
  void guidesPlanningAndSpotMetadataAreEditableScopedAndOptimistic() throws Exception {
    try (var app = new ApiFixture(temp.resolve("http"))) {
      var admin = app.admin();
      admin.login("admin");
      var alice = app.user();
      alice.register("journey_alice", "");
      var bob = app.user();
      bob.register("journey_bob", "");
      var guides = rows(alice.get("/api/guides").get("items"));
      assertEquals(4, guides.size());
      assertTrue(
          rows(guides.getFirst().get("points")).stream()
              .allMatch(p -> !str(p.get("phoneTip")).isBlank()));
      var spot =
          admin.send(
              "/api/admin/shooting-spots",
              "POST",
              obj(
                  "pointId",
                  "nmu1",
                  "title",
                  "隔离测试站位",
                  "standDescription",
                  "仅用于接口验收，不代表真实站位",
                  "lng",
                  106.100,
                  "lat",
                  38.497,
                  "bearing",
                  90,
                  "bestTime",
                  "测试资料",
                  "status",
                  "published",
                  "compositionTip",
                  "打开九宫格，保持手机竖直。",
                  "verifiedAt",
                  "2026-10-19",
                  "openingWindows",
                  List.of(
                      obj("days", List.of(1, 2, 3, 4, 5, 6, 7), "start", "08:00", "end", "18:00"))),
              201);
      String id = str(spot.get("id"));
      var publicSpot = alice.get("/api/shooting-spots/" + id);
      assertEquals("2026-10-19", publicSpot.get("verifiedAt"));
      assertFalse(publicSpot.containsKey("authorId"));
      var preview =
          alice.send(
              "/api/assistant/plan-preview", "POST", obj("question", "图书馆拍摄", "budget", 15), 200);
      assertTrue(yes(preview.get("canSave")));
      assertEquals(0, rows(alice.get("/api/my/plans").get("items")).size());
      assertTrue(integer(map(preview.get("schedule")).get("estimatedMinutes")) <= 15);
      var item =
          obj(
              "id",
              Security.id(),
              "spotId",
              id,
              "composition",
              "测试构图",
              "done",
              false,
              "minutes",
              12);
      var plan =
          alice.send(
              "/api/my/plans",
              "POST",
              obj(
                  "title",
                  "傍晚测试",
                  "items",
                  List.of(item),
                  "departure",
                  "2026-10-20T13:00:00Z",
                  "checklist",
                  obj("battery", true)),
              201);
      assertTrue(
          rows(map(plan.get("schedule")).get("warnings")).stream()
              .anyMatch(w -> eq(w.get("level"), "conflict")));
      assertTrue(yes(map(plan.get("checklist")).get("battery")));
      String pid = str(plan.get("id"));
      alice.send(
          "/api/my/plans/" + pid,
          "PUT",
          obj(
              "title",
              "修改",
              "items",
              List.of(item),
              "revision",
              1,
              "departure",
              "2026-10-20T02:00:00Z"),
          200);
      alice.send(
          "/api/my/plans/" + pid,
          "PUT",
          obj("title", "过期写入", "items", List.of(item), "revision", 1),
          409);
      var stored = rows(alice.get("/api/my/plans").get("items")).getFirst();
      assertEquals("修改", stored.get("title"));
      assertTrue(yes(map(stored.get("checklist")).get("battery")));
      assertFalse(
          rows(map(stored.get("schedule")).get("warnings")).stream()
              .anyMatch(w -> eq(w.get("level"), "conflict")));
      assertTrue(rows(bob.get("/api/my/plans").get("items")).isEmpty());
      bob.send(
          "/api/my/plans/" + pid,
          "PUT",
          obj("title", "越权", "items", List.of(item), "revision", 2),
          404);
      var bad = copy(item);
      bad.put("minutes", 0);
      alice.send(
          "/api/my/plans/" + pid,
          "PUT",
          obj("title", "非法停留", "items", List.of(bad), "revision", 2),
          400);
      assertEquals("修改", rows(alice.get("/api/my/plans").get("items")).getFirst().get("title"));
      var guide = rows(admin.get("/api/admin/guides").get("items")).getFirst();
      var update = copy(guide);
      update.remove("id");
      update.put("title", "新的新生拍摄指南");
      admin.send("/api/admin/guides/" + guide.get("id"), "PUT", update, 200);
      admin.send("/api/admin/guides/" + guide.get("id"), "PUT", update, 409);
      alice.request("/api/admin/guides", "GET", null, 404);
      alice.request("/api/map/points?west=NaN&south=0&east=1&north=2", "GET", null, 400);
      var map = alice.get("/api/map/points?west=106.09&south=38.49&east=106.11&north=38.51");
      assertTrue(rows(map.get("points")).size() <= 60);
      for (var p : rows(map.get("points"))) assertFalse(p.containsKey("viewCount"));
    }
  }

  @Test
  void comparisonUsesTakenTimeAndNeverReturnsPendingOrPrivateFields() throws Exception {
    try (var app = new ApiFixture(temp.resolve("compare"))) {
      var admin = app.admin();
      admin.login("admin");
      var alice = app.user();
      var account = alice.register("compare_alice", "");
      var bob = app.user();
      bob.register("compare_bob", "");
      var spot =
          admin.send(
              "/api/admin/shooting-spots",
              "POST",
              obj(
                  "pointId",
                  "nmu1",
                  "title",
                  "对比测试",
                  "standDescription",
                  "隔离测试",
                  "lng",
                  106.100,
                  "lat",
                  38.497,
                  "bearing",
                  20,
                  "bestTime",
                  "白天",
                  "status",
                  "published"),
              201);
      String sid = str(spot.get("id"));
      var checks = new ArrayList<String>();
      app.close();
      try (var s = new StoreRepository(app.root, app.directory.resolve("data"), "test")) {
        for (int i = 0; i < 4; i++) {
          String check = Security.id(), work = Security.id();
          checks.add(check);
          s.rows("checkins")
              .add(
                  obj(
                      "id",
                      check,
                      "ownerId",
                      account.get("id"),
                      "pointId",
                      "nmu1",
                      "mediaId",
                      Security.id(),
                      "note",
                      "绝不公开的感受",
                      "location",
                      obj("lng", 106.1, "lat", 38.497),
                      "createdAt",
                      "2026-10-20T00:00:00Z"));
          s.rows("works")
              .add(
                  obj(
                      "id",
                      work,
                      "ownerId",
                      account.get("id"),
                      "checkinId",
                      check,
                      "pointId",
                      "nmu1",
                      "spotId",
                      sid,
                      "status",
                      i == 3 ? "pending" : "approved",
                      "caption",
                      "公开配文" + i,
                      "createdAt",
                      "2026-10-20T00:00:00Z",
                      "experience",
                      i == 0
                          ? obj("takenAt", "2026-04-12T00:30:00Z", "tips", "春天取景")
                          : i == 1 ? obj("takenAt", "2026-10-12T11:00:00Z") : obj()));
        }
        s.save();
      }
      app.start();
      var all = bob.get("/api/works/compare?spotId=" + sid);
      assertEquals(3, integer(all.get("total")));
      for (var item : rows(all.get("items")))
        for (String forbidden : List.of("ownerId", "checkinId", "mediaId", "note", "location"))
          assertFalse(item.containsKey(forbidden));
      assertEquals(
          1,
          integer(
              bob.get("/api/works/compare?spotId=" + sid + "&season=spring&time=morning")
                  .get("total")));
      assertEquals(
          1, integer(bob.get("/api/works/compare?spotId=" + sid + "&season=unknown").get("total")));
      bob.request("/api/works/compare?spotId=" + sid + "&season=invalid", "GET", null, 400);
      alice.send(
          "/api/checkins/" + checks.getFirst() + "/sharing", "PUT", obj("public", false), 200);
      assertEquals(
          0, integer(bob.get("/api/works/compare?spotId=" + sid + "&season=spring").get("total")));
    }
  }

  @Test
  void privateNotesAndPassportUseBoundedOwnerPages() throws Exception {
    try (var app = new ApiFixture(temp.resolve("history"))) {
      var alice = app.user();
      var owner = alice.register("history_alice", "");
      var bob = app.user();
      var other = bob.register("history_bob", "");
      String sessionId = Security.id();
      app.close();
      try (var s = new StoreRepository(app.root, app.directory.resolve("data"), "test")) {
        for (int i = 0; i < 45; i++)
          s.rows("checkins")
              .add(
                  obj(
                      "id",
                      Security.id(),
                      "ownerId",
                      owner.get("id"),
                      "pointId",
                      "nmu1",
                      "pointName",
                      "图书馆",
                      "createdAt",
                      String.format("2026-10-01T10:00:%02dZ", i),
                      "note",
                      "私密感受"));
        for (int i = 0; i < 35; i++)
          s.rows("sessions")
              .add(
                  obj(
                      "id",
                      i == 0 ? sessionId : Security.id(),
                      "ownerId",
                      owner.get("id"),
                      "routeName",
                      "路线" + i,
                      "status",
                      "ended",
                      "createdAt",
                      String.format("2026-10-01T11:00:%02dZ", i),
                      "track",
                      List.of(obj("lng", 106.1, "lat", 38.497)),
                      "tasks",
                      List.of(
                          obj(
                              "id",
                              Security.id(),
                              "pointId",
                              "nmu1",
                              "pointName",
                              "图书馆",
                              "title",
                              "测试拍摄",
                              "status",
                              "done",
                              "completedAt",
                              "2026-10-01T11:05:00Z"))));
        s.rows("sessions")
            .add(
                obj(
                    "id",
                    Security.id(),
                    "ownerId",
                    other.get("id"),
                    "routeName",
                    "他人的秘密",
                    "status",
                    "ended",
                    "createdAt",
                    "2026-10-01T11:30:00Z",
                    "track",
                    List.of(),
                    "tasks",
                    List.of()));
        s.save();
      }
      app.start();
      var notes = alice.get("/api/my/notes?page=2");
      assertEquals(35, integer(notes.get("total")));
      assertEquals(12, rows(notes.get("items")).size());
      for (var item : rows(notes.get("items"))) {
        assertFalse(item.containsKey("track"));
        assertFalse(item.containsKey("tasks"));
        assertFalse(eq(item.get("routeName"), "他人的秘密"));
      }
      assertEquals(
          6,
          integer(
              alice
                  .get(
                      "/api/my/notes?query="
                          + java.net.URLEncoder.encode(
                              "路线3", java.nio.charset.StandardCharsets.UTF_8))
                  .get("total")));
      var records = alice.get("/api/my/records?page=3");
      assertEquals(80, integer(records.get("total")));
      assertEquals(12, rows(records.get("items")).size());
      assertEquals(80, integer(map(alice.get("/api/my/passport").get("summary")).get("visits")));
      assertEquals(
          80, integer(map(alice.get("/api/my/library?compact=1").get("summary")).get("visits")));
      assertEquals(1, integer(bob.get("/api/my/notes").get("total")));
      assertTrue(rows(bob.get("/api/my/records").get("items")).isEmpty());
      bob.request("/api/sessions/" + sessionId, "GET", null, 404);
      var detail = alice.get("/api/sessions/" + sessionId);
      assertFalse(detail.isEmpty());
    }
  }

  @Test
  void communityGalleryValidatesEveryOwnerBeforePublicationAndRetainsDimensions() throws Exception {
    try (var app = new ApiFixture(temp.resolve("gallery"))) {
      var alice = app.user();
      var owner = alice.register("gallery_alice", "");
      var bob = app.user();
      bob.register("gallery_bob", "");
      app.close();
      try (var store = new StoreRepository(app.root, app.directory.resolve("data"), "test")) {
        find(store.rows("users"), "id", owner.get("id")).put("scoutStatus", "approved");
        store.save();
      }
      app.start();
      var ids = new ArrayList<String>();
      for (String file : List.of("nmu-library.jpg", "nmu-campus.jpg")) {
        String photo =
            "data:image/jpeg;base64,"
                + Base64.getEncoder()
                    .encodeToString(Files.readAllBytes(app.root.resolve("dist/shared/" + file)));
        ids.add(
            str(
                alice
                    .send(
                        "/api/media",
                        "POST",
                        obj("photo", photo, "submissionId", Security.id()),
                        201)
                    .get("id")));
      }
      String photo =
          "data:image/jpeg;base64,"
              + Base64.getEncoder()
                  .encodeToString(
                      Files.readAllBytes(app.root.resolve("dist/shared/nmu-library.jpg")));
      String foreign = str(bob.send("/api/media", "POST", obj("photo", photo), 201).get("id"));
      var body =
          obj(
              "name",
              "多图隔离验收",
              "description",
              "仅用于测试多图发布",
              "theme",
              "建筑",
              "condition",
              "测试公共区域",
              "lng",
              106.100,
              "lat",
              38.497,
              "mediaId",
              ids.getFirst(),
              "mediaIds",
              List.of(ids.getFirst(), foreign),
              "submissionId",
              Security.id());
      alice.send("/api/points", "POST", body, 400);
      for (var media : rows(app.data().get("media")))
        assertFalse(
            yes(media.get("public")), "Failed ownership validation must not publish any image");
      body.put("mediaIds", List.of(ids.getFirst(), ids.getFirst()));
      alice.send("/api/points", "POST", body, 400);
      body.put("mediaIds", ids);
      var point = alice.send("/api/points", "POST", body, 201);
      assertEquals(2, list(point.get("gallery")).size());
      assertEquals("/media/" + ids.getFirst(), point.get("cover"));
      assertTrue(integer(point.get("coverWidth")) > 0);
      assertTrue(integer(point.get("coverHeight")) > 0);
      assertEquals(point.get("id"), alice.send("/api/points", "POST", body, 200).get("id"));
      assertFalse(yes(find(rows(app.data().get("media")), "id", foreign).get("public")));
      for (String id : ids) {
        var response =
            java.net.http.HttpClient.newHttpClient()
                .send(
                    java.net.http.HttpRequest.newBuilder(
                            java.net.URI.create(
                                "http://127.0.0.1:" + app.userPort + "/media/" + id))
                        .build(),
                    java.net.http.HttpResponse.BodyHandlers.ofByteArray());
        assertEquals(200, response.statusCode());
        assertTrue(response.body().length > 100);
      }
    }
  }
}
