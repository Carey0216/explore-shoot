package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ShootingCommunityContractTest {
  @TempDir Path temporary;

  private Map<String, Object> spotBody(Map<String, Object> p, String status, Object media) {
    return obj(
        "pointId",
        p.get("id"),
        "title",
        "东侧树下的钟楼视角",
        "standDescription",
        "站在公共步道边，朝钟楼拍摄，勿进入草坪",
        "lng",
        p.get("lng"),
        "lat",
        p.get("lat"),
        "bearing",
        270,
        "bestTime",
        "日落前一小时",
        "exampleMediaId",
        media,
        "status",
        status);
  }

  private String photo(ApiFixture app) throws Exception {
    return "data:image/jpeg;base64,"
        + Base64.getEncoder()
            .encodeToString(Files.readAllBytes(app.root.resolve("dist/shared/nmu-library.jpg")));
  }

  @Test
  void independentPositionsRequirePermissionValidCoordinatesAndRevision() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin();
      admin.login("admin");
      var user = app.user();
      user.register("spot_user", "");
      var guest = app.user();
      var p = rows(guest.get("/api/catalog").get("points")).getFirst();
      var media = admin.send("/api/media", "POST", obj("photo", photo(app)), 201);
      var body = spotBody(p, "draft", media.get("id"));
      user.send("/api/shooting-spots", "POST", body, 403);
      guest.send("/api/admin/shooting-spots", "POST", body, 404);
      var spot = admin.send("/api/admin/shooting-spots", "POST", body, 201);
      String id = str(spot.get("id"));
      guest.request("/api/shooting-spots/" + id, "GET", null, 404);
      assertTrue(
          rows(guest.get("/api/points/" + p.get("id") + "/shooting-spots").get("spots")).isEmpty());
      body.putAll(obj("status", "published", "revision", 1));
      admin.send("/api/admin/shooting-spots/" + id, "PATCH", body, 200);
      admin.send("/api/admin/shooting-spots/" + id, "PATCH", body, 409);
      var publicSpot = guest.get("/api/shooting-spots/" + id);
      assertEquals(270.0, num(publicSpot.get("bearing")));
      assertFalse(publicSpot.containsKey("exampleMediaId"));
      assertFalse(publicSpot.containsKey("authorId"));
      guest.request(str(publicSpot.get("photo")), "GET", null, 200);
      guest.request("/media/" + media.get("id"), "GET", null, 404);
      body.putAll(obj("revision", 2, "bearing", 360));
      admin.send("/api/admin/shooting-spots/" + id, "PATCH", body, 400);
      body.putAll(obj("bearing", 0, "lng", 0));
      admin.send("/api/admin/shooting-spots/" + id, "PATCH", body, 400);
      admin.send("/api/admin/points/" + p.get("id"), "PATCH", obj("published", false), 200);
      guest.request(str(publicSpot.get("photo")), "GET", null, 404);
      app.restart();
      assertEquals(1, rows(app.data().get("shootingSpots")).size());
    }
  }

  @Test
  void privatePhotosAreNeverPublicUntilOptInAndReviewAndRevokeImmediately() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin();
      admin.login("admin");
      var alice = app.user();
      alice.register("wall_alice", "");
      var bob = app.user();
      bob.register("wall_bob", "");
      var guest = app.user();
      var p = rows(guest.get("/api/catalog").get("points")).getFirst();
      String point = str(p.get("id"));
      var spot =
          admin.send("/api/admin/shooting-spots", "POST", spotBody(p, "published", null), 201);
      String sid = str(spot.get("id"));
      var media = alice.send("/api/media", "POST", obj("photo", photo(app)), 201);
      var record =
          alice.send(
              "/api/checkins",
              "POST",
              obj(
                  "submissionId",
                  UUID.randomUUID().toString(),
                  "pointId",
                  point,
                  "spotId",
                  sid,
                  "mediaId",
                  media.get("id"),
                  "note",
                  "PRIVATE NOTE SHOULD NEVER LEAK"),
              201);
      String path = "/api/checkins/" + record.get("id") + "/sharing";
      assertTrue(rows(guest.get("/api/works?pointId=" + point).get("items")).isEmpty());
      bob.send(path, "PUT", obj("public", true, "spotId", sid), 404);
      var share = obj("public", true, "spotId", sid, "caption", "欢迎参考这个角度");
      var w = alice.send(path, "PUT", share, 200);
      String wid = str(w.get("id"));
      assertEquals(wid, alice.send(path, "PUT", share, 200).get("id"));
      assertEquals(1, rows(app.data().get("works")).size());
      guest.request("/api/works/" + wid + "/photo", "GET", null, 404);
      admin.send("/api/admin/works/" + wid, "PATCH", obj("status", "approved", "revision", 1), 200);
      var out = guest.get("/api/works?spotId=" + sid);
      String json = write(out);
      for (String secret :
          List.of(
              "PRIVATE NOTE",
              "ownerId",
              "checkinId",
              "mediaId",
              "location",
              "viewCount",
              "dislikeCount")) assertFalse(json.contains(secret), secret);
      assertEquals(1, rows(out.get("items")).size());
      guest.request("/api/works/" + wid + "/photo", "GET", null, 200);
      guest.request("/media/" + media.get("id"), "GET", null, 404);
      assertEquals(1, integer(alice.get("/api/notifications").get("unread")));
      var report =
          bob.send("/api/works/" + wid + "/reports", "POST", obj("description", "照片存在不当公开问题"), 201);
      assertEquals(
          report.get("id"),
          bob.send("/api/works/" + wid + "/reports", "POST", obj("description", "重复举报不会重复创建"), 200)
              .get("id"));
      admin.send(
          "/api/admin/work-reports/" + report.get("id"),
          "PATCH",
          obj("action", "hide", "note", "已核实处理"),
          200);
      guest.request("/api/works/" + wid + "/photo", "GET", null, 404);
      assertEquals(1, integer(bob.get("/api/notifications").get("unread")));
      w = alice.send(path, "PUT", share, 200);
      alice.send(path, "PUT", obj("public", false), 200);
      admin.send(
          "/api/admin/admins",
          "POST",
          obj(
              "username",
              "wall_moderator",
              "name",
              "审核管理员",
              "password",
              ApiFixture.PASSWORD,
              "role",
              "normal"),
          201);
      var moderator = app.admin();
      moderator.login("wall_moderator");
      assertEquals(1, rows(moderator.get("/api/admin/works").get("items")).size());
      moderator.request("/media/" + media.get("id"), "GET", null, 404);
      moderator.send(
          "/api/admin/works/" + wid,
          "PATCH",
          obj("status", "approved", "revision", w.get("revision")),
          409);
      admin.request("/api/admin/works/" + wid + "/photo", "GET", null, 404);
      alice.request("/media/" + media.get("id"), "GET", null, 200);
      app.restart();
      guest.request("/api/works/" + wid + "/photo", "GET", null, 404);
      alice.request("/api/checkins/" + record.get("id"), "DELETE", null, 200);
      assertTrue(rows(app.data().get("works")).isEmpty());
    }
  }

  @Test
  void reviewResultsArePrivatePersistentAndUnreadStateIsAccountScoped() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin();
      admin.login("admin");
      var alice = app.user();
      alice.register("notice_alice", "");
      var bob = app.user();
      bob.register("notice_bob", "");
      alice.send("/api/scout/apply", "POST", obj("reason", "愿意维护校园真实机位信息"), 201);
      var application = rows(admin.get("/api/admin/overview").get("applications")).getFirst();
      var url = "/api/admin/applications/" + application.get("id");
      admin.send(url, "PATCH", obj("status", "approved", "note", "欢迎参与校园共创"), 200);
      admin.send(url, "PATCH", obj("status", "approved"), 400);
      var inbox = alice.get("/api/notifications");
      assertEquals(1, integer(inbox.get("unread")));
      String id = str(rows(inbox.get("items")).getFirst().get("id"));
      bob.send("/api/notifications/read", "POST", obj("id", id), 404);
      assertTrue(rows(bob.get("/api/notifications").get("items")).isEmpty());
      alice.send("/api/notifications/read", "POST", obj("id", id), 200);
      alice.send("/api/notifications/read", "POST", obj("all", true), 200);
      app.restart();
      assertEquals(0, integer(alice.get("/api/notifications/summary").get("unread")));
      assertEquals(1, rows(alice.get("/api/notifications").get("items")).size());
      app.user().request("/api/notifications", "GET", null, 401);
    }
  }

  @Test
  void pointReportAndSpotDecisionsNotifyAndCheckinSharingIsAtomic() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin();
      admin.login("admin");
      var invite = admin.send("/api/admin/invites", "POST", obj("maxUses", 3, "days", 1), 201);
      var scout = app.user();
      scout.register("community_scout", str(invite.get("code")));
      var seed = rows(scout.get("/api/catalog").get("points")).getFirst();
      var media = scout.send("/api/media", "POST", obj("photo", photo(app)), 201);
      var point =
          scout.send(
              "/api/points",
              "POST",
              obj(
                  "name",
                  "真实机位测试地点",
                  "description",
                  "隔离数据中的测试地点介绍",
                  "condition",
                  "公共步道拍摄",
                  "theme",
                  "建筑",
                  "lng",
                  seed.get("lng"),
                  "lat",
                  seed.get("lat"),
                  "mediaId",
                  media.get("id")),
              201);
      String pid = str(point.get("id"));
      admin.send("/api/admin/points/" + pid, "PATCH", obj("certify", true), 200);
      admin.send("/api/admin/points/" + pid, "PATCH", obj("certify", true), 200);
      assertEquals(1, integer(scout.get("/api/notifications/summary").get("unread")));
      var report =
          scout.send(
              "/api/reports", "POST", obj("pointId", pid, "description", "步道维护中请核实通行状态"), 201);
      admin.send(
          "/api/admin/reports/" + report.get("id"),
          "PATCH",
          obj("action", "reject", "note", "现场已核实"),
          200);
      var body = spotBody(point, "published", null);
      var spot = scout.send("/api/shooting-spots", "POST", body, 201);
      assertEquals("pending", spot.get("status"));
      body.put("revision", 1);
      admin.send("/api/admin/shooting-spots/" + spot.get("id"), "PATCH", body, 200);
      assertEquals(3, integer(scout.get("/api/notifications/summary").get("unread")));
      assertEquals(3, integer(scout.get("/api/my/community").get("unreadNotifications")));
      var input =
          obj(
              "submissionId",
              UUID.randomUUID().toString(),
              "pointId",
              pid,
              "spotId",
              spot.get("id"),
              "note",
              "私密感受",
              "shareToWall",
              true,
              "publicCaption",
              "主动公开的配文");
      scout.send("/api/checkins", "POST", input, 400);
      assertTrue(scout.list("/api/checkins").isEmpty());
      var privateMedia = scout.send("/api/media", "POST", obj("photo", photo(app)), 201);
      input.put("mediaId", privateMedia.get("id"));
      var checkin = scout.send("/api/checkins", "POST", input, 201);
      assertEquals(checkin.get("id"), scout.send("/api/checkins", "POST", input, 200).get("id"));
      var works = rows(scout.get("/api/my/works").get("items"));
      assertEquals(1, works.size());
      assertEquals("pending", works.getFirst().get("status"));
      admin.send(
          "/api/admin/works/" + works.getFirst().get("id"),
          "PATCH",
          obj("status", "approved", "revision", works.getFirst().get("revision")),
          200);
      scout.send(
          "/api/works/" + works.getFirst().get("id") + "/reports",
          "POST",
          obj("description", "隔离测试作品删除时举报结束通知"),
          201);
      scout.request("/api/checkins/" + checkin.get("id"), "DELETE", null, 200);
      assertEquals(5, integer(scout.get("/api/notifications/summary").get("unread")));
      assertTrue(rows(app.user().get("/api/works?pointId=" + pid).get("items")).isEmpty());
    }
  }
}
