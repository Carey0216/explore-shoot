package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Release711ContractTest {
  @TempDir Path temp;

  Map<String, Object> message(String text) {
    return obj(
        "body",
        text,
        "submissionId",
        UUID.randomUUID().toString(),
        "imageId",
        "",
        "links",
        List.of());
  }

  @Test
  void requestsDoNotCreateThreadsAndPrivateMessagesAreParticipantBound() throws Exception {
    try (var app = new ApiFixture(temp)) {
      app.promoteFixtureOwner();
      var admin = app.admin();
      admin.login("admin");
      var alice = app.user();
      var a = alice.register("contact_alice", "");
      var bob = app.user();
      bob.register("contact_bob", "");
      alice.request("/api/conversations", "POST", message("不允许自己发起"), 403);
      var r = alice.send("/api/contact-requests", "POST", obj("body", "希望了解校园路线的维护情况"), 201);
      assertEquals(0, rows(alice.get("/api/conversations").get("items")).size());
      assertTrue(integer(admin.get("/api/admin/inbox/summary").get("unread")) > 0);
      var body = message("你好，已经为你建立联系");
      body.putAll(obj("userId", a.get("id"), "requestId", r.get("id")));
      var t = map(admin.send("/api/admin/conversations", "POST", body, 201).get("conversation"));
      assertEquals(
          t.get("id"),
          map(admin.send("/api/admin/conversations", "POST", body, 201).get("conversation"))
              .get("id"));
      String path = "/api/conversations/" + t.get("id");
      assertEquals(1, rows(alice.get(path).get("items")).size());
      bob.request(path, "GET", null, 404);
      alice.send(path + "/messages", "POST", message("谢谢，收到回复"), 201);
      assertEquals(
          2, rows(admin.get("/api/admin/conversations/" + t.get("id")).get("items")).size());
      admin.send("/api/admin/conversations/" + t.get("id") + "/read", "POST", obj(), 200);
      assertEquals(0, integer(admin.get("/api/admin/inbox/summary").get("unread")));
      var latest = message("可点击发布入口");
      latest.put("links", List.of(obj("label", "去发布", "href", "#publish")));
      var sent =
          admin.send("/api/admin/conversations/" + t.get("id") + "/messages", "POST", latest, 201);
      var retry =
          admin.send("/api/admin/conversations/" + t.get("id") + "/messages", "POST", latest, 201);
      assertEquals(sent.get("id"), retry.get("id"));
      assertFalse(sent.containsKey("userId"));
      assertEquals(2, rows(alice.get(path + "?before=" + sent.get("id")).get("items")).size());
      bob.request(path + "?before=" + sent.get("id"), "GET", null, 404);
      var notices = rows(alice.get("/api/notifications").get("items"));
      assertEquals(2, notices.size());
      var n = notices.getFirst();
      alice.get("/api/notifications/" + n.get("id"));
      bob.request("/api/notifications/" + n.get("id"), "GET", null, 404);
      var bad = message("禁止脚本链接");
      bad.put("links", List.of(obj("label", "点击", "href", "javascript:alert(1)")));
      admin.request("/api/admin/conversations/" + t.get("id") + "/messages", "POST", bad, 400);
      admin.send("/api/admin/conversations/" + t.get("id"), "PATCH", obj("open", false), 200);
      alice.request(path + "/messages", "POST", message("关闭后禁止回复"), 409);
      app.restart();
      alice.login("contact_alice");
      assertEquals(3, rows(alice.get(path).get("items")).size());
    }
  }

  @Test
  void targetedRichAnnouncementsHaveSeparatePopupAndInboxDeliveryAndPrivateImages()
      throws Exception {
    try (var app = new ApiFixture(temp)) {
      var admin = app.admin();
      admin.login("admin");
      var alice = app.user();
      var a = alice.register("notice_alice", "");
      var bob = app.user();
      bob.register("notice_bob", "");
      String photo =
          "data:image/jpeg;base64,"
              + Base64.getEncoder()
                  .encodeToString(
                      Files.readAllBytes(app.root.resolve("dist/shared/nmu-building.jpg")));
      var media = admin.send("/api/media", "POST", obj("photo", photo), 201);
      var content =
          obj(
              "title",
              "带图片的活动提醒",
              "body",
              "请从公共步道进入",
              "channels",
              List.of("web", "mini"),
              "pages",
              List.of(),
              "audience",
              "selected",
              "userIds",
              List.of(a.get("id")),
              "startsAt",
              "",
              "endsAt",
              "",
              "maxTotal",
              1,
              "maxDaily",
              1,
              "intervalMinutes",
              0,
              "priority",
              20,
              "imageId",
              media.get("id"),
              "links",
              List.of(obj("label", "看看活动", "href", "#topics")),
              "delivery",
              List.of("inbox"));
      admin.send(
          "/api/admin/announcements",
          "POST",
          obj("revision", 0, "action", "publish", "content", content),
          200);
      var notice = rows(alice.get("/api/notifications").get("items")).getFirst();
      assertEquals(1, rows(alice.get("/api/notifications").get("items")).size());
      assertEquals(0, rows(bob.get("/api/notifications").get("items")).size());
      assertEquals("#topics", map(list(notice.get("links")).getFirst()).get("href"));
      String image = str(notice.get("image"));
      assertTrue(image.startsWith("/api/messages/media/"));
      alice.request(image, "GET", null, 200);
      bob.request(image, "GET", null, 404);
      app.user().request(image, "GET", null, 404);
      String visit = UUID.randomUUID().toString();
      assertNull(
          alice
              .get(
                  "/api/announcements?channel=web&page=discover&visitorId="
                      + visit
                      + "&visitId="
                      + visit)
              .get("announcement"));
      assertFalse(write(bob.get("/api/notifications")).contains("请从公共步道"));
    }
  }

  @Test
  void nativeAdministratorUsesSeparateAudienceAndNeverBrowserCookies() throws Exception {
    try (var app = new ApiFixture(temp)) {
      var admin = app.admin();
      var login =
          admin.send(
              "/api/mini/admin/auth/login",
              "POST",
              obj("username", "admin", "password", ApiFixture.PASSWORD),
              200);
      String token = str(login.get("token"));
      assertTrue(token.matches("[a-f0-9]{64}"));
      assertEquals("", admin.cookie);
      var header = Map.of("Authorization", "Bearer " + token);
      assertEquals(
          "admin",
          map(admin.request("/api/mini/admin/auth/me", "GET", null, 200, header)).get("audience"));
      admin.request("/api/mini/admin/inbox", "GET", null, 200, header);
      admin.request("/api/admin/inbox", "GET", null, 401, header);
      app.user().request("/api/mini/admin/inbox", "GET", null, 404, header);
      admin.request(
          "/api/mini/admin/inbox",
          "GET",
          null,
          403,
          Map.of(
              "Authorization", "Bearer " + token, "Origin", "http://127.0.0.1:" + app.adminPort));
      admin.request("/api/mini/admin/map-config", "GET", null, 403, header);
    }
  }
}
