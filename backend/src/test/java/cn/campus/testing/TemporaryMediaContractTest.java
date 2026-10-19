package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class TemporaryMediaContractTest {
  @TempDir Path temporary;

  @Test
  void temporaryUploadsAreOwnedExpireAndCannotDeleteAttachedPublicOrPrivatePhotos()
      throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var root = app.admin();
      root.login("admin");
      var alice = app.user();
      alice.register("media622_alice", "");
      var application = alice.send("/api/scout/apply", "POST", obj("reason", "我想分享真实校园资料"), 201);
      root.send(
          "/api/admin/applications/" + application.get("id"),
          "PATCH",
          obj("status", "approved"),
          200);
      var bob = app.user();
      bob.register("media622_bob", "");
      var guest = app.user();
      String bytes =
          "data:image/jpeg;base64,"
              + Base64.getEncoder()
                  .encodeToString(
                      Files.readAllBytes(app.root.resolve("dist/shared/nmu-library.jpg")));
      var abandoned = alice.send("/api/media", "POST", obj("photo", bytes), 201);
      String path = "/api/media/" + abandoned.get("id");
      assertNotNull(abandoned.get("expiresAt"));
      guest.request(path, "GET", null, 401);
      guest.request(path, "DELETE", null, 401);
      bob.request(path, "GET", null, 404);
      bob.request(path, "DELETE", null, 404);
      alice.request(path, "DELETE", null, 403, Map.of("Origin", "https://evil.example"));
      assertFalse(yes(alice.get(path).get("attached")));
      alice.request(abandoned.get("url").toString(), "GET", null, 200);
      alice.send(path, "DELETE", obj(), 200);
      assertFalse(Files.exists(temporary.resolve("data/media/" + abandoned.get("id") + ".jpg")));
      alice.request(path, "GET", null, 404);
      var points = rows(alice.get("/api/catalog").get("points"));
      var p = points.getFirst();
      var personal = alice.send("/api/media", "POST", obj("photo", bytes), 201);
      alice.send(
          "/api/checkins",
          "POST",
          obj(
              "pointId",
              p.get("id"),
              "submissionId",
              UUID.randomUUID().toString(),
              "mediaId",
              personal.get("id"),
              "templateId",
              "",
              "note",
              "私人打卡"),
          201);
      alice.request("/api/media/" + personal.get("id"), "DELETE", null, 409);
      assertTrue(yes(alice.get("/api/media/" + personal.get("id")).get("attached")));
      var publicPhoto = alice.send("/api/media", "POST", obj("photo", bytes), 201);
      var publication =
          obj(
              "name",
              "媒体生命周期验证",
              "description",
              "使用测试照片验证未提交回收",
              "condition",
              "公共区域测试",
              "theme",
              "建筑",
              "lng",
              p.get("lng"),
              "lat",
              p.get("lat"),
              "mediaId",
              publicPhoto.get("id"),
              "submissionId",
              UUID.randomUUID().toString());
      alice.send("/api/points", "POST", publication, 201);
      alice.request("/api/media/" + publicPhoto.get("id"), "DELETE", null, 409);
      var expires = alice.send("/api/media", "POST", obj("photo", bytes), 201);
      app.advance(23 * 60 * 60 * 1000L);
      alice.get("/api/media/" + expires.get("id"));
      app.advance(2 * 60 * 60 * 1000L);
      alice.request("/api/media/" + expires.get("id"), "GET", null, 410);
      alice.request("/media/" + expires.get("id"), "GET", null, 404);
      alice.send(
          "/api/checkins",
          "POST",
          obj(
              "pointId",
              p.get("id"),
              "submissionId",
              UUID.randomUUID().toString(),
              "mediaId",
              expires.get("id"),
              "note",
              "过期照片"),
          410);
      publication.put("submissionId", UUID.randomUUID().toString());
      publication.put("mediaId", expires.get("id"));
      alice.send("/api/points", "POST", publication, 410);
      assertNull(alice.get("/api/media/" + personal.get("id")).get("expiresAt"));
      guest.request("/media/" + personal.get("id"), "GET", null, 404);
      alice.request("/media/" + personal.get("id"), "GET", null, 200);
      guest.request("/media/" + publicPhoto.get("id"), "GET", null, 200);
    }
  }
}
