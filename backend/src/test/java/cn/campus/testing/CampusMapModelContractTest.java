package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.*;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CampusMapModelContractTest {
  @TempDir Path temporary;

  @Test
  void modelsHavePrivateCalibrationAndExplicitPublicationWithoutMovingAnyPlace() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin();
      var user = app.user();
      String path = "/api/admin/campus-map/map-models";
      admin.request(path, "GET", null, 401);
      user.request(path, "GET", null, 404);
      assertTrue(rows(user.get("/api/maps/map-models").get("models")).isEmpty());
      user.request("/api/maps/map-models/clock/content.glb", "GET", null, 404);
      admin.login("admin");
      String originalPlaces = write(admin.get("/api/admin/campus-map").get("places"));
      var seed = rows(admin.get(path).get("models")).getFirst();
      assertFalse(yes(seed.get("confirmed")));
      var payload =
          obj(
              "lng",
              106.1048,
              "lat",
              38.496,
              "heading",
              0,
              "scale",
              .7,
              "altitude",
              0,
              "source",
              "Isolated fixture calibration",
              "confirmed",
              false,
              "published",
              false,
              "revision",
              0);
      payload.put("published", true);
      admin.request(path + "/clock", "PATCH", payload, 400);
      payload.put("confirmed", true);
      payload.put("scale", 9);
      admin.request(path + "/clock", "PATCH", payload, 400);
      payload.put("scale", .7);
      admin.request(path + "/clock", "PATCH", payload, 200);
      var model = rows(user.get("/api/maps/map-models").get("models")).getFirst();
      assertEquals(106.1048, num(model.get("lng")));
      assertFalse(write(model).contains("publicPlacement"));
      assertFalse(write(model).contains("viewCount"));
      byte[] content =
          (byte[]) user.request("/api/maps/map-models/clock/content.glb", "GET", null, 200);
      assertEquals(0x46546c67, ByteBuffer.wrap(content).order(ByteOrder.LITTLE_ENDIAN).getInt());
      assertEquals("metre", model.get("modelUnit"));
      assertEquals("Y", model.get("modelUpAxis"));
      admin.request(path + "/clock", "PATCH", payload, 409);
      payload.put("revision", 1);
      payload.put("published", false);
      payload.put("confirmed", false);
      payload.put("lng", 106.1047);
      admin.request(path + "/clock", "PATCH", payload, 200);
      assertEquals(
          106.1048,
          num(rows(user.get("/api/maps/map-models").get("models")).getFirst().get("lng")),
          "private drafts cannot move published geometry");
      admin.request(path + "/clock/tileset.json", "GET", null, 404);
      assertEquals(originalPlaces, write(admin.get("/api/admin/campus-map").get("places")));
      app.restart();
      assertEquals(
          106.1048,
          num(rows(app.user().get("/api/maps/map-models").get("models")).getFirst().get("lng")));
      admin = app.admin();
      admin.login("admin");
      admin.request(path + "/clock/unpublish", "POST", obj("revision", 2), 200);
      assertTrue(rows(app.user().get("/api/maps/map-models").get("models")).isEmpty());
      app.user().request("/api/maps/map-models/clock/content.glb", "GET", null, 404);
    }
  }
}
