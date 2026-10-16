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

  public MiniProgramService(WechatIdentityClient wechat, RateLimiter limits) {
    this.wechat = wechat;
    this.limits = limits;
  }

  /** Network exchange deliberately happens before acquiring the global data transaction lock. */
  public String exchange(ApiContext c) {
    if (!c.miniProgram
        || !(c.route("/api/mini/wechat/login", "POST") || c.route("/api/mini/wechat/bind", "POST")))
      return null;
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
              wechat.configured(),
              "apiVersion",
              1,
              "wechatBound",
              c.account != null
                  && c.store.rows("wechatBindings").stream()
                      .anyMatch(b -> eq(b.get("userId"), c.account.get("id")))));
      return true;
    }
    if (c.route("/api/mini/wechat/login", "POST")) {
      var binding = find(c.store.rows("wechatBindings"), "identityHash", identity);
      var user = binding == null ? null : find(c.store.rows("users"), "id", binding.get("userId"));
      if (user == null || yes(user.get("deleted")))
        throw new ApiException("此微信尚未绑定账号，请先用账号登录或注册，再在我的页面绑定", 409);
      if (!yes(user.get("enabled"))) throw new ApiException("此账号已停用，请联系管理员", 403);
      c.login(user);
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
