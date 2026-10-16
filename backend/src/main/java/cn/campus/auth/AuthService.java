package cn.campus.auth;

import static cn.campus.auth.Security.*;
import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.common.RateLimiter;
import cn.campus.common.TimeSource;
import cn.campus.settings.Preferences;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
  private final RateLimiter limits;

  public AuthService(RateLimiter limits) {
    this.limits = limits;
  }

  public boolean handle(ApiContext context) throws Exception {
    Map<String, Object> body = context.body, account = context.account;
    StoreRepository store = context.store;
    String r = context.path, ad = context.audience;
    boolean user = ad.equals("user");
    if (r.equals("/api/auth/me")) {
      context.send(
          obj(
              "account",
              ApiContext.safeAccount(account),
              "audience",
              ad,
              "unreadNotifications",
              user && account != null
                  ? store.rows("notifications").stream()
                      .filter(
                          n -> eq(n.get("userId"), account.get("id")) && n.get("readAt") == null)
                      .count()
                  : 0));
      return true;
    }
    if (context.route("/api/auth/login", "POST")) {
      limits.check(ad + ":login:" + context.ip, 12);
      String name = text(body.get("username"), 32).toLowerCase(Locale.ROOT);
      Map<String, Object> u =
          store.rows(user ? "users" : "admins").stream()
              .filter(x -> eq(x.get("username"), name) && !yes(x.get("deleted")))
              .findFirst()
              .orElse(null);
      if (u == null || !verifyPassword(text(body.get("password"), 129), u.get("passwordHash")))
        throw new ApiException("账号或密码不正确", 401);
      if (!yes(u.get("enabled"))) throw new ApiException("此账号已停用，请联系管理员", 403);
      context.login(u);
      context.send(obj("account", ApiContext.safeAccount(u)));
      return true;
    }
    if (context.route("/api/auth/logout", "POST")) {
      store.rows("auth").removeIf(x -> eq(x.get("hash"), digest(context.credential())));
      context.clearCookie();
      store.save();
      context.send(obj("ok", true));
      return true;
    }
    if (context.route("/api/auth/register", "POST")) {
      if (!user) throw new ApiException("管理员不能自行注册", 404);
      limits.check("register:" + context.ip, 8);
      cn.campus.auth.dto.RegistrationRequest request =
          cn.campus.auth.dto.RegistrationRequest.from(body);
      String name = request.username(),
          pass = request.password(),
          nick = request.nickname(),
          code = request.inviteCode();
      Map<String, Object> invite =
          code.isEmpty() ? null : find(store.rows("invites"), "code", code);
      if (!code.isEmpty()
          && (invite == null
              || !yes(invite.get("enabled"))
              || expired(invite.get("expiresAt"))
              || integer(invite.get("used")) >= integer(invite.get("maxUses"))))
        throw new ApiException("邀请码无效、已过期或使用次数已满");
      if (store.rows("users").stream()
          .anyMatch(u -> eq(u.get("username"), name) && !yes(u.get("deleted"))))
        throw new ApiException("这个账号已注册");
      Map<String, Object> u =
          obj(
              "id",
              id(),
              "username",
              name,
              "nickname",
              nick,
              "passwordHash",
              hashPassword(pass),
              "enabled",
              true,
              "inviteId",
              invite == null ? null : invite.get("id"),
              "registrationMethod",
              invite == null ? "open" : "invite",
              "createdAt",
              StoreRepository.now(),
              "scoutStatus",
              invite == null ? "none" : "approved",
              "bookmarks",
              new ArrayList<>());
      store.rows("users").add(u);
      if (invite != null) {
        invite.put("used", integer(invite.get("used")) + 1);
        list(invite.get("usage")).add(obj("userId", u.get("id"), "at", u.get("createdAt")));
      }
      store.audit(
          u,
          invite == null ? "公开注册" : "邀请码注册",
          invite == null ? u.get("id") : invite.get("id"),
          invite == null ? "普通用户，可申请校园探索官" : "直接成为校园探索官",
          context.ip,
          ad);
      context.login(u);
      context.send(obj("account", ApiContext.safeAccount(u)), 201);
      return true;
    }
    if (context.route("/api/auth/preferences", "GET")) {
      context.need();
      context.send(
          obj(
              "preferences",
              Preferences.normalize(account.get("preferences")),
              "revision",
              integer(account.get("preferencesRevision"))));
      return true;
    }
    if (context.route("/api/auth/preferences", "PATCH")) {
      context.need();
      limits.check(account.get("id") + ":preferences", 60);
      Map<String, Object> out = Preferences.normalize(account.get("preferences"));
      out.putAll(Preferences.validate(body));
      account.put("preferences", out);
      account.put("preferencesRevision", integer(account.get("preferencesRevision")) + 1);
      context.audit("修改自己的设置", account.get("id"), String.join("、", body.keySet()));
      store.save();
      context.send(obj("preferences", out, "revision", account.get("preferencesRevision")));
      return true;
    }
    if (context.route("/api/auth/password", "PATCH")) {
      context.need();
      limits.check(account.get("id") + ":password", 5);
      if (!verifyPassword(body.get("currentPassword"), account.get("passwordHash")))
        throw new ApiException("当前密码不正确", 403);
      account.put("passwordHash", hashPassword(password(body.get("newPassword"))));
      store.rows("auth").removeIf(x -> eq(x.get("accountId"), account.get("id")));
      context.login(account);
      context.audit("修改自己的密码", account.get("id"), "");
      store.save();
      context.send(obj("ok", true));
      return true;
    }
    if (context.route("/api/auth/profile", "PATCH")) {
      context.need();
      limits.check(account.get("id") + ":profile", 10);
      if (body.isEmpty()
          || body.keySet().stream()
              .anyMatch(k -> !List.of("nickname", "avatar", "avatarPreset").contains(k)))
        throw new ApiException("只能修改自己的昵称和头像");
      String key = user ? "nickname" : "name";
      int limit = user ? 24 : 30;
      String nick =
          body.containsKey("nickname") ? str(body.get("nickname")).trim() : str(account.get(key));
      if (body.containsKey("nickname")
          && (!(body.get("nickname") instanceof String)
              || nick.isEmpty()
              || nick.codePointCount(0, nick.length()) > limit
              || nick.matches("(?s).*[\\x00-\\x1f\\x7f].*")))
        throw new ApiException("昵称需要为 1—" + limit + " 个字");
      if (body.containsKey("avatarPreset") && body.containsKey("avatar"))
        throw new ApiException("请选择一种头像方式");
      if (body.containsKey("avatarPreset")
          && (!(body.get("avatarPreset") instanceof String)
              || !AvatarPresets.IDS.contains(str(body.get("avatarPreset")))))
        throw new ApiException("请选择有效的预设头像");
      byte[] image =
          body.containsKey("avatar") && body.get("avatar") != null
              ? photo(body.get("avatar"), 1024 * 1024)
              : null;
      Path file = store.directory.resolve("avatars/" + ad + "-" + account.get("id") + ".jpg");
      if (image != null) {
        Path tmp = Path.of(file + ".tmp");
        Files.write(tmp, image);
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
      } else if (body.containsKey("avatarPreset")
          || (body.containsKey("avatar") && body.get("avatar") == null)) Files.deleteIfExists(file);
      if (body.containsKey("avatar") || body.containsKey("avatarPreset")) {
        if (body.containsKey("avatarPreset")) account.put("avatarPreset", body.get("avatarPreset"));
        else account.remove("avatarPreset");
        account.put("hasAvatar", image != null);
        account.put("avatarVersion", integer(account.get("avatarVersion")) + 1);
      }
      if (!eq(account.get(key), nick) && user) {
        for (Map<String, Object> p : store.rows("points"))
          if (eq(p.get("authorId"), account.get("id"))) p.put("authorName", nick);
        store.bump();
      }
      account.put(key, nick);
      context.audit("修改自己的资料", account.get("id"), "");
      store.save();
      context.send(obj("account", ApiContext.safeAccount(account)));
      return true;
    }
    if (context.route("/api/auth/avatar", "GET")) {
      context.need();
      Path f = store.directory.resolve("avatars/" + ad + "-" + account.get("id") + ".jpg");
      if (!yes(account.get("hasAvatar")) || !Files.isRegularFile(f))
        throw new ApiException("头像不存在", 404);
      context.response.setContentType("image/jpeg");
      context.response.setHeader("Cache-Control", "private, no-store");
      Files.copy(f, context.response.getOutputStream());
      return true;
    }
    return false;
  }

  private boolean expired(Object value) {
    try {
      return Instant.parse(str(value)).toEpochMilli() <= TimeSource.now();
    } catch (Exception e) {
      return true;
    }
  }
}
