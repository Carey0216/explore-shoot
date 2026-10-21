package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ReleaseUpdatesContractTest {
  @TempDir Path temp;

  @Test
  void generatedDraftRequiresOwnerReviewAndDeliversOncePerVersion() throws Exception {
    try (var app = new ApiFixture(temp)) {
      var admin = app.admin();
      admin.login("admin");
      var user = app.user();
      user.register("release_reader", "");
      var guest = app.user();
      assertTrue(rows(guest.get("/api/updates").get("items")).isEmpty());
      assertTrue(rows(admin.get("/api/admin/updates").get("pending")).isEmpty());
      String version = str(admin.get("/api/admin/updates").get("version"));
      var row =
          rows(app.data().get("announcements")).stream()
              .filter(r -> eq(r.get("releaseVersion"), version))
              .findFirst()
              .orElseThrow();
      String id = str(row.get("id"));
      var draft = map(row.get("draft"));
      String adminCopy = "管理端说明：审核前核对权限与变更。";
      assertFalse(yes(admin.get("/api/admin/updates").get("published")));
      assertFalse(str(admin.get("/api/admin/updates").get("body")).contains(adminCopy));
      assertTrue(rows(admin.get("/api/admin/announcements").get("items")).isEmpty());
      admin.send(
          "/api/admin/announcements/" + id,
          "PUT",
          obj("revision", 1, "action", "publish", "content", draft, "adminBody", adminCopy),
          403);
      app.promoteFixtureOwner();
      admin.login("admin");
      user.login("release_reader");
      assertEquals(1, rows(admin.get("/api/admin/updates").get("pending")).size());
      assertEquals(
          1,
          rows(app.data().get("announcements")).size(),
          "Restart must not create another release draft");
      draft.put("body", "已检查：新生指南、拍摄计划与深色模式。文字允许修改，草稿不会发送。");
      admin.send(
          "/api/admin/announcements/" + id,
          "PUT",
          obj("revision", 1, "action", "draft", "content", draft, "adminBody", adminCopy),
          200);
      assertTrue(rows(guest.get("/api/updates").get("items")).isEmpty());
      assertTrue(
          rows(user.get("/api/notifications").get("items")).stream()
              .noneMatch(n -> eq(n.get("event"), "release:" + version)));
      admin.send(
          "/api/admin/announcements/" + id,
          "PUT",
          obj("revision", 1, "action", "publish", "content", draft, "adminBody", adminCopy),
          409);
      admin.send(
          "/api/admin/announcements/" + id,
          "PUT",
          obj("revision", 2, "action", "publish", "content", draft),
          400);
      assertFalse(yes(admin.get("/api/admin/updates").get("published")));
      var bad = copy(draft);
      bad.put("delivery", java.util.List.of("popup"));
      admin.send(
          "/api/admin/announcements/" + id,
          "PUT",
          obj("revision", 2, "action", "publish", "content", bad, "adminBody", adminCopy),
          400);
      admin.send(
          "/api/admin/announcements/" + id,
          "PUT",
          obj("revision", 2, "action", "publish", "content", draft, "adminBody", adminCopy),
          200);
      assertEquals(
          draft.get("body"), rows(guest.get("/api/updates").get("items")).getFirst().get("body"));
      assertTrue(rows(admin.get("/api/admin/updates").get("pending")).isEmpty());
      assertTrue(yes(admin.get("/api/admin/updates").get("published")));
      assertEquals(adminCopy, admin.get("/api/admin/updates").get("body"));
      assertFalse(str(guest.get("/api/updates")).contains(adminCopy));
      user.get("/api/notifications");
      user.get("/api/notifications/summary");
      long count =
          rows(app.data().get("notifications")).stream()
              .filter(n -> eq(n.get("event"), "release:" + version))
              .count();
      assertEquals(1, count);
      admin.send(
          "/api/admin/announcements/" + id,
          "PUT",
          obj("revision", 3, "action", "publish", "content", draft, "adminBody", adminCopy),
          200);
      user.get("/api/notifications");
      assertEquals(
          1,
          rows(app.data().get("notifications")).stream()
              .filter(n -> eq(n.get("event"), "release:" + version))
              .count());
      admin.send(
          "/api/admin/announcements/" + id,
          "PUT",
          obj("revision", 4, "action", "unpublish", "content", draft, "adminBody", adminCopy),
          200);
      assertTrue(rows(guest.get("/api/updates").get("items")).isEmpty());
      assertFalse(yes(admin.get("/api/admin/updates").get("published")));
    }
  }
}
