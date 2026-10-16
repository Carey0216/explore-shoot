package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.storage.StoreRepository;
import cn.campus.tools.TranslationRetirement;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class TranslationRetirementTest {
  @TempDir Path temp;

  @Test
  void removesOnlyRetiredPreferencesAndCanBeSafelyRepeated() throws Exception {
    try (var store = new StoreRepository(temp, temp.resolve("data"))) {
      var owner =
          obj(
              "id",
              "owner",
              "nickname",
              "English 用户文字",
              "preferences",
              obj("language", "en", "textSize", "large", "motion", "reduce"),
              "preferencesRevision",
              7);
      store.rows("users").add(owner);
      var administrator = store.rows("admins").getFirst();
      administrator.put("preferences", obj("language", "ja", "voiceId", "he"));
      store
          .rows("checkins")
          .add(obj("ownerId", "owner", "note", "Original 日本語 content", "mediaId", "kept"));
      store.save();
      String before = write(store.db);
      assertEquals(2, TranslationRetirement.clean(store, false));
      assertEquals(before, write(store.db));
      assertEquals(2, TranslationRetirement.clean(store, true));
      assertFalse(map(owner.get("preferences")).containsKey("language"));
      assertEquals("large", map(owner.get("preferences")).get("textSize"));
      assertEquals(8, integer(owner.get("preferencesRevision")));
      assertEquals("Original 日本語 content", store.rows("checkins").getFirst().get("note"));
      assertEquals("kept", store.rows("checkins").getFirst().get("mediaId"));
      long writes = store.writes;
      assertEquals(0, TranslationRetirement.clean(store, true));
      assertEquals(writes, store.writes);
    }
  }

  @Test
  void retiredApiAndLanguagePreferenceAreRejectedWithoutDisablingSpeech() throws Exception {
    try (var app = new ApiFixture(temp)) {
      var user = app.user();
      user.register("retire_check", "");
      user.send("/api/auth/preferences", "PATCH", obj("language", "en"), 400);
      assertFalse(
          map(user.get("/api/auth/preferences").get("preferences")).containsKey("language"));
      user.send(
          "/api/translation", "POST", obj("texts", java.util.List.of("公共测试"), "target", "en"), 404);
      user.get("/api/navigation/voices");
      user.send("/api/mini/translation", "POST", obj(), 404);
    }
  }
}
