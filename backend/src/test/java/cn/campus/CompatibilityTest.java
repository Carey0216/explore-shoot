package cn.campus;

import static cn.campus.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CompatibilityTest {
  @TempDir Path temporary;

  @Test
  void nodePasswordAndNewJavaPasswordRemainCompatible() {
    String old =
        "scrypt:c1c0c6181f8e1ccbed4abde518824ccc:fe04f6ec225db40fb8a5fbc255bb415dde8658330f1c286d9689cadc9a97ebc7652e778a0c66dd50f77b45eec98ebb49cfcb86165c454894896173faad569552";
    assertTrue(Security.verifyPassword("Compatibility2026!", old));
    assertFalse(Security.verifyPassword("wrong", old));
    assertFalse(Security.verifyPassword("Compatibility2026!", "malformed"));
    String javaHash = Security.hashPassword("Compatibility2026!");
    assertTrue(Security.verifyPassword("Compatibility2026!", javaHash));
    assertNotEquals(javaHash, Security.hashPassword("Compatibility2026!"));
  }

  @Test
  void existingFileIsNotRewrittenAndUnknownFieldsSurvive() throws Exception {
    Path data = temporary.resolve("data");
    Files.createDirectories(data);
    Map<String, Object> old =
        obj(
            "schema",
            2,
            "version",
            7,
            "settings",
            obj("mapProvider", "tencent"),
            "unknownFutureField",
            obj("kept", true),
            "users",
            new ArrayList<>());
    Path file = data.resolve("store-v2.json");
    Files.writeString(file, write(old));
    byte[] before = Files.readAllBytes(file);
    try (StoreRepository store = new StoreRepository(temporary, data)) {
      assertArrayEquals(before, Files.readAllBytes(file));
      store.rows("users").add(obj("id", "fixture"));
      store.save();
      assertTrue(yes(map(store.db.get("unknownFutureField")).get("kept")));
    }
    try (StoreRepository store = new StoreRepository(temporary, data)) {
      assertEquals("fixture", store.rows("users").getFirst().get("id"));
      assertTrue(yes(map(store.db.get("unknownFutureField")).get("kept")));
    }
  }

  @Test
  void corruptFileIsNeverOverwritten() throws Exception {
    Path data = temporary.resolve("bad");
    Files.createDirectories(data);
    Path file = data.resolve("store-v2.json");
    Files.writeString(file, "{broken");
    assertThrows(java.io.IOException.class, () -> new StoreRepository(temporary, data));
    assertEquals("{broken", Files.readString(file));
  }

  @Test
  void publicProjectionCannotExposePrivateStatistics() {
    Map<String, Object> point =
        obj(
            "id",
            "p",
            "viewCount",
            37,
            "popularityOffset",
            10,
            "popularity",
            47,
            "popularityAdjusted",
            true,
            "name",
            "机位");
    assertEquals(obj("id", "p", "name", "机位"), PointService.publicPoint(point));
    assertEquals(47L, PointService.stats(point).get("popularity"));
    assertEquals(37, point.get("viewCount"));
  }

  @Test
  void preferencesRejectRoleInjectionAndBadOptions() {
    assertThrows(ApiException.class, () -> Preferences.validate(obj("role", "super")));
    assertThrows(ApiException.class, () -> Preferences.validate(obj("language", "invalid")));
    assertThrows(ApiException.class, () -> Preferences.validate(obj("mapFollow", "true")));
    Map<String, Object> prefs = Preferences.normalize(obj("language", "ja", "role", "super"));
    assertEquals("ja", prefs.get("language"));
    assertFalse(prefs.containsKey("role"));
  }

  @Test
  void campusCoordinatesRejectForeignLocations() throws Exception {
    try (StoreRepository s = new StoreRepository(temporary, temporary.resolve("new"))) {
      assertEquals(106.10244, Campus.coordinate(s.campus, 106.10244, 38.49462).get("lng"));
      assertThrows(ApiException.class, () -> Campus.coordinate(s.campus, 116, 40));
      assertThrows(ApiException.class, () -> Campus.coordinate(s.campus, "106.10244", 38.49462));
    }
  }

  @Test
  void photoRemovesMetadataWithoutReencoding() {
    byte[] jpeg = {
      (byte) 255,
      (byte) 216,
      (byte) 255,
      (byte) 225,
      0,
      5,
      71,
      80,
      83,
      (byte) 255,
      (byte) 218,
      0,
      0,
      (byte) 255,
      (byte) 217
    };
    byte[] clean = Security.cleanJPEG(jpeg);
    assertEquals(8, clean.length);
    assertFalse(new String(clean, java.nio.charset.StandardCharsets.ISO_8859_1).contains("GPS"));
    assertThrows(ApiException.class, () -> Security.cleanJPEG(new byte[] {1, 2, 3, 4}));
  }
}
