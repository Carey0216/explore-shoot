package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ShareAndCollectionContractTest {
  @TempDir Path temp;

  @Test void posterCodeChecksPublicVisibilityOnBothTransportsBeforeProviderAvailability() throws Exception {
    try (var app = new ApiFixture(temp, Map.of("WECHAT_PUBLIC_SHARE_CODES", "0"))) {
      var user = app.user();
      var publicId = rows(user.get("/api/catalog").get("points")).getFirst().get("id");
      for (String prefix : List.of("/api", "/api/mini")) {
        String path = prefix + "/share/mini-code?point=";
        user.request(path + publicId, "GET", null, 503);
        user.request(path + UUID.randomUUID(), "GET", null, 404);
        user.request(path + "%2F..", "GET", null, 400);
        user.request(prefix + "/share/mini-code?entry=campus", "GET", null, 503);
        user.request(path + publicId + "&entry=campus", "GET", null, 400);
        user.request(prefix + "/share/mini-code?entry=private", "GET", null, 400);
      }
    }
  }

  @Test void nextBuildingFollowsOnlyAnAccessibleUnfinishedStopFromTheOwnersPlan() throws Exception {
    try (var app = new ApiFixture(temp)) {
      var user = app.user();
      user.register("next_building_owner", "");
      var other = app.user();
      other.register("next_building_other", "");
      var points = rows(user.get("/api/catalog").get("points")).stream()
          .filter(p -> yes(p.get("open"))).limit(2).toList();
      app.promoteFixtureOwner();
      var admin = app.admin();
      admin.login("admin");
      var buildings = rows(map(admin.get("/api/admin/passport").get("atlas")).get("buildings"))
          .stream().filter(b -> eq(b.get("frame"), "photo")).limit(2).toList();
      for (int i = 0; i < points.size(); i++) {
        var building = buildings.get(i);
        admin.send("/api/admin/passport/buildings", "PUT", obj("id", building.get("id"),
            "revision", building.get("revision"), "name", building.get("name"),
            "pointIds", List.of(points.get(i).get("id"))), 200);
      }
      Object id = points.getLast().get("id");
      user.send("/api/my/plans", "POST", obj("title", "我的拍摄计划",
          "items", List.of(obj("spotId", "point:" + id))), 201);
      var first = rows(user.get("/api/my/passport").get("nextBuildings")).getFirst();
      assertEquals(id, first.get("pointId"));
      assertEquals("plan", first.get("reason"));
      assertFalse(first.containsKey("planId"));
      assertTrue(rows(other.get("/api/my/passport").get("nextBuildings")).stream()
          .noneMatch(b -> eq(b.get("reason"), "plan")));
      user.send("/api/checkins", "POST", obj("pointId", id, "note", "下一栋验收打卡",
          "submissionId", UUID.randomUUID().toString()), 201);
      assertTrue(rows(user.get("/api/my/passport").get("nextBuildings")).stream()
          .noneMatch(b -> eq(b.get("pointId"), id)));
    }
  }
}
