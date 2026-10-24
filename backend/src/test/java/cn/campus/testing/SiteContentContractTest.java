package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.content.SiteContentService;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SiteContentContractTest {
  @TempDir Path temporary;

  @Test
  void helpCopyLinksAndLegacyDocumentsKeepPublishedBoundaries() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin(); admin.login("admin");
      var guest = app.user();
      var content = SiteContentService.defaults();
      content.put("helpTitle", "校园帮助 <b>纯文本</b>");
      content.put("helpSubtitle", "属于我们的校园");
      content.put("aboutTitle", "认识景遇");
      content.put("helpLinks", List.of(obj("label", "拍摄指南", "href", "#guides"), obj("label", "更多资料", "href", "https://example.com/help")));
      admin.send("/api/admin/site-content", "PUT", obj("revision", 0, "action", "draft", "content", content), 200);
      assertNotEquals(content.get("helpTitle"), guest.get("/api/site-content").get("helpTitle"));
      admin.send("/api/admin/site-content", "PUT", obj("revision", 1, "action", "publish", "content", content), 200);
      assertEquals(content, guest.get("/api/site-content"));
      assertEquals(content, guest.get("/api/mini/site-content"));
      for (String unsafe : List.of("javascript:alert(1)", "http://example.com", "https://user:password@example.com")) {
        var invalid = cn.campus.common.Json.clone(content);
        invalid.put("helpLinks", List.of(obj("label", "链接", "href", unsafe)));
        admin.send("/api/admin/site-content", "PUT", obj("revision", 2, "action", "publish", "content", invalid), 400);
      }
      var legacy = cn.campus.common.Json.clone(content);
      for (String key : List.of("helpTitle", "helpSubtitle", "aboutTitle", "helpSectionTitle", "shootingGuideTitle", "helpLinks")) legacy.remove(key);
      legacy.put("about", "旧版正文继续保留");
      admin.send("/api/admin/site-content", "PUT", obj("revision", 2, "action", "publish", "content", legacy), 200);
      var upgraded = guest.get("/api/site-content");
      assertEquals("旧版正文继续保留", upgraded.get("about"));
      assertEquals(SiteContentService.defaults().get("helpTitle"), upgraded.get("helpTitle"));
      app.restart();
      assertEquals(upgraded, guest.get("/api/site-content"));
    }
  }

  @Test
  void rolesPriorityCooldownAndAdministratorPermissionsAreEnforced() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin();
      var ordinary = app.user();
      var scout = app.user();
      var guest = app.user();
      ordinary.register("role_ordinary", "");
      var scoutAccount = scout.register("role_scout", "");
      admin.login("admin");
      admin.send(
          "/api/admin/users/" + scoutAccount.get("id"),
          "PATCH",
          obj("scoutStatus", "approved"),
          200);
      scout.login("role_scout");
      admin.send(
          "/api/admin/admins",
          "POST",
          obj(
              "username",
              "copy_editor",
              "name",
              "文案管理员",
              "role",
              "normal",
              "password",
              ApiFixture.PASSWORD),
          201);
      var editor = app.admin();
      editor.login("copy_editor");
      editor.send(
          "/api/admin/site-content",
          "PUT",
          obj("revision", 0, "action", "draft", "content", SiteContentService.defaults()),
          200);
      editor.send(
          "/api/admin/site-content",
          "PUT",
          obj("revision", 1, "action", "publish", "content", SiteContentService.defaults()),
          403);
      String visitor = UUID.randomUUID().toString(), visit = UUID.randomUUID().toString();
      for (String audience : List.of("ordinary", "scouts", "members", "all")) {
        var content = announcement(audience, List.of());
        var row =
            editor.send(
                "/api/admin/announcements",
                "POST",
                obj("revision", 0, "action", "publish", "content", content),
                200);
        String id = str(row.get("id"));
        assertEquals(
            !audience.equals("scouts"),
            ordinary.get("/api/announcements" + query("web", visitor, visit)).get("announcement")
                != null);
        assertEquals(
            !audience.equals("ordinary"),
            scout.get("/api/announcements" + query("web", visitor, visit)).get("announcement")
                != null);
        assertEquals(
            audience.equals("all"),
            guest.get("/api/announcements" + query("web", visitor, visit)).get("announcement")
                != null);
        editor.send(
            "/api/admin/announcements/" + id,
            "PUT",
            obj("revision", 1, "action", "unpublish", "content", content),
            200);
      }
      var low = announcement("all", List.of());
      low.put("maxDaily", 0);
      low.put("maxTotal", 0);
      low.put("intervalMinutes", 60);
      var high = cn.campus.common.Json.clone(low);
      high.put("priority", 200);
      editor.send(
          "/api/admin/announcements",
          "POST",
          obj("revision", 0, "action", "publish", "content", low),
          200);
      var chosen =
          editor.send(
              "/api/admin/announcements",
              "POST",
              obj("revision", 0, "action", "publish", "content", high),
              200);
      String highId = str(chosen.get("id"));
      assertEquals(
          highId,
          map(guest.get("/api/announcements" + query("web", visitor, visit)).get("announcement"))
              .get("id"));
      guest.send(
          "/api/announcements/" + highId + "/impressions",
          "POST",
          claim("web", visitor, visit, 1),
          200);
      assertNotEquals(
          highId,
          map(guest
                  .get("/api/announcements" + query("web", visitor, UUID.randomUUID().toString()))
                  .get("announcement"))
              .get("id"));
      app.advance(3600001);
      assertEquals(
          highId,
          map(guest
                  .get("/api/announcements" + query("web", visitor, UUID.randomUUID().toString()))
                  .get("announcement"))
              .get("id"));
    }
  }

  @Test
  void publishedCopyIsIndependentFromDraftAndRevisionProtectsEditors() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin();
      var user = app.user();
      var guest = app.user();
      user.register("copy_reader", "");
      admin.login("admin");
      guest.request("/api/admin/site-content", "GET", null, 404);
      var initial = user.get("/api/site-content");
      var value = SiteContentService.defaults();
      value.put("notice", "这是草稿 <b>纯文本</b>");
      admin.send(
          "/api/admin/site-content",
          "PUT",
          obj("revision", 0, "action", "draft", "content", value),
          200);
      assertEquals(initial, user.get("/api/site-content"));
      admin.send(
          "/api/admin/site-content",
          "PUT",
          obj("revision", 0, "action", "publish", "content", value),
          409);
      admin.send(
          "/api/admin/site-content",
          "PUT",
          obj("revision", 1, "action", "publish", "content", value),
          200);
      assertEquals(value, user.get("/api/site-content"));
      assertEquals(value, guest.get("/api/mini/site-content"));
      var invalid = cn.campus.common.Json.clone(value);
      invalid.put("adminPassword", "not-allowed");
      admin.send(
          "/api/admin/site-content",
          "PUT",
          obj("revision", 2, "action", "publish", "content", invalid),
          400);
      var malformed = cn.campus.common.Json.clone(value);
      malformed.put("categories", List.of("invalid", "invalid", "invalid", "invalid"));
      admin.send(
          "/api/admin/site-content",
          "PUT",
          obj("revision", 2, "action", "publish", "content", malformed),
          400);
      app.restart();
      assertEquals(value, user.get("/api/site-content"));
      admin.send(
          "/api/admin/site-content",
          "PUT",
          obj("revision", 2, "action", "unpublish", "content", value),
          200);
      assertEquals(initial, user.get("/api/site-content"));
      var runtime = user.get("/api/runtime");
      assertEquals("test", runtime.get("name"));
      assertFalse(write(runtime).contains(temporary.toString()));
    }
  }

  static Map<String, Object> announcement(String audience, List<Object> users) {
    return obj(
        "title",
        "测试开屏公告",
        "body",
        "长正文\n仅按指定范围展示。",
        "channels",
        List.of("web", "mini"),
        "pages",
        List.of("shots"),
        "audience",
        audience,
        "userIds",
        users,
        "startsAt",
        "",
        "endsAt",
        "",
        "maxTotal",
        2,
        "maxDaily",
        1,
        "intervalMinutes",
        0,
        "priority",
        100);
  }

  static String query(String channel, String visitor, String visit) {
    return "?channel=" + channel + "&page=shots&visitorId=" + visitor + "&visitId=" + visit;
  }

  static Map<String, Object> claim(String channel, String visitor, String visit, long revision) {
    return obj(
        "channel",
        channel,
        "page",
        "shots",
        "visitorId",
        visitor,
        "visitId",
        visit,
        "requestId",
        UUID.randomUUID().toString(),
        "revision",
        revision);
  }

  @Test
  void targetedImpressionsAreAtomicIdempotentDailyBoundedAndPersistent() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin();
      var alice = app.user();
      var bob = app.user();
      var guest = app.user();
      var account = alice.register("notice_alice", "");
      bob.register("notice_bob", "");
      admin.login("admin");
      var content = announcement("selected", List.of(account.get("id")));
      var created =
          admin.send(
              "/api/admin/announcements",
              "POST",
              obj("revision", 0, "action", "publish", "content", content),
              200);
      String id = str(created.get("id")),
          visitor = UUID.randomUUID().toString(),
          visit = UUID.randomUUID().toString();
      assertNull(bob.get("/api/announcements" + query("web", visitor, visit)).get("announcement"));
      assertNull(
          guest.get("/api/announcements" + query("web", visitor, visit)).get("announcement"));
      var selected = alice.get("/api/announcements" + query("web", visitor, visit));
      assertNotNull(selected.get("announcement"));
      assertFalse(write(selected).contains(str(account.get("id"))));
      assertFalse(write(selected).contains("userIds"));
      var body = claim("web", visitor, visit, 1);
      assertTrue(
          yes(
              alice
                  .send("/api/announcements/" + id + "/impressions", "POST", body, 200)
                  .get("show")));
      assertTrue(
          yes(
              alice
                  .send("/api/announcements/" + id + "/impressions", "POST", body, 200)
                  .get("show")));
      assertFalse(
          yes(
              alice
                  .send(
                      "/api/announcements/" + id + "/impressions",
                      "POST",
                      claim("web", visitor, visit, 1),
                      200)
                  .get("show")));
      assertEquals(
          1, integer(rows(app.data().get("announcementReceipts")).getFirst().get("total")));
      assertNull(
          alice
              .get("/api/announcements" + query("web", visitor, UUID.randomUUID().toString()))
              .get("announcement"));
      app.advance(86400000);
      app.restart();
      try (var pool = Executors.newFixedThreadPool(2)) {
        var first =
            pool.submit(
                () ->
                    alice.send(
                        "/api/announcements/" + id + "/impressions",
                        "POST",
                        claim("web", visitor, UUID.randomUUID().toString(), 1),
                        200));
        var second =
            pool.submit(
                () ->
                    alice.send(
                        "/api/announcements/" + id + "/impressions",
                        "POST",
                        claim("web", visitor, UUID.randomUUID().toString(), 1),
                        200));
        assertEquals(
            1, (yes(first.get().get("show")) ? 1 : 0) + (yes(second.get().get("show")) ? 1 : 0));
      }
      app.advance(86400000);
      assertNull(
          alice
              .get("/api/announcements" + query("web", visitor, UUID.randomUUID().toString()))
              .get("announcement"));
      admin.send(
          "/api/admin/announcements/" + id,
          "PUT",
          obj("revision", 1, "action", "unpublish", "content", content),
          200);
      admin.send(
          "/api/admin/announcements/" + id,
          "PUT",
          obj("revision", 1, "action", "publish", "content", content),
          409);
      assertFalse(
          yes(
              alice
                  .send(
                      "/api/announcements/" + id + "/impressions",
                      "POST",
                      claim("web", visitor, UUID.randomUUID().toString(), 2),
                      200)
                  .get("show")));
    }
  }

  @Test
  void guestClientPageScheduleAndPriorityAreValidatedWithoutLeakingRecipients() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin();
      var guest = app.user();
      admin.login("admin");
      var c = announcement("guest", List.of());
      c.put("channels", List.of("mini"));
      c.put("startsAt", Instant.now().plusSeconds(600).toString());
      c.put("endsAt", Instant.now().plusSeconds(1200).toString());
      var created =
          admin.send(
              "/api/admin/announcements",
              "POST",
              obj("revision", 0, "action", "publish", "content", c),
              200);
      String id = str(created.get("id")),
          visitor = UUID.randomUUID().toString(),
          visit = UUID.randomUUID().toString();
      assertNull(
          guest.get("/api/mini/announcements" + query("mini", visitor, visit)).get("announcement"));
      app.advance(660000);
      assertNotNull(
          guest.get("/api/mini/announcements" + query("mini", visitor, visit)).get("announcement"));
      assertNull(
          guest.get("/api/announcements" + query("web", visitor, visit)).get("announcement"));
      guest.request("/api/announcements" + query("mini", visitor, visit), "GET", null, 400);
      guest.request(
          "/api/mini/announcements"
              + query("mini", visitor, visit).replace("page=shots", "page=me"),
          "GET",
          null,
          200);
      assertNull(
          guest
              .get(
                  "/api/mini/announcements"
                      + query("mini", visitor, visit).replace("page=shots", "page=me"))
              .get("announcement"));
      assertTrue(
          yes(
              guest
                  .send(
                      "/api/mini/announcements/" + id + "/impressions",
                      "POST",
                      claim("mini", visitor, visit, 1),
                      200)
                  .get("show")));
      var invalid = cn.campus.common.Json.clone(c);
      invalid.put("endsAt", invalid.get("startsAt"));
      admin.send(
          "/api/admin/announcements/" + id,
          "PUT",
          obj("revision", 1, "action", "publish", "content", invalid),
          400);
      app.advance(600000);
      assertNull(
          guest
              .get("/api/mini/announcements" + query("mini", visitor, UUID.randomUUID().toString()))
              .get("announcement"));
    }
  }
}
