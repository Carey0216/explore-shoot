package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.admin.DeletionService;
import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.common.RateLimiter;
import cn.campus.common.TimeSource;
import cn.campus.maps.MapConfigService;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class TransactionFailureTest {
  @TempDir Path temporary;

  static class FailingStore extends StoreRepository {
    boolean fail;

    FailingStore(Path root, Path data) throws Exception {
      super(root, data);
    }

    @Override
    public void save() {
      if (fail) throw new IllegalStateException("fixture disk full");
      super.save();
    }
  }

  static ApiContext context(
      StoreRepository store, String path, Map<String, Object> body, String token, String ip) {
    var request = new MockHttpServletRequest("POST", path);
    request.setLocalPort(4176);
    request.setRemoteAddr(ip);
    request.addHeader("Cookie", "nmu_admin=" + token);
    return new ApiContext(request, new MockHttpServletResponse(), store, body);
  }

  static String session(StoreRepository store) {
    String token = Security.token();
    store
        .rows("auth")
        .add(
            obj(
                "hash",
                Security.digest(token),
                "audience",
                "admin",
                "accountId",
                store.rows("admins").getFirst().get("id"),
                "expires",
                TimeSource.now() + 86400000L));
    return token;
  }

  @Test
  void failedDatabaseSaveNeverDeletesPhotosAndBlockedFilesRemainQueuedAcrossRestart()
      throws Exception {
    Path data = temporary.resolve("data");
    String id = UUID.randomUUID().toString(), photo = UUID.randomUUID().toString();
    Path file = data.resolve("media/" + photo + ".jpg");
    try (var store = new FailingStore(temporary, data)) {
      store
          .rows("admins")
          .getFirst()
          .put("passwordHash", Security.hashPassword(ApiFixture.PASSWORD));
      String token = session(store);
      store
          .rows("points")
          .add(obj("id", id, "name", "删除事务测试", "published", false, "mediaId", photo));
      store.rows("media").add(obj("id", photo, "public", true));
      Files.write(file, new byte[] {1, 2, 3});
      store.save();
      var deletion = new DeletionService(store, new RateLimiter());
      var prepared =
          context(
              store,
              "/api/admin/content-deletion/prepare",
              obj("type", "points", "id", id, "password", ApiFixture.PASSWORD),
              token,
              "127.0.0.1");
      deletion.handle(prepared);
      var result = parse(((MockHttpServletResponse) prepared.response).getContentAsString());
      String before = write(store.db);
      Object firstToken = result.get("confirmationToken");
      store.fail = true;
      assertThrows(
          IllegalStateException.class,
          () ->
              deletion.handle(
                  context(
                      store,
                      "/api/admin/content-deletion/commit",
                      obj("confirmationToken", firstToken, "confirmed", true),
                      token,
                      "127.0.0.1")));
      assertEquals(before, write(store.db));
      assertTrue(Files.exists(file));
      store.fail = false;
      Files.delete(file);
      Files.createDirectory(file);
      Files.writeString(file.resolve("blocked"), "fixture");
      // The content fingerprint includes file size: prepare again after changing the fixture.
      prepared =
          context(
              store,
              "/api/admin/content-deletion/prepare",
              obj("type", "points", "id", id, "password", ApiFixture.PASSWORD),
              token,
              "127.0.0.1");
      deletion.handle(prepared);
      result = parse(((MockHttpServletResponse) prepared.response).getContentAsString());
      var commit =
          context(
              store,
              "/api/admin/content-deletion/commit",
              obj("confirmationToken", result.get("confirmationToken"), "confirmed", true),
              token,
              "127.0.0.1");
      deletion.handle(commit);
      assertNull(find(store.rows("points"), "id", id));
      assertEquals(1, store.rows("pendingMediaDeletes").size());
      assertEquals(
          1,
          integer(
              parse(((MockHttpServletResponse) commit.response).getContentAsString())
                  .get("cleanupPending")));
      assertTrue(Files.exists(file));
    }
    Files.delete(file.resolve("blocked"));
    Files.delete(file);
    Files.write(file, new byte[] {1, 2, 3});
    try (var store = new StoreRepository(temporary, data)) {
      new DeletionService(store, new RateLimiter());
      assertFalse(Files.exists(file));
      assertTrue(store.rows("pendingMediaDeletes").isEmpty());
      assertEquals(
          0,
          integer(
              store.rows("audit").stream()
                  .filter(e -> eq(e.get("action"), "永久删除内容"))
                  .findFirst()
                  .orElseThrow()
                  .get("cleanupPending")));
    }
  }

  @Test
  void sdkVerificationIsBoundToIpSessionVerifierAndCurrentPassword() throws Exception {
    try (var store = new StoreRepository(temporary, temporary.resolve("data"))) {
      var admin = store.rows("admins").getFirst();
      admin.put("role", "owner");
      admin.put("passwordHash", Security.hashPassword(ApiFixture.PASSWORD));
      String token = session(store), other = session(store);
      var service = new MapConfigService(new RateLimiter());
      var unlock =
          context(
              store,
              "/api/admin/map-config/unlock",
              obj("username", "admin", "password", ApiFixture.PASSWORD),
              token,
              "127.0.0.1");
      service.handle(unlock);
      Object grant =
          parse(((MockHttpServletResponse) unlock.response).getContentAsString()).get("token");
      for (var identity : List.of(List.of(other, "127.0.0.1"), List.of(token, "192.0.2.1")))
        assertThrows(
            ApiException.class,
            () ->
                service.handle(
                    context(
                        store,
                        "/api/admin/map-config/read",
                        obj("verification", grant),
                        identity.get(0),
                        identity.get(1))));
      admin.put("passwordHash", Security.hashPassword("ChangedJava2026!"));
      assertThrows(
          ApiException.class,
          () ->
              service.handle(
                  context(
                      store,
                      "/api/admin/map-config/read",
                      obj("verification", grant),
                      token,
                      "127.0.0.1")));
    }
  }
}
