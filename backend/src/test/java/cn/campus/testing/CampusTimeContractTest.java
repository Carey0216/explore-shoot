package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.settings.InteractionFeatures;
import cn.campus.settings.Preferences;
import cn.campus.storage.StoreRepository;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CampusTimeContractTest {
  @TempDir Path temporary;

  @Test
  void timePreferencePersistsAndHiddenFeatureBlocksChangesWithoutTouchingAppearance() throws Exception {
    assertEquals("auto", Preferences.normalize(obj()).get("campusTime"));
    assertThrows(RuntimeException.class, () -> Preferences.validate(obj("campusTime", "night")));
    try (var app = new ApiFixture(temporary)) {
      var user = app.user();
      user.register("campus_time", "");
      user.send("/api/auth/preferences", "PATCH", obj("campusTime", "evening", "appearance", "light"), 200);
      app.close();
      try (var store = new StoreRepository(app.root, app.directory.resolve("data"), "test")) {
        store.settings().put("interactionFeatures", obj("campus-time", obj("enabled", true, "visible", false)));
        assertFalse(InteractionFeatures.enabled(store, "campus-time"));
        store.save();
      }
      app.start();
      user.login("campus_time");
      var prefs = map(user.get("/api/auth/preferences").get("preferences"));
      assertEquals("evening", prefs.get("campusTime"));
      assertEquals("light", prefs.get("appearance"));
      user.request("/api/auth/preferences", "PATCH", obj("campusTime", "day"), 403);
      user.send("/api/auth/preferences", "PATCH", obj("appearance", "dark"), 200);
      var flag = map(map(user.get("/api/features").get("features")).get("campus-time"));
      assertEquals(false, flag.get("visible"));
      assertEquals(false, flag.get("enabled"));
    }
  }
}
