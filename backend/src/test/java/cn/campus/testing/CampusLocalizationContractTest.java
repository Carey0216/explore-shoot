package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CampusLocalizationContractTest {
  @TempDir Path temporary;

  private MapBuilder draft() {
    return new MapBuilder();
  }

  private static class MapBuilder {
    java.util.Map<String, Object> value =
        obj(
            "name",
            "测试教学楼",
            "aliases",
            "软件学院",
            "category",
            "学院",
            "zone",
            "东校区",
            "lng",
            106.103,
            "lat",
            38.497,
            "description",
            "仅隔离测试",
            "source",
            "测试实地校准",
            "confirmed",
            false,
            "published",
            false,
            "revision",
            0);
  }

  @Test
  void draftsRequireAuthenticationAndVerificationAndSurviveRestart() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin();
      var user = app.user();
      admin.request("/api/admin/campus-map", "GET", null, 401);
      user.request("/api/admin/campus-map", "GET", null, 404);
      assertTrue(rows(user.get("/api/maps/places").get("places")).isEmpty());
      admin.login("admin");
      var directory = admin.get("/api/admin/campus-map");
      assertTrue(rows(directory.get("places")).size() >= 60);
      assertFalse(write(directory).contains("amapSecurity"));
      assertFalse(write(directory).contains("viewCount"));
      var b = draft().value;
      b.put("published", true);
      admin.request("/api/admin/campus-map/places", "POST", b, 400);
      b.put("published", false);
      b.put("lng", 116.4);
      admin.request("/api/admin/campus-map/places", "POST", b, 400);
      b.put("lng", 106.103);
      var p = map(admin.send("/api/admin/campus-map/places", "POST", b, 201).get("place"));
      String id = str(p.get("id")), path = "/api/admin/campus-map/places/" + id;
      assertTrue(rows(user.get("/api/maps/places").get("places")).isEmpty());
      assertFalse(write(user.get("/api/maps/model")).contains("测试教学楼"));
      b.put("confirmed", true);
      b.put("published", true);
      admin.request(path, "PATCH", b, 409);
      b.put("revision", 1);
      admin.send(path, "PATCH", b, 200);
      assertEquals(id, rows(user.get("/api/maps/places").get("places")).getFirst().get("id"));
      assertFalse(write(user.get("/api/maps/model")).contains("测试教学楼"));
      b.put("revision", 2);
      b.put("published", false);
      b.put("name", "私有修改内容");
      admin.send(path, "PATCH", b, 200);
      assertFalse(write(user.get("/api/maps/model")).contains("私有修改内容"));
      assertTrue(rows(user.get("/api/maps/places").get("places")).isEmpty());
      app.restart();
      admin = app.admin();
      admin.login("admin");
      assertEquals(
          "私有修改内容",
          find(rows(admin.get("/api/admin/campus-map").get("places")), "id", id).get("name"));
      assertTrue(rows(app.data().get("audit")).stream().anyMatch(a -> write(a).contains("校园地点")));
    }
  }

  @Test
  void publishingRetainsExistingDecimalPrecision() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin();
      admin.login("admin");
      var input = draft().value;
      input.putAll(
          obj("lng", 106.103112345, "lat", 38.497123456, "confirmed", true, "published", true));
      var saved = map(admin.send("/api/admin/campus-map/places", "POST", input, 201).get("place"));
      assertFalse(saved.containsKey("width"));
      assertFalse(saved.containsKey("height"));
      assertEquals(106.103112345, num(saved.get("lng")), 1e-10);
      assertTrue(yes(saved.get("published")));
      assertEquals(
          saved.get("id"),
          rows(app.user().get("/api/maps/places").get("places")).getFirst().get("id"));
    }
  }

  @Test
  void modelPreservesFootprintsAndIsIndependentFromPrivateDirectoryEdits() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var user = app.user();
      user.request("/api/maps/scene", "GET", null, 404);
      var scene = user.get("/api/maps/model");
      assertEquals("local-metres", scene.get("coordinateSystem"));
      var models = rows(scene.get("models"));
      assertEquals(62, models.size());
      assertEquals(62, models.stream().map(m -> m.get("id")).distinct().count());
      assertEquals(52, num(map(scene.get("coverage")).get("east")));
      assertEquals(10, num(map(scene.get("coverage")).get("west")));
      assertEquals(3, rows(scene.get("fields")).size());
      assertEquals(5, rows(scene.get("facilities")).size());
      assertTrue(rows(scene.get("facilities")).stream().allMatch(f -> yes(f.get("displayOnly"))));
      assertEquals(8, models.stream().filter(m -> str(m.get("id")).startsWith("osm-way-")).count());
      assertTrue(
          models.stream()
              .anyMatch(
                  m ->
                      eq(m.get("style"), "clock")
                          && rows(m.get("parts")).stream()
                              .anyMatch(p -> eq(p.get("shape"), "cone"))));
      assertTrue(
          models.stream()
              .anyMatch(
                  m ->
                      eq(m.get("style"), "library")
                          && !list(rows(m.get("parts")).getFirst().get("holes")).isEmpty()));
      assertEquals(
          0,
          models.stream()
              .filter(m -> rows(m.get("parts")).stream().anyMatch(p -> eq(p.get("shape"), "photo")))
              .count());
      for (var m : models) {
        assertFalse(str(m.get("name")).isBlank());
        assertTrue(yes(m.get("heightEstimated")));
        var profile = map(m.get("appearance"));
        assertEquals(m.get("id"), profile.get("id"));
        assertTrue(yes(profile.get("estimated")));
        if (eq(profile.get("zone"), "west"))
          assertTrue(str(profile.get("reference")).startsWith("plan-only"));
        assertTrue(rows(m.get("parts")).stream().anyMatch(p -> eq(p.get("shape"), "surface")));
        for (var part : rows(m.get("parts"))) {
          for (Object n : list(part.get("size"))) assertTrue(Double.isFinite(num(n)) && num(n) > 0);
          for (Object v : list(part.get("ring")))
            for (Object n : list(v)) assertTrue(Double.isFinite(num(n)) && Math.abs(num(n)) < 2000);
          for (Object v : list(part.get("uv")))
            for (Object n : list(v)) assertTrue(Double.isFinite(num(n)) && num(n) >= 0);
          if (eq(part.get("shape"), "surface")) {
            assertEquals(4, list(part.get("vertices")).size());
            assertEquals(4, list(part.get("uv")).size());
            var uv = list(part.get("uv"));
            assertEquals(list(uv.get(0)).get(1), list(uv.get(1)).get(1));
            assertEquals(list(uv.get(2)).get(1), list(uv.get(3)).get(1));
          }
        }
      }
      assertEquals(1, models.stream().filter(m -> m.containsKey("meshAsset")).count());
      var registry = user.get("/shared/campus-assets/manifest.json");
      assertEquals(write(registry), write(scene.get("assets")));
      for (var asset : rows(registry.get("textures"))) {
        var bytes = (byte[]) user.request(str(asset.get("url")), "GET", null, 200);
        assertEquals(num(asset.get("bytes")), bytes.length);
        assertEquals(
            asset.get("sha256"),
            java.util.HexFormat.of()
                .formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes)));
      }
      var asset = rows(registry.get("models")).getFirst();
      var meshBytes = (byte[]) user.request(str(asset.get("url")), "GET", null, 200);
      var header = java.nio.ByteBuffer.wrap(meshBytes).order(java.nio.ByteOrder.LITTLE_ENDIAN);
      assertEquals(0x46546c67, header.getInt());
      assertEquals(2, header.getInt());
      assertEquals(meshBytes.length, header.getInt());
      assertEquals(
          asset.get("sha256"),
          java.util.HexFormat.of()
              .formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(meshBytes)));
      assertFalse(write(scene).contains("C:\\Users"));
      assertFalse(write(scene).contains("viewCount"));
      assertFalse(write(scene).contains("amapSecurity"));
      var admin = app.admin();
      admin.request("/api/admin/campus-map/model", "GET", null, 401);
      admin.login("admin");
      assertEquals(write(scene), write(admin.get("/api/admin/campus-map/model")));
      admin.request("/api/admin/campus-map/scene", "GET", null, 404);
      var b = draft().value;
      b.put("height", 18);
      admin.request("/api/admin/campus-map/places", "POST", b, 400);
    }
  }
}
