package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.auth.AvatarPresets;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ConsoleContractTest {
  @TempDir Path temporary;

  @Test
  void bundledAvatarsAreValidatedOwnedPersistentAndReplaceUploadedPhotos() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var user = app.user();
      var device = app.user();
      var other = app.user();
      var admin = app.admin();
      var guest = app.user();
      var account = user.register("preset_alice", "");
      device.login("preset_alice");
      other.register("preset_bob", "");
      admin.login("admin");
      guest.send("/api/auth/profile", "PATCH", obj("avatarPreset", "cat"), 401);
      for (Object invalid : List.of("../../secret", "https://example.com/a.svg", 123, "", "CAT"))
        user.send("/api/auth/profile", "PATCH", obj("avatarPreset", invalid), 400);
      user.send("/api/auth/profile", "PATCH", obj("avatarPreset", "cat", "avatar", null), 400);
      String jpg =
          "data:image/jpeg;base64,"
              + Base64.getEncoder()
                  .encodeToString(
                      Files.readAllBytes(app.root.resolve("dist/shared/nmu-library.jpg")));
      app.advance(61000);
      user.send("/api/auth/profile", "PATCH", obj("avatar", jpg), 200);
      Path photo = temporary.resolve("data/avatars/user-" + account.get("id") + ".jpg");
      assertTrue(Files.isRegularFile(photo));
      for (String id : AvatarPresets.IDS) {
        app.advance(61000);
        var saved =
            map(
                user.send("/api/auth/profile", "PATCH", obj("avatarPreset", id), 200)
                    .get("account"));
        assertEquals(id, saved.get("avatarPreset"));
        assertFalse(yes(saved.get("hasAvatar")));
        assertEquals(id, map(device.get("/api/auth/me").get("account")).get("avatarPreset"));
        assertTrue(Files.isRegularFile(app.root.resolve("dist/shared/avatars/" + id + ".svg")));
      }
      assertFalse(Files.exists(photo));
      user.request("/api/auth/avatar", "GET", null, 404);
      assertNull(map(other.get("/api/auth/me").get("account")).get("avatarPreset"));
      admin.send("/api/auth/profile", "PATCH", obj("avatarPreset", "anime-blue"), 200);
      app.restart();
      assertEquals("anime-blue", map(admin.get("/api/auth/me").get("account")).get("avatarPreset"));
      assertNotNull(map(device.get("/api/auth/me").get("account")).get("avatarPreset"));
      app.advance(61000);
      user.send("/api/auth/profile", "PATCH", obj("avatar", jpg), 200);
      assertNull(map(device.get("/api/auth/me").get("account")).get("avatarPreset"));
      user.request("/api/auth/avatar", "GET", null, 200);
      user.send("/api/auth/profile", "PATCH", obj("avatar", null), 200);
      assertNull(map(device.get("/api/auth/me").get("account")).get("avatarPreset"));
    }
  }

  @Test
  void recordsSearchPaginatesRedactedViewsAndValidatesFilters() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var root = app.admin();
      root.login("admin");
      var normal = app.admin();
      root.send(
          "/api/admin/admins",
          "POST",
          obj(
              "username",
              "records_normal",
              "name",
              "普通管理员",
              "password",
              ApiFixture.PASSWORD,
              "role",
              "normal"),
          201);
      normal.login("records_normal");
      var user = app.user();
      user.register("record_user", "");
      user.request("/api/admin/records", "GET", null, 404);
      app.admin().request("/api/admin/records", "GET", null, 401);
      app.close();
      var data = app.data();
      var events = new ArrayList<Map<String, Object>>();
      for (int i = 0; i < 63; i++)
        events.add(
            obj(
                "id",
                "event-" + i,
                "at",
                "2026-10-12T04:00:00Z",
                "action",
                "维护点位",
                "actor",
                "editor",
                "actorName",
                "维护者",
                "actorRole",
                "normal",
                "subject",
                "point-" + i,
                "detail",
                "测试编辑",
                "ip",
                "127.0.0.1"));
      events.add(
          obj(
              "id",
              "secret-heat",
              "at",
              "2026-10-12T04:00:00Z",
              "action",
              "调整机位热度",
              "detail",
              "HIDDEN-HEAT-987654",
              "actorRole",
              "super"));
      events.add(
          obj(
              "id",
              "secret-sdk",
              "at",
              "2026-10-12T04:00:00Z",
              "action",
              "地图服务配置",
              "subject",
              "map",
              "detail",
              "HIDDEN-SDK-765432 · 验证者 ID verifier",
              "actorRole",
              "super"));
      events.add(
          obj(
              "id",
              "deletion",
              "at",
              "2026-10-11T16:01:00Z",
              "action",
              "永久删除内容",
              "actor",
              "root",
              "actorRole",
              "super",
              "subject",
              "offlined-point"));
      data.put("audit", events);
      data.put(
          "logs",
          List.of(
              obj(
                  "id",
                  "plan-1",
                  "at",
                  "2026-10-12T05:00:00Z",
                  "route",
                  "湖畔路线",
                  "status",
                  "校验通过",
                  "total",
                  20,
                  "budget",
                  30,
                  "version",
                  2,
                  "track",
                  "PRIVATE-TRACK")));
      Files.writeString(temporary.resolve("data/store-v2.json"), write(data));
      app.start();
      var first = root.get("/api/admin/records?category=content&limit=20&q=editor");
      assertEquals(63, integer(first.get("total")));
      assertEquals(20, rows(first.get("events")).size());
      var second =
          root.get(
              "/api/admin/records?category=content&limit=20&q=editor&before="
                  + first.get("nextBefore"));
      assertEquals("event-43", rows(first.get("events")).getLast().get("id"));
      assertEquals("event-42", rows(second.get("events")).getFirst().get("id"));
      assertEquals(
          1,
          rows(root.get("/api/admin/records?category=deletion&from=2026-10-12&to=2026-10-12")
                  .get("events"))
              .size());
      assertEquals(
          0,
          rows(root.get("/api/admin/records?category=deletion&to=2026-10-11").get("events"))
              .size());
      assertEquals(1, rows(root.get("/api/admin/audit?deletions=true").get("events")).size());
      assertEquals(1, rows(root.get("/api/admin/records?q=HIDDEN-HEAT").get("events")).size());
      assertEquals(0, rows(normal.get("/api/admin/records?q=HIDDEN-HEAT").get("events")).size());
      assertEquals(0, rows(root.get("/api/admin/records?q=HIDDEN-SDK").get("events")).size());
      assertFalse(write(normal.get("/api/admin/records")).contains("HIDDEN-HEAT"));
      var planning =
          root.get(
              "/api/admin/records?kind=planning&q="
                  + java.net.URLEncoder.encode("湖畔", java.nio.charset.StandardCharsets.UTF_8));
      assertEquals(1, rows(planning.get("events")).size());
      assertFalse(write(planning).contains("PRIVATE-TRACK"));
      for (String query :
          List.of(
              "kind=wrong",
              "role=root",
              "category=bad",
              "from=2026-13-01",
              "from=2026-10-12&to=2026-10-11",
              "before=bad",
              "q=" + "x".repeat(101)))
        root.request("/api/admin/records?" + query, "GET", null, 400);
    }
  }
}
