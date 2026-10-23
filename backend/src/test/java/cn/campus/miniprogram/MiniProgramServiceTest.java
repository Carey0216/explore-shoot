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
      var service =
          new MiniProgramService(wechat, new RateLimiter(), new WechatTestAccounts(store, "bound"));
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
      assertTrue(service.handle(fresh, service.exchange(fresh)));
      var onboarding = parse(((MockHttpServletResponse) fresh.response).getContentAsString());
      assertEquals(true, onboarding.get("onboardingRequired"));
      assertTrue(str(onboarding.get("ticket")).matches("[a-f0-9]{64}"));
      assertEquals(
          2,
          store.rows("users").size(),
          "WeChat login must not silently create duplicate accounts");
      find(store.rows("users"), "id", "alice").put("enabled", false);
      assertEquals(
          403,
          assertThrows(ApiException.class, () -> service.handle(login, "scoped-identity-alice"))
              .status);
      find(store.rows("users"), "id", "alice").put("enabled", true);
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
  @Test
  void unboundWechatRequiresExplicitChoiceAndProvesExistingAccountOwnership() throws Exception {
    try (var store = new StoreRepository(temp, temp.resolve("onboarding"))) {
      var user = obj("id", "web-user", "username", "web_user", "nickname", "原用户", "enabled", true,
          "passwordHash", Security.hashPassword("MiniSecret2026!"), "scoutStatus", "approved", "bookmarks", java.util.List.of("nmu1"));
      store.rows("users").add(user);
      var wechat = mock(WechatIdentityClient.class);
      when(wechat.identity("code")).thenReturn("real-scoped-identity");
      var service = new MiniProgramService(wechat, new RateLimiter(), new WechatTestAccounts(store, "bound"));
      var start = context(store,"/api/mini/wechat/login",obj("code","code"),null);
      service.handle(start,service.exchange(start));
      var response = parse(((MockHttpServletResponse)start.response).getContentAsString());
      String ticket = str(response.get("ticket"));
      assertEquals(1,store.rows("users").size());
      assertFalse(write(response).contains("real-scoped-identity"));
      var body=obj("ticket",ticket,"action","bind","username","web_user","password","wrong");
      assertEquals(401,assertThrows(ApiException.class,()->service.handle(context(store,"/api/mini/wechat/complete",body,null),null)).status);
      assertTrue(store.rows("wechatBindings").isEmpty());
      body.put("password","MiniSecret2026!");
      var finish=context(store,"/api/mini/wechat/complete",body,null);
      service.handle(finish,null);
      var result=parse(((MockHttpServletResponse)finish.response).getContentAsString());
      assertEquals("web-user",map(result.get("account")).get("id"));
      assertEquals("approved",map(result.get("account")).get("scoutStatus"));
      assertEquals(java.util.List.of("nmu1"),map(result.get("account")).get("bookmarks"));
      assertEquals(1,store.rows("users").size());
      assertEquals(401,assertThrows(ApiException.class,()->service.handle(context(store,"/api/mini/wechat/complete",body,null),null)).status,"Ticket cannot be replayed");
      // A different unbound identity can explicitly create a regular shared account.
      var createStart=context(store,"/api/mini/wechat/login",obj("code","new-code"),null);
      service.handle(createStart,"new-scoped-identity");
      String createTicket=str(parse(((MockHttpServletResponse)createStart.response).getContentAsString()).get("ticket"));
      var create=context(store,"/api/mini/wechat/complete",obj("ticket",createTicket,"action","create","username","new_web_user","nickname","新同学","password","MiniSecret2026!"),null);
      service.handle(create,null);
      var added=find(store.rows("users"),"username","new_web_user");
      assertEquals("none",added.get("scoutStatus"));
      assertTrue(Security.verifyPassword("MiniSecret2026!",added.get("passwordHash")));
      assertEquals(2,store.rows("wechatBindings").size());
      assertEquals(2,store.rows("users").size());
      // Binding never exposes a session key, OpenID, identity hash, or password hash.
      String publicResult=((MockHttpServletResponse)create.response).getContentAsString();
      for(String secret:java.util.List.of("session_key","identityHash","passwordHash","new-scoped-identity")) assertFalse(publicResult.contains(secret));
    }
  }

}
