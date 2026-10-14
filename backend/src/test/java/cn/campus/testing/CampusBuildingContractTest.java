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
    }
  }
}
