package cn.campus.miniprogram;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.common.RateLimiter;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class MiniProgramService {
  private final WechatIdentityClient wechat;
  private final RateLimiter limits;
  private final WechatTestAccounts tests;
  // Only a short-lived, one-use opaque ticket crosses the network. Restarting asks for wx.login again.
  private record Pending(String identity, long expires) {}
  private final Map<String, Pending> pending = new java.util.concurrent.ConcurrentHashMap<>();

  public MiniProgramService(
      WechatIdentityClient wechat, RateLimiter limits, WechatTestAccounts tests) {
    this.wechat = wechat;
    this.limits = limits;
    this.tests = tests;
  }

  /** Network exchange deliberately happens before acquiring the global data transaction lock. */
  public String exchange(ApiContext c) {
    if (!c.miniProgram
        || !(c.route("/api/mini/wechat/login", "POST") || c.route("/api/mini/wechat/bind", "POST")))
      return null;
    if (!tests.available()) throw new ApiException("微信登录暂未启用", 503);
    if (c.path.endsWith("/bind")) c.need();
    if (c.body.size() != 1 || !c.body.containsKey("code")) throw new ApiException("微信登录参数无效");
    limits.check("wechat:" + c.ip, 12);
    return wechat.identity(c.body.get("code"));
  }

  public boolean handle(ApiContext c, String identity) throws Exception {
    if (!c.miniProgram) return false;
    if (c.route("/api/mini/config", "GET")) {
      c.send(
          obj(
              "wechatLogin",
              wechat.configured() && tests.available(),
              "wechatTestLogin",
              tests.test(),
              "apiVersion",
              1,
              "wechatBound",
              c.account != null
                  && c.store.rows("wechatBindings").stream()
                      .anyMatch(b -> eq(b.get("userId"), c.account.get("id")))));
      return true;
    }
    if (c.route("/api/mini/wechat/login", "POST")) {
      if (tests.test()) {
        var user = tests.login(c.store, identity);
        c.login(user);
        c.send(obj("account", ApiContext.safeAccount(user), "testOnly", true));
        return true;
      }
      var binding = find(c.store.rows("wechatBindings"), "identityHash", identity);
      var user = binding == null ? null : find(c.store.rows("users"), "id", binding.get("userId"));
      if (binding == null) {
        long now = cn.campus.common.TimeSource.now();
        pending.entrySet().removeIf(e -> e.getValue().expires() <= now);
        if (pending.size() >= 2000) throw new ApiException("登录繁忙，请稍后重试", 503);
        String ticket = Security.token();
        pending.put(Security.digest(ticket), new Pending(identity, now + 5 * 60_000));
        c.send(obj("onboardingRequired", true, "ticket", ticket, "expiresIn", 300));
        return true;
      }
      if (user == null || yes(user.get("deleted")))
        throw new ApiException("原绑定账号不可用，请联系管理员", 403);
      if (!yes(user.get("enabled"))) throw new ApiException("此账号已停用，请联系管理员", 403);
      c.login(user);
      c.send(obj("account", ApiContext.safeAccount(user)));
      return true;
    }
    if (c.route("/api/mini/wechat/complete", "POST")) {
      if (!tests.available() || tests.test()) throw new ApiException("微信账号设置暂未启用", 503);
      limits.check("wechat-complete:" + c.ip, 12);
      if (!Set.of("ticket", "action", "username", "password", "nickname").containsAll(c.body.keySet()))
        throw new ApiException("微信账号设置参数无效");
      String ticket = str(c.body.get("ticket"));
      Pending attempt = ticket.matches("[a-f0-9]{64}") ? pending.get(Security.digest(ticket)) : null;
      if (attempt == null || attempt.expires() <= cn.campus.common.TimeSource.now())
        throw new ApiException("微信登录已过期，请重新点击微信登录", 401);
      limits.check("wechat-ticket:" + Security.digest(ticket), 6);
      String identityHash = attempt.identity();
      if (find(c.store.rows("wechatBindings"), "identityHash", identityHash) != null)
        throw new ApiException("微信绑定已更新，请重新登录", 409);
      String action = str(c.body.get("action"));
      Map<String, Object> user;
      if (action.equals("bind")) {
        String name = Security.text(c.body.get("username"), 32).toLowerCase(Locale.ROOT);
        user = c.store.rows("users").stream()
            .filter(u -> eq(u.get("username"), name) && !yes(u.get("deleted"))).findFirst().orElse(null);
        if (user == null || !Security.verifyPassword(Security.text(c.body.get("password"), 129), user.get("passwordHash")))
          throw new ApiException("账号或密码不正确", 401);
        if (!yes(user.get("enabled")) || WechatTestAccounts.account(user))
          throw new ApiException("此账号不可绑定，请联系管理员", 403);
        if (c.store.rows("wechatBindings").stream().anyMatch(b -> eq(b.get("userId"), user.get("id"))))
          throw new ApiException("此账号已绑定其他微信，请先解除原绑定", 409);
      } else if (action.equals("create")) {
        limits.check("register:" + c.ip, 8);
        var request = cn.campus.auth.dto.RegistrationRequest.from(c.body);
        if (c.store.rows("users").stream().anyMatch(u -> eq(u.get("username"), request.username()) && !yes(u.get("deleted"))))
          throw new ApiException("这个账号已注册，请绑定已有账号");
        user = obj("id", Security.id(), "username", request.username(), "nickname", request.nickname(),
            "passwordHash", Security.hashPassword(request.password()), "enabled", true,
            "registrationMethod", "wechat", "scoutStatus", "none", "bookmarks", new ArrayList<>(),
            "createdAt", StoreRepository.now());
        c.store.rows("users").add(user);
      } else throw new ApiException("请选择绑定已有账号或创建新账号");
      c.store.rows("wechatBindings").add(obj("id", Security.id(), "identityHash", identityHash,
          "userId", user.get("id"), "createdAt", StoreRepository.now()));
      c.store.audit(user, action.equals("bind") ? "绑定微信登录" : "微信创建账号", user.get("id"), "网页与小程序共用账号", c.ip, "user");
      c.login(user);
      pending.remove(Security.digest(ticket));
      c.send(obj("account", ApiContext.safeAccount(user)));
      return true;
    }
    if (c.route("/api/mini/wechat/bind", "POST")) {
      c.need();
      if (identity == null) throw new ApiException("微信登录凭证无效", 401);
      var existing = find(c.store.rows("wechatBindings"), "identityHash", identity);
      if (existing != null && !eq(existing.get("userId"), c.account.get("id")))
        throw new ApiException("此微信已绑定其他账号", 409);
      if (c.store.rows("wechatBindings").stream()
          .anyMatch(
              b ->
                  eq(b.get("userId"), c.account.get("id")) && !eq(b.get("identityHash"), identity)))
        throw new ApiException("此账号已绑定其他微信，请先解除原绑定", 409);
      if (existing == null) {
        c.store
            .rows("wechatBindings")
            .add(
                obj(
                    "id",
                    Security.id(),
                    "identityHash",
                    identity,
                    "userId",
                    c.account.get("id"),
                    "createdAt",
                    StoreRepository.now()));
        c.audit("绑定微信登录", c.account.get("id"), "小程序");
        c.store.save();
      }
      c.send(obj("ok", true));
      return true;
    }
    if (c.route("/api/mini/wechat/unbind", "POST")) {
      c.need();
      limits.check(c.account.get("id") + ":wechat-unbind", 5);
      if (c.body.size() != 1
          || !Security.verifyPassword(c.body.get("password"), c.account.get("passwordHash")))
        throw new ApiException("请输入正确的账号密码以解除微信绑定", 403);
      c.store.rows("wechatBindings").removeIf(b -> eq(b.get("userId"), c.account.get("id")));
      c.store
          .rows("auth")
          .removeIf(
              s ->
                  eq(s.get("audience"), "user")
                      && eq(s.get("accountId"), c.account.get("id"))
                      && eq(s.get("client"), "miniprogram"));
      c.audit("解除微信登录", c.account.get("id"), "小程序会话已失效");
      c.store.save();
      c.send(obj("ok", true));
      return true;
    }
    return false;
  }
}
