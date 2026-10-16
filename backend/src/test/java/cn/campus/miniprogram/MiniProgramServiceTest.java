package cn.campus.miniprogram;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.common.RateLimiter;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class MiniProgramServiceTest {
  @TempDir Path temp;

  private ApiContext context(
      StoreRepository store, String path, Map<String, Object> body, String token) {
    var request = new MockHttpServletRequest();
    request.setLocalPort(4174);
    request.setRequestURI(path);
    request.setMethod("POST");
    if (token != null) request.addHeader("Authorization", "Bearer " + token);
    return new ApiContext(
        new MiniProgramRequest(request), new MockHttpServletResponse(), store, body);
  }

  private String login(StoreRepository store, Map<String, Object> account) throws Exception {
    var c = context(store, "/api/mini/auth/login", obj(), null);
    c.login(account);
    c.send(obj("account", ApiContext.safeAccount(account)));
    return str(parse(((MockHttpServletResponse) c.response).getContentAsString()).get("token"));
  }

  @Test
  void bindingsCannotReplaceAccountsAndUnbindingRevokesOnlyNativeSessions() throws Exception {
    try (var store = new StoreRepository(temp, temp.resolve("data"))) {
      var alice =
          obj(
              "id",
              "alice",
              "enabled",
              true,
              "passwordHash",
              Security.hashPassword("MiniSecret2026!"));
      var bob =
          obj(
              "id",
              "bob",
              "enabled",
              true,
              "passwordHash",
              Security.hashPassword("MiniSecret2026!"));
      store.rows("users").add(alice);
      store.rows("users").add(bob);
      var wechat = mock(WechatIdentityClient.class);
      when(wechat.configured()).thenReturn(true);
      when(wechat.identity("alice-code")).thenReturn("scoped-identity-alice");
      when(wechat.identity("bob-code")).thenReturn("scoped-identity-bob");
      var service = new MiniProgramService(wechat, new RateLimiter());
      String aToken = login(store, alice), bToken = login(store, bob);
      var bind = context(store, "/api/mini/wechat/bind", obj("code", "alice-code"), aToken);
      assertTrue(service.handle(bind, service.exchange(bind)));
      assertEquals(1, store.rows("wechatBindings").size());
      assertTrue(
          service.handle(
              context(store, "/api/mini/wechat/bind", obj("code", "alice-code"), aToken),
              "scoped-identity-alice"));
      assertEquals(1, store.rows("wechatBindings").size(), "Binding retry is idempotent");
      var hijack = context(store, "/api/mini/wechat/bind", obj("code", "alice-code"), bToken);
      assertEquals(
          409,
          assertThrows(ApiException.class, () -> service.handle(hijack, service.exchange(hijack)))
              .status);
      var replace = context(store, "/api/mini/wechat/bind", obj("code", "bob-code"), aToken);
      assertEquals(
          409,
          assertThrows(ApiException.class, () -> service.handle(replace, service.exchange(replace)))
              .status);
      var login = context(store, "/api/mini/wechat/login", obj("code", "alice-code"), null);
      service.handle(login, service.exchange(login));
      var result = parse(((MockHttpServletResponse) login.response).getContentAsString());
      assertEquals("alice", map(result.get("account")).get("id"));
      assertTrue(str(result.get("token")).matches("[a-f0-9]{64}"));
      assertFalse(write(result).contains("identity"));
      assertFalse(write(result).contains("passwordHash"));
      var fresh = context(store, "/api/mini/wechat/login", obj("code", "bob-code"), null);
      assertEquals(
          409,
          assertThrows(ApiException.class, () -> service.handle(fresh, service.exchange(fresh)))
              .status);
      assertEquals(
          2,
          store.rows("users").size(),
          "WeChat login must not silently create duplicate accounts");
      alice.put("enabled", false);
      assertEquals(
          403,
          assertThrows(ApiException.class, () -> service.handle(login, "scoped-identity-alice"))
              .status);
      alice.put("enabled", true);
      var bad = context(store, "/api/mini/wechat/unbind", obj("password", "wrong"), aToken);
      assertEquals(403, assertThrows(ApiException.class, () -> service.handle(bad, null)).status);
      assertEquals(1, store.rows("wechatBindings").size());
      var unbind =
          context(store, "/api/mini/wechat/unbind", obj("password", "MiniSecret2026!"), aToken);
      service.handle(unbind, null);
      assertTrue(store.rows("wechatBindings").isEmpty());
      assertNull(context(store, "/api/mini/checkins", obj(), aToken).account);
      assertNotNull(context(store, "/api/mini/checkins", obj(), bToken).account);
    }
  }
}
