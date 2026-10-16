package cn.campus.miniprogram;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.util.*;
import org.springframework.stereotype.Service;

/** Disposable WeChat identities have their own namespace; existing accounts are never converted. */
@Service
public class WechatTestAccounts {
  private final String mode;

  @org.springframework.beans.factory.annotation.Autowired
  public WechatTestAccounts(StoreRepository store) {
    this(store, System.getenv().getOrDefault("WECHAT_LOGIN_MODE", "bound"));
  }

  WechatTestAccounts(StoreRepository store, String mode) {
    if (!Set.of("off", "bound", "test", "production").contains(mode))
      throw new IllegalStateException("WECHAT_LOGIN_MODE 配置无效");
    this.mode = mode;
    if (mode.equals("production") && hasData(store))
      throw new IllegalStateException(
          "正式微信登录前请停服备份，并运行 --tool=retire-wechat-test --apply 清除测试账号及关联数据");
    store.wechatTestLoginEnabled = test();
  }

  public boolean available() {
    return !mode.equals("off");
  }

  public boolean test() {
    return mode.equals("test");
  }

  public static boolean account(Map<String, Object> row) {
    return row != null
        && yes(row.get("wechatTestAccount"))
        && eq(row.get("registrationMethod"), "wechat-test");
  }

  public static boolean hasData(StoreRepository store) {
    return store.rows("users").stream().anyMatch(WechatTestAccounts::account)
        || !store.rows("wechatTestBindings").isEmpty()
        || !store.rows("pendingWechatTestDeletes").isEmpty();
  }

  public Map<String, Object> login(StoreRepository store, String identity) {
    if (!test() || identity == null || identity.isBlank()) throw new ApiException("微信测试登录未启用", 403);
    var binding = find(store.rows("wechatTestBindings"), "identityHash", identity);
    if (binding != null) {
      var user = find(store.rows("users"), "id", binding.get("userId"));
      if (!account(user) || !yes(user.get("enabled")) || yes(user.get("deleted")))
        throw new ApiException("此测试账号已停用", 403);
      return user;
    }
    String id = Security.id(), username = "wx_test_" + id.replace("-", "").substring(0, 16);
    if (find(store.rows("users"), "username", username) != null)
      throw new ApiException("测试账号创建冲突，请重试", 409);
    var user =
        obj(
            "id",
            id,
            "username",
            username,
            "nickname",
            "微信测试用户",
            "passwordHash",
            Security.hashPassword(Security.token()),
            "enabled",
            true,
            "registrationMethod",
            "wechat-test",
            "wechatTestAccount",
            true,
            "scoutStatus",
            "none",
            "bookmarks",
            new ArrayList<>(),
            "createdAt",
            StoreRepository.now());
    store.rows("users").add(user);
    store
        .rows("wechatTestBindings")
        .add(
            obj(
                "id",
                Security.id(),
                "identityHash",
                identity,
                "userId",
                id,
                "createdAt",
                StoreRepository.now()));
    return user;
  }

  /**
   * Test identities can try private features without submitting content to the public community.
   */
  public static void checkMutation(ApiContext c) {
    if (!account(c.account) || List.of("GET", "HEAD").contains(c.method)) return;
    boolean allowed =
        c.route("/api/mini/wechat/login", "POST")
            || c.route("/api/auth/logout", "POST")
            || c.route("/api/auth/profile", "PATCH")
            || c.route("/api/auth/preferences", "PATCH")
            || c.route("/api/media", "POST")
            || c.route("/api/bookmarks", "POST")
            || c.route("/api/notifications/read", "POST")
            || c.route("/api/checkins", "POST") && !yes(c.body.get("shareToWall"))
            || c.method.equals("DELETE") && c.path.matches("/api/(media|checkins)/[a-f0-9-]+")
            || c.method.equals("PUT") && c.path.matches("/api/points/[a-z0-9-]+/reaction");
    if (!allowed) throw new ApiException("微信测试账号仅体验私密功能，不提交公开作品、举报或探索官申请", 403);
  }
}
