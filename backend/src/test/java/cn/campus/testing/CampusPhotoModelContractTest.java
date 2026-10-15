package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CampusPhotoModelContractTest {
  @TempDir Path temporary;

  @Test
  void preservesPhotoBytesAndKeepsImageFrameOutOfNavigation() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var user = app.user();
      var admin = app.admin();
      var scene = user.get("/api/maps/photo-model");
      assertEquals("supplied-overhead-image", scene.get("layoutBasis"));
      assertFalse(yes(scene.get("georeferenced")));
      assertTrue(yes(scene.get("scaleEstimated")));
      assertFalse(scene.containsKey("origin"));
      assertTrue(rows(scene.get("models")).size() >= 70);
      assertFalse(write(scene).contains("viewCount"));
      assertFalse(write(scene).contains("sdkKey"));
      for (var m : rows(scene.get("models"))) {
        assertFalse(m.containsKey("lng"));
        assertFalse(m.containsKey("lat"));
        assertTrue(yes(m.get("heightEstimated")));
        assertFalse(yes(m.get("nameConfirmed")));
        assertTrue(rows(m.get("parts")).stream().anyMatch(p -> eq(p.get("shape"), "imageRoof")));
      }
      var texture = map(map(scene.get("materials")).get("photoImage"));
      assertTrue(yes(texture.get("photographic")));
      byte[] image = (byte[]) user.request(str(texture.get("url")), "GET", null, 200);
      var meta =
          rows(map(scene.get("assets")).get("textures")).stream()
              .filter(t -> eq(t.get("id"), "overhead"))
              .findFirst()
              .orElseThrow();
      assertEquals(
          meta.get("originalSHA256"),
          HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(image)));
      admin.request("/api/admin/campus-map/photo-model", "GET", null, 401);
      admin.login("admin");
      assertEquals(write(scene), write(admin.get("/api/admin/campus-map/photo-model")));
      assertTrue(rows(user.get("/api/maps/map-models").get("models")).isEmpty());
    }
  }
}
