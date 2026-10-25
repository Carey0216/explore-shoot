package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.admin.PublishingPreflightService;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PhotoWorkspaceContractTest {
  @TempDir Path temporary;

  @Test
  void albumsAreExplicitPrivateRevisionCheckedAndSharedWithNative() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var user = app.user();
      user.register("album_owner", "");
      var other = app.user();
      other.register("album_other", "");
      String photo =
          "data:image/jpeg;base64,"
              + Base64.getEncoder()
                  .encodeToString(
                      Files.readAllBytes(app.root.resolve("dist/shared/nmu-library.jpg")));
      var upload = user.send("/api/media", "POST", obj("photo", photo), 201);
      String media = str(upload.get("id"));
      assertTrue(rows(user.get("/api/my/memories").get("items")).isEmpty());
      assertEquals(1, rows(user.get("/api/my/memories/candidates").get("items")).size());
      assertTrue(rows(other.get("/api/my/memories/candidates").get("items")).isEmpty());
      var body =
          obj(
              "title",
              "一学期的校园",
              "theme",
              "semester",
              "message",
              "主动选择的校园回忆",
              "items",
              List.of(obj("mediaId", media, "caption", "晚风与图书馆")));
      other.send("/api/my/memories", "POST", body, 403);
      var album = user.send("/api/my/memories", "POST", body, 201);
      String id = str(album.get("id"));
      assertFalse(album.containsKey("ownerId"));
      assertFalse(write(album).contains("location"));
      other.request("/api/my/memories/" + id, "GET", null, 404);
      body.put("revision", 0);
      user.send("/api/my/memories/" + id, "PUT", body, 409);
      body.put("revision", album.get("revision"));
      user.send("/api/my/memories/" + id, "PUT", body, 200);
      var nativeLogin =
          user.send(
              "/api/mini/auth/login",
              "POST",
              obj("username", "album_owner", "password", ApiFixture.PASSWORD),
              200);
      var bearer = Map.of("Authorization", "Bearer " + nativeLogin.get("token"));
      var nativeAlbum = map(user.request("/api/mini/my/memories/" + id, "GET", null, 200, bearer));
      assertEquals(2, integer(nativeAlbum.get("revision")));
      user.request("/api/mini/my/memories/" + id, "DELETE", obj("revision", 2), 200, bearer);
      user.request("/media/" + media, "GET", null, 200);
    }
  }

  @Test
  void preflightPermissionsManualEnglishWeatherRevisionAndMaintenanceAreEnforced()
      throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var ordinary = app.admin();
      ordinary.login("admin");
      ordinary.request("/api/admin/weather", "GET", null, 403);
      var initial = ordinary.get("/api/admin/preflight");
      assertFalse(rows(initial.get("resources")).isEmpty());
      assertFalse(write(initial).contains("viewCount"));
      assertFalse(write(initial).contains("popularity"));
      var point =
          rows(initial.get("resources")).stream()
              .filter(r -> eq(r.get("type"), "points") && yes(r.get("published")))
              .findFirst()
              .orElseThrow();
      var copy =
          obj(
              "type",
              "points",
              "id",
              point.get("id"),
              "revision",
              point.get("revision"),
              "title",
              "A campus corner",
              "body",
              "A place to slow down and look around.");
      ordinary.send("/api/admin/preflight/english", "PUT", copy, 200);
      ordinary.send("/api/admin/preflight/english", "PUT", copy, 409);
      var guest = app.user();
      assertEquals(
          "A campus corner",
          map(guest.get("/api/localization/editorial").get("entries"))
              .get(str(point.get("title"))));
      guest.request("/api/admin/preflight", "GET", null, 404);
      app.promoteFixtureOwner();
      var owner = app.admin();
      owner.login("admin");
      var config = owner.get("/api/admin/weather");
      config.remove("provider");
      owner.send("/api/admin/weather", "PUT", config, 200);
      owner.send("/api/admin/weather", "PUT", config, 409);
      var flags = owner.get("/api/admin/features");
      map(flags.get("features")).put("weather", obj("visible", true, "enabled", false));
      owner.send("/api/admin/features", "PUT", flags, 200);
      guest.request("/api/weather", "GET", null, 403);
      guest.request("/api/mini/weather", "GET", null, 403);
      for (String link :
          List.of(
              "http://example.org",
              "https://127.0.0.1/",
              "https://169.254.169.254/latest/meta-data/",
              "https://[::1]/"))
        assertEquals("blocked", PublishingPreflightService.checkLink(link).get("state"));
    }
  }
}
