package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.checkin.PassportProgressService;
import java.io.ByteArrayInputStream;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PassportExpansionContractTest {
  @TempDir Path temp;

  private Map<String, Object> rule(Object point) {
    return obj(
        "title",
        "校园建筑集",
        "description",
        "记录校园建筑",
        "symbol",
        "building",
        "kind",
        "collection",
        "pointIds",
        List.of(point),
        "target",
        1,
        "published",
        true);
  }

  private Map<String, Object> spot(Map<String, Object> point) {
    return obj(
        "pointId",
        point.get("id"),
        "title",
        "实测公共步道",
        "standDescription",
        "站在东侧步道",
        "lng",
        point.get("lng"),
        "lat",
        point.get("lat"),
        "bearing",
        270,
        "bestTime",
        "日落后",
        "status",
        "published",
        "conditions",
        List.of("night", "solo"),
        "openingHours",
        "18:00—21:00",
        "availability",
        "limited",
        "accessNotice",
        "西侧入口施工，请走东侧入口");
  }

  private String photo(ApiFixture app) throws Exception {
    return "data:image/jpeg;base64,"
        + Base64.getEncoder()
            .encodeToString(Files.readAllBytes(app.root.resolve("dist/shared/nmu-library.jpg")));
  }

  @Test
  void superCreatesAllAdminsMaintainAndProgressIsOwnerOnlyRecomputedAcrossRestart()
      throws Exception {
    try (var app = new ApiFixture(temp)) {
      var admin = app.admin();
      admin.login("admin");
      admin.send(
          "/api/admin/admins",
          "POST",
          obj(
              "username",
              "passport_mod",
              "name",
              "护照维护员",
              "password",
              ApiFixture.PASSWORD,
              "role",
              "normal"),
          201);
      var mod = app.admin();
      mod.login("passport_mod");
      var a = app.user();
      a.register("passport_alice", "");
      var b = app.user();
      b.register("passport_bob", "");
      var guest = app.user();
      Object point = rows(guest.get("/api/catalog").get("points")).getFirst().get("id");
      guest.request("/api/my/passport", "GET", null, 401);
      a.request("/api/admin/passport", "GET", null, 404);
      mod.send("/api/admin/passport/themes", "POST", rule(point), 403);
      var r = admin.send("/api/admin/passport/themes", "POST", rule(point), 201);
      var edited = rule(point);
      edited.putAll(obj("revision", 1, "title", "校园建筑集 · 更新"));
      mod.send("/api/admin/passport/themes/" + r.get("id"), "PATCH", edited, 200);
      mod.send("/api/admin/passport/themes/" + r.get("id"), "PATCH", edited, 409);
      var atlas = map(a.get("/api/my/passport").get("atlas"));
      var buildings = rows(atlas.get("buildings"));
      assertEquals(80, buildings.stream().filter(x -> eq(x.get("frame"), "photo")).count());
      assertEquals(65, buildings.stream().filter(x -> eq(x.get("frame"), "plan")).count());
      var building = buildings.getFirst();
      mod.send(
          "/api/admin/passport/buildings",
          "PUT",
          obj("id", building.get("id"), "name", "测试楼宇", "pointIds", List.of(point), "revision", 0),
          200);
      mod.send(
          "/api/admin/passport/buildings",
          "PUT",
          obj("id", building.get("id"), "name", "陈旧编辑", "pointIds", List.of(point), "revision", 0),
          409);
      var check =
          a.send(
              "/api/checkins",
              "POST",
              obj(
                  "pointId",
                  point,
                  "submissionId",
                  UUID.randomUUID().toString(),
                  "note",
                  "PRIVATE FOOTPRINT"),
              201);
      var delta = map(check.get("passportEvents"));
      assertNotNull(delta.get("atlas"));
      assertFalse(write(delta).contains("PRIVATE FOOTPRINT"));
      try (var files = Files.walk(temp)) {
        assertTrue(files.anyMatch(p -> p.toString().contains("passport-atlas") && p.toString().endsWith(".json")));
      }
      var progress = a.get("/api/my/passport");
      assertTrue(yes(rows(progress.get("achievements")).getFirst().get("earned")));
      assertFalse(write(progress).contains("PRIVATE FOOTPRINT"));
      assertTrue(
          yes(rows(map(progress.get("atlas")).get("buildings")).getFirst().get("collected")));
      assertFalse(
          yes(rows(b.get("/api/my/passport").get("achievements")).getFirst().get("earned")));
      assertTrue(
          yes(rows(a.get("/api/my/passport/scene").get("models")).getFirst().get("collected")));
      guest.request("/api/my/passport/scene", "GET", null, 401);
      app.restart();
      assertTrue(yes(rows(a.get("/api/my/passport").get("achievements")).getFirst().get("earned")));
      a.request("/api/checkins/" + check.get("id"), "DELETE", null, 200);
      assertFalse(
          yes(rows(a.get("/api/my/passport").get("achievements")).getFirst().get("earned")));
    }
  }

  @Test
  void nightUsesServerShanghaiTimeAndRequiresPhotoAndKnownCompletionTime() {
    var r = obj("id", "night", "kind", "night", "target", 1, "pointIds", List.of());
    assertTrue(
        yes(
            PassportProgressService.achievement(
                    r, List.of(obj("createdAt", "2026-10-15T10:00:00Z", "mediaId", "photo")))
                .get("earned")));
    for (var record :
        List.of(
            obj("createdAt", "2026-10-15T09:59:00Z", "mediaId", "photo"),
            obj("createdAt", "2026-10-15T22:00:00Z", "mediaId", "photo"),
            obj("createdAt", "2026-10-15T12:00:00Z"),
            obj("createdAt", "2026-10-15T12:00:00Z", "mediaId", "photo", "legacyTime", true)))
      assertFalse(yes(PassportProgressService.achievement(r, List.of(record)).get("earned")));
  }

  @Test
  void filtersOnlyPublishedRealSpotsAndThumbnailCannotBypassPhotoPermissions() throws Exception {
    try (var app = new ApiFixture(temp)) {
      var admin = app.admin();
      admin.login("admin");
      var guest = app.user();
      var a = app.user();
      a.register("condition_alice", "");
      var p = rows(guest.get("/api/catalog").get("points")).getFirst();
      var body = spot(p);
      var media = admin.send("/api/media", "POST", obj("photo", photo(app)), 201);
      body.put("exampleMediaId", media.get("id"));
      var s = admin.send("/api/admin/shooting-spots", "POST", body, 201);
      var result = guest.send("/api/points/search", "POST", obj("condition", "night"), 200);
      assertEquals(1, integer(result.get("total")));
      assertEquals(
          "西侧入口施工，请走东侧入口",
          rows(rows(result.get("points")).getFirst().get("matchingSpots"))
              .getFirst()
              .get("accessNotice"));
      assertEquals(
          0,
          integer(
              guest
                  .send("/api/points/search", "POST", obj("condition", "rain"), 200)
                  .get("total")));
      guest.send("/api/points/search", "POST", obj("condition", "invalid"), 400);
      byte[] thumb =
          (byte[])
              guest.request(
                  "/api/shooting-spots/" + s.get("id") + "/photo?size=thumb", "GET", null, 200);
      var image = ImageIO.read(new ByteArrayInputStream(thumb));
      assertTrue(Math.max(image.getWidth(), image.getHeight()) <= 480);
      byte[] original =
          (byte[]) guest.request("/api/shooting-spots/" + s.get("id") + "/photo", "GET", null, 200);
      assertTrue(thumb.length < original.length);
      guest.request("/media/" + media.get("id") + "?size=thumb", "GET", null, 404);
      body.putAll(obj("revision", 1, "availability", "closed"));
      admin.send("/api/admin/shooting-spots/" + s.get("id"), "PATCH", body, 200);
      a.send(
          "/api/checkins",
          "POST",
          obj(
              "pointId",
              p.get("id"),
              "spotId",
              s.get("id"),
              "note",
              "no entry",
              "submissionId",
              UUID.randomUUID().toString()),
          409);
      body.putAll(obj("revision", 2, "status", "draft"));
      admin.send("/api/admin/shooting-spots/" + s.get("id"), "PATCH", body, 200);
      guest.request("/api/shooting-spots/" + s.get("id") + "/photo?size=thumb", "GET", null, 404);
      assertEquals(
          0,
          integer(
              guest
                  .send("/api/points/search", "POST", obj("condition", "night"), 200)
                  .get("total")));
      byte[] staticThumb =
          (byte[]) guest.request("/shared/nmu-library.jpg?size=thumb", "GET", null, 200);
      assertTrue(staticThumb.length < Files.size(app.root.resolve("dist/shared/nmu-library.jpg")));
      assertFalse(
          write(guest.send("/api/points/search", "POST", obj(), 200)).contains("viewCount"));
    }
  }
}
