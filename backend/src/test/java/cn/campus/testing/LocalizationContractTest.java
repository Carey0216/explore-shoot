package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LocalizationContractTest {
  @TempDir Path temporary;
  @Test void twoLanguagesAndTemporaryPathsKeepAccountPreferencesAndCanonicalData() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var user = app.user(); user.register("locale_contract", "");
      assertEquals("system", map(user.get("/api/auth/preferences").get("preferences")).get("language"));
      user.send("/api/auth/preferences", "PATCH", obj("language", "en-US"), 200);
      assertTrue(user.request("/zh-CN/", "GET", null, 200).toString().contains("景遇"));
      assertEquals("en-US", map(user.get("/api/auth/preferences").get("preferences")).get("language"));
      for (String unsupported : List.of("en", "ja", "zh-TW", "fr"))
        user.send("/api/auth/preferences", "PATCH", obj("language", unsupported), 400);
      var status=user.get("/api/localization/status");
      assertEquals(List.of("zh-CN","en-US"),status.get("languages"));
      assertEquals(true,status.get("localInference"));
      for (var invalid : List.of(obj("texts",List.of("hello"),"target","ja"), obj("texts",List.of(),"target","en-US"), obj("texts",List.of("x".repeat(4001)),"target","zh-CN"), obj("texts",List.of("hello"),"target","en-US","external",true)))
        user.send("/api/localization/translate","POST",invalid,400);
      user.send("/api/translation","POST",obj(),404);
      user.send("/api/mini/localization/translate","POST",obj("texts",List.of("hello"),"target","ja"),400);
      assertEquals("en-US", map(user.get("/api/auth/preferences").get("preferences")).get("language"));
    }
  }
}
