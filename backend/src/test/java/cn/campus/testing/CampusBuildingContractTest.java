package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.maps.CampusBuildingService;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CampusBuildingContractTest {
  @TempDir Path temporary;

  @Test
  void heightsRetainTheirEvidenceAndRejectInvalidValues() {
    assertEquals(27.0, num(CampusBuildingService.height(obj("height", "27 m")).get("height")));
    assertFalse(yes(CampusBuildingService.height(obj("height", "27 m")).get("estimated")));
    assertEquals(
        15.0, num(CampusBuildingService.height(obj("building:levels", "5")).get("height")));
    assertTrue(yes(CampusBuildingService.height(obj("building:levels", "5")).get("estimated")));
    for (String bad : new String[] {"NaN", "Infinity", "-9", "999999", "bad"}) {
      var result = CampusBuildingService.height(obj("height", bad));
      assertTrue(yes(result.get("estimated")));
      assertTrue(num(result.get("height")) > 0 && num(result.get("height")) <= 300);
    }
  }

  @Test
  void realPublicApiReturnsOnlyCampusDisplayDataAndPublishedNearbyPoints() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var data = app.user().get("/api/maps/buildings");
      assertEquals("WGS84", data.get("coordinateSystem"));
      assertEquals("ODbL-1.0", data.get("license"));
      var buildings = rows(data.get("buildings"));
      assertEquals(8, buildings.size());
      assertTrue(rows(data.get("supplements")).stream().allMatch(b -> eq(b.get("coverage"), "missing")));
      assertFalse(data.containsKey("candidates"));
      app.user().request("/api/maps/buildings?review=1", "GET", null, 403);
      var catalog = app.user().get("/api/catalog");
      var points = rows(catalog.get("points"));
      for (var b : buildings) {
        var ring = list(b.get("footprint"));
        assertEquals(ring.getFirst(), ring.getLast());
        assertTrue(yes(b.get("estimated")));
        assertFalse(b.containsKey("tags"));
        for (var id : list(b.get("pointIds")))
          assertTrue(points.stream().anyMatch(p -> eq(p.get("id"), id)));
        assertFalse(write(b).contains("viewCount"));
      }
      assertTrue(buildings.stream().anyMatch(b -> list(b.get("pointIds")).contains("nmu1")));
      var admin = app.admin();
      admin.request("/api/maps/buildings", "GET", null, 401);
      admin.login("admin");
      assertEquals(8, rows(admin.get("/api/maps/buildings").get("buildings")).size());
      admin.request("/api/maps/buildings?review=1", "GET", null, 403);
      app.promoteFixtureOwner();
      var review = admin.get("/api/maps/buildings?review=1");
      var candidates = rows(review.get("candidates"));
      assertEquals(82, candidates.size());
      assertEquals("excluded", find(candidates, "id", "east-40").get("coverage"));
      assertEquals("excluded", find(candidates, "id", "east-landmark").get("coverage"));
      assertTrue(candidates.stream().anyMatch(b -> !list(b.get("holes")).isEmpty()));
      assertEquals(rows(data.get("supplements")).size(),
          candidates.stream().filter(b -> eq(b.get("coverage"), "missing")).count());
      assertEquals("excluded", find(candidates, "id", "west-01").get("coverage"));
      assertEquals("missing", find(candidates, "id", "west-01-east-north").get("coverage"));
      assertEquals("native", find(candidates, "id", "east-17").get("coverage"));
      var draft = find(candidates, "id", "west-03");
      String path = "/api/admin/campus-map/building-coverage";
      var edit = obj("id", draft.get("id"), "geometryChecksum", draft.get("geometryChecksum"),
          "revision", draft.get("revision"), "status", "missing");
      app.user().request(path, "PATCH", edit, 404);
      var updated = admin.send(path, "PATCH", edit, 200);
      assertEquals("missing", updated.get("coverage"));
      admin.request(path, "PATCH", edit, 409);
      app.restart();
      var published = find(rows(app.user().get("/api/maps/buildings").get("supplements")), "id", draft.get("id"));
      assertNotNull(published, "An owner review survives reload and is rendered by the public client");
      assertFalse(published.containsKey("revision"));
      edit.put("revision", updated.get("revision"));
      edit.put("status", "native");
      admin.send(path, "PATCH", edit, 200);
      assertNull(find(rows(app.user().get("/api/maps/buildings").get("supplements")), "id", draft.get("id")));
    }
  }

  @Test
  void ownerCanDrawResizeMoveAndPublishSameBuildingToBothClients() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin();
      String editPath = "/api/admin/campus-map/buildings";
      var draft = obj("name", "测试楼栋", "height", 16.5, "color", "#aabbcc", "revision", 0,
          "status", "unreviewed", "holes", java.util.List.of(),
          "footprint", java.util.List.of(java.util.List.of(106.1000, 38.4970),
              java.util.List.of(106.1004, 38.4970), java.util.List.of(106.1004, 38.4973)));
      admin.request(editPath, "POST", draft, 401);
      admin.login("admin");
      admin.request(editPath, "POST", draft, 403);
      app.promoteFixtureOwner();
      var created = admin.send(editPath, "POST", draft, 200);
      Object id = created.get("id");
      assertEquals("unreviewed", created.get("coverage"));
      assertNull(find(rows(app.user().get("/api/maps/buildings").get("supplements")), "id", id));
      draft.put("id", id);
      draft.put("revision", created.get("revision"));
      draft.put("height", 20.4);
      draft.put("status", "missing");
      draft.put("footprint", java.util.List.of(java.util.List.of(106.1001, 38.4971),
          java.util.List.of(106.1005, 38.4971), java.util.List.of(106.1005, 38.4974),
          java.util.List.of(106.1001, 38.4974)));
      var edited = admin.send(editPath, "PUT", draft, 200);
      admin.request(editPath, "PUT", draft, 409);
      assertNotEquals(created.get("center"), edited.get("center"));
      app.restart();
      var web = find(rows(app.user().get("/api/maps/buildings").get("supplements")), "id", id);
      var mini = find(rows(app.user().get("/api/mini/maps/buildings").get("supplements")), "id", id);
      assertNotNull(web);
      assertEquals(web, mini);
      assertEquals(20.4, num(web.get("height")));
      assertEquals(5, list(web.get("footprint")).size());
      assertFalse(web.containsKey("revision"));
      draft.put("revision", edited.get("revision"));
      draft.put("status", "unreviewed");
      admin.send(editPath, "PUT", draft, 200);
      assertNull(find(rows(app.user().get("/api/maps/buildings").get("supplements")), "id", id));
    }
  }
}
