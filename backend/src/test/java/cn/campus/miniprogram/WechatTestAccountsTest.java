package cn.campus.miniprogram;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import cn.campus.common.*;
import cn.campus.storage.StoreRepository;
import cn.campus.tools.WechatTestRetirement;
import cn.campus.web.ApiContext;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.*;

class WechatTestAccountsTest {
  @TempDir Path root;

  private ApiContext request(
      StoreRepository store, String path, String method, Map<String, Object> body, String token) {
    var req = new MockHttpServletRequest();
    req.setLocalPort(4174);
    req.setRequestURI(path);
    req.setMethod(method);
    if (token != null) req.addHeader("Authorization", "Bearer " + token);
    return new ApiContext(new MiniProgramRequest(req), new MockHttpServletResponse(), store, body);
  }

  @Test
  void disposableLoginDoesNotReuseProductionBindingAndCannotSurviveProductionMode()
      throws Exception {
    try (var store = new StoreRepository(root, root.resolve("data"))) {
      var original = obj("id", UUID.randomUUID().toString(), "username", "real", "enabled", true);
      store.rows("users").add(original);
      store
          .rows("wechatBindings")
          .add(obj("userId", original.get("id"), "identityHash", "same-identity"));
      var tests = new WechatTestAccounts(store, "test");
      var wechat = mock(WechatIdentityClient.class);
      when(wechat.configured()).thenReturn(true);
      when(wechat.identity("code")).thenReturn("same-identity");
      var service = new MiniProgramService(wechat, new RateLimiter(), tests);
      var login = request(store, "/api/mini/wechat/login", "POST", obj("code", "code"), null);
      service.handle(login, service.exchange(login));
      var response = parse(((MockHttpServletResponse) login.response).getContentAsString());
      var user = map(response.get("account"));
      assertTrue(yes(user.get("wechatTestAccount")));
      assertNotEquals(original.get("id"), user.get("id"));
      assertFalse(write(response).contains("identityHash"));
      assertFalse(write(response).contains("passwordHash"));
      var token = str(response.get("token"));
      assertEquals(
          user.get("id"),
          request(store, "/api/mini/auth/me", "GET", obj(), token).need().get("id"));
      assertEquals(user.get("id"), tests.login(store, "same-identity").get("id"));
      assertEquals(2, store.rows("users").size());
      var publicPost =
          request(store, "/api/mini/checkins", "POST", obj("shareToWall", true), token);
      assertThrows(ApiException.class, () -> WechatTestAccounts.checkMutation(publicPost));
      WechatTestAccounts.checkMutation(
          request(store, "/api/mini/checkins", "POST", obj("shareToWall", false), token));
      for (String filter : List.of("all", "popular", "nearby", "saved")) {
        WechatTestAccounts.checkMutation(
            request(
                store,
                "/api/mini/points/search",
                "POST",
                obj("filter", filter, "query", "图书馆", "condition", "architecture"),
                token));
      }
      for (String path :
          List.of("/api/mini/reports", "/api/mini/scout/apply", "/api/mini/shooting-spots")) {
        assertThrows(
            ApiException.class,
            () -> WechatTestAccounts.checkMutation(request(store, path, "POST", obj(), token)));
      }
      assertThrows(IllegalStateException.class, () -> new WechatTestAccounts(store, "production"));
      new WechatTestAccounts(store, "bound");
      assertNull(request(store, "/api/mini/auth/me", "GET", obj(), token).account);
      assertEquals(1, WechatTestRetirement.clean(store, true));
      assertDoesNotThrow(() -> new WechatTestAccounts(store, "production"));
      assertEquals(original, store.rows("users").getFirst());
      assertEquals(1, store.rows("wechatBindings").size());
    }
  }

  @Test
  void testIdentityCanSearchAndFilterWithoutChangingTheCatalog() throws Exception {
    try (var store = new StoreRepository(root, root.resolve("data"))) {
      var user = new WechatTestAccounts(store, "test").login(store, "search-test");
      store.rows("points").clear();
      store
          .rows("points")
          .add(
              obj(
                  "id", "library-test", "name", "图书馆", "published", true,
                  "viewCount", 11, "popularityOffset", 3));
      user.put("bookmarks", new ArrayList<>(List.of("library-test")));
      var login = request(store, "/api/mini/wechat/login", "POST", obj(), null);
      login.login(user);
      login.send(obj());
      var token =
          str(parse(((MockHttpServletResponse) login.response).getContentAsString()).get("token"));
      for (String table : List.of("checkins", "shootingSpots", "pointReactions")) store.rows(table);
      String before = write(store.db);
      long writes = store.writes;
      for (String filter : List.of("all", "popular", "nearby", "saved")) {
        var search =
            request(
                store,
                "/api/mini/points/search",
                "POST",
                obj("filter", filter, "query", "图书馆", "pageSize", 1),
                token);
        WechatTestAccounts.checkMutation(search);
        assertTrue(new cn.campus.point.PointSearchService().handle(search));
        String output = ((MockHttpServletResponse) search.response).getContentAsString();
        assertEquals("library-test", rows(parse(output).get("points")).getFirst().get("id"));
        assertFalse(output.contains("viewCount"));
        assertFalse(output.contains("popularity"));
      }
      assertEquals(before, write(store.db));
      assertEquals(writes, store.writes);
    }
  }

  @Test
  void retirementIsScopedChecksReferencesAndRetiresPhotosAfterSaving() throws Exception {
    try (var store = new StoreRepository(root, root.resolve("data"))) {
      var tests = new WechatTestAccounts(store, "test");
      var user = tests.login(store, "test-identity");
      var real =
          obj("id", UUID.randomUUID().toString(), "username", "wx_test_real_user", "enabled", true);
      store.rows("users").add(real);
      String media = UUID.randomUUID().toString(), ordinary = UUID.randomUUID().toString();
      Path photo = store.directory.resolve("media/" + media + ".jpg"),
          kept = store.directory.resolve("media/" + ordinary + ".jpg");
      Files.write(photo, new byte[] {1, 2, 3});
      Files.write(kept, new byte[] {4, 5, 6});
      store.rows("media").add(obj("id", media, "ownerId", user.get("id")));
      store.rows("media").add(obj("id", ordinary, "ownerId", real.get("id")));
      store.rows("checkins").add(obj("ownerId", user.get("id"), "mediaId", media));
      store
          .rows("checkins")
          .add(obj("ownerId", real.get("id"), "note", "REAL PRIVATE", "mediaId", ordinary));
      var borrowed = obj("mediaId", media, "authorId", real.get("id"));
      store.rows("points").add(borrowed);
      store.save();
      var before = Json.write(store.db);
      assertThrows(IllegalStateException.class, () -> WechatTestRetirement.clean(store, true));
      assertEquals(before, Json.write(store.db));
      assertTrue(Files.exists(photo));
      store.rows("points").remove(borrowed);
      assertEquals(1, WechatTestRetirement.clean(store, false));
      assertTrue(Files.exists(photo));
      assertEquals(1, WechatTestRetirement.clean(store, true));
      assertFalse(Files.exists(photo));
      assertTrue(Files.exists(kept));
      assertEquals(1, store.rows("checkins").size());
      assertEquals("REAL PRIVATE", store.rows("checkins").getFirst().get("note"));
      assertEquals(real, store.rows("users").getFirst());
      long writes = store.writes;
      assertEquals(0, WechatTestRetirement.clean(store, true));
      assertEquals(writes, store.writes);
    }
  }
}
