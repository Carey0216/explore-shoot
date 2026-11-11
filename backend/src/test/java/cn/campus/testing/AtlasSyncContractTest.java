package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;
import cn.campus.auth.Security;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class AtlasSyncContractTest {
  @TempDir Path temp;

  @Test void exportRequiresOwnerAndContainsCurrentSavedGeometryWithoutPrivateRecords() throws Exception {
    try (var app = new ApiFixture(temp)) {
      var anon = app.admin();
      anon.request("/api/admin/passport/export", "GET", null, 401);
      var admin = app.admin(); admin.login("admin");
      admin.request("/api/admin/passport/export", "GET", null, 403);
      app.promoteFixtureOwner(); admin = app.admin(); admin.login("admin");
      var atlas = map(admin.get("/api/admin/passport").get("atlas"));
      var b = rows(atlas.get("buildings")).getFirst();
      var point = rows(app.user().get("/api/catalog").get("points")).getFirst();
      admin.send("/api/admin/passport/buildings", "PUT", obj("id", b.get("id"),
          "revision", 0, "name", "待完成的标注不应自动同步", "pointIds", List.of(point.get("id"))), 200);
      var user = app.user(); user.register("atlas_export_user", "");
      user.send("/api/checkins", "POST", obj("pointId", point.get("id"), "note", "PRIVATE_EXPORT_SENTINEL", "submissionId", UUID.randomUUID().toString()), 201);
      var export = admin.get("/api/admin/passport/export");
      assertEquals("jingyu-atlas/1", export.get("schema"));
      assertEquals(Security.digest(str(export.get("payload"))), export.get("checksum"));
      var payload = parse(str(export.get("payload")));
      assertEquals(rows(atlas.get("buildings")).size(), rows(payload.get("buildings")).size());
      var saved = find(rows(payload.get("buildings")), "id", b.get("id"));
      assertEquals("待完成的标注不应自动同步", saved.get("name"));
      assertEquals(1, integer(saved.get("revision")));
      assertEquals(List.of(point.get("id")), saved.get("pointIds"));
      assertEquals(Security.digest(str(payload.get("geometry"))), payload.get("geometryChecksum"));
      assertFalse(write(export).contains("PRIVATE_EXPORT_SENTINEL"));
      assertFalse(write(export).contains("ownerId"));
      assertFalse(write(export).contains("actorId"));
      assertEquals(payload.get("contentChecksum"), parse(str(admin.get("/api/admin/passport/export").get("payload"))).get("contentChecksum"));
      assertEquals(saved, find(rows(parse(str(admin.get("/api/admin/passport/export").get("payload"))).get("buildings")), "id", b.get("id")));
      assertTrue(yes(find(rows(map(user.get("/api/my/passport").get("atlas")).get("buildings")), "id", b.get("id")).get("collected")));
    }
  }
}
