package cn.campus;

import static cn.campus.Json.*;
import static cn.campus.Security.*;

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

  public boolean handle(ApiContext c) throws Exception {
    Map<String, Object> b = c.body, a = c.account;
    StoreRepository s = c.store;
    String r = c.path, ad = c.audience;
    boolean user = ad.equals("user");
    if (r.equals("/api/auth/me")) {
      c.send(obj("account", ApiContext.safeAccount(a), "audience", ad));
      return true;
    }
    if (c.route("/api/auth/login", "POST")) {
      limits.check(ad + ":login:" + c.ip, 12);
      String name = text(b.get("username"), 32).toLowerCase(Locale.ROOT);
      Map<String, Object> u =
          s.rows(user ? "users" : "admins").stream()
              .filter(x -> eq(x.get("username"), name) && !yes(x.get("deleted")))
              .findFirst()
              .orElse(null);
      if (u == null || !verifyPassword(text(b.get("password"), 129), u.get("passwordHash")))
        throw new ApiException("账号或密码不正确", 401);
      if (!yes(u.get("enabled"))) throw new ApiException("此账号已停用，请联系管理员", 403);
      c.login(u);
      c.send(obj("account", ApiContext.safeAccount(u)));
      return true;
    }
    if (c.route("/api/auth/logout", "POST")) {
      s.rows("auth").removeIf(x -> eq(x.get("hash"), digest(c.cookie())));
      c.clearCookie();
      s.save();
      c.send(obj("ok", true));
      return true;
    }
    if (c.route("/api/auth/register", "POST")) {
      if (!user) throw new ApiException("管理员不能自行注册", 404);
      limits.check("register:" + c.ip, 8);
      String name = username(b.get("username")),
          pass = password(b.get("password")),
          nick = text(b.get("nickname"), 24);
      if (nick.isEmpty()) throw new ApiException("请填写昵称");
      if (b.containsKey("inviteCode") && !(b.get("inviteCode") instanceof String))
        throw new ApiException("邀请码格式无效");
      String code = str(b.get("inviteCode")).trim().toUpperCase(Locale.ROOT);
      if (code.length() > 30) throw new ApiException("邀请码格式无效");
      Map<String, Object> invite = code.isEmpty() ? null : find(s.rows("invites"), "code", code);
      if (!code.isEmpty()
          && (invite == null
              || !yes(invite.get("enabled"))
              || expired(invite.get("expiresAt"))
              || integer(invite.get("used")) >= integer(invite.get("maxUses"))))
        throw new ApiException("邀请码无效、已过期或使用次数已满");
      if (s.rows("users").stream()
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
      s.rows("users").add(u);
      if (invite != null) {
        invite.put("used", integer(invite.get("used")) + 1);
        list(invite.get("usage")).add(obj("userId", u.get("id"), "at", u.get("createdAt")));
      }
      s.audit(
          u,
          invite == null ? "公开注册" : "邀请码注册",
          invite == null ? u.get("id") : invite.get("id"),
          invite == null ? "普通用户，可申请校园探索官" : "直接成为校园探索官",
          c.ip,
          ad);
      c.login(u);
      c.send(obj("account", ApiContext.safeAccount(u)), 201);
      return true;
    }
    if (c.route("/api/auth/preferences", "GET")) {
      c.need();
      c.send(
          obj(
              "preferences",
              Preferences.normalize(a.get("preferences")),
              "revision",
              integer(a.get("preferencesRevision"))));
      return true;
    }
    if (c.route("/api/auth/preferences", "PATCH")) {
      c.need();
      limits.check(a.get("id") + ":preferences", 60);
      Map<String, Object> out = Preferences.normalize(a.get("preferences"));
      out.putAll(Preferences.validate(b));
      a.put("preferences", out);
      a.put("preferencesRevision", integer(a.get("preferencesRevision")) + 1);
      c.audit("修改自己的设置", a.get("id"), String.join("、", b.keySet()));
      s.save();
      c.send(obj("preferences", out, "revision", a.get("preferencesRevision")));
      return true;
    }
    if (c.route("/api/auth/password", "PATCH")) {
      c.need();
      limits.check(a.get("id") + ":password", 5);
      if (!verifyPassword(b.get("currentPassword"), a.get("passwordHash")))
        throw new ApiException("当前密码不正确", 403);
      a.put("passwordHash", hashPassword(password(b.get("newPassword"))));
      s.rows("auth").removeIf(x -> eq(x.get("accountId"), a.get("id")));
      c.login(a);
      c.audit("修改自己的密码", a.get("id"), "");
      s.save();
      c.send(obj("ok", true));
      return true;
    }
    if (c.route("/api/auth/profile", "PATCH")) {
      c.need();
      limits.check(a.get("id") + ":profile", 10);
      if (b.isEmpty()
          || b.keySet().stream().anyMatch(k -> !List.of("nickname", "avatar").contains(k)))
        throw new ApiException("只能修改自己的昵称和头像");
      String key = user ? "nickname" : "name";
      int limit = user ? 24 : 30;
      String nick = b.containsKey("nickname") ? str(b.get("nickname")).trim() : str(a.get(key));
      if (b.containsKey("nickname")
          && (!(b.get("nickname") instanceof String)
              || nick.isEmpty()
              || nick.codePointCount(0, nick.length()) > limit
              || nick.matches("(?s).*[\\x00-\\x1f\\x7f].*")))
        throw new ApiException("昵称需要为 1—" + limit + " 个字");
      byte[] image =
          b.containsKey("avatar") && b.get("avatar") != null
              ? photo(b.get("avatar"), 1024 * 1024)
              : null;
      Path file = s.directory.resolve("avatars/" + ad + "-" + a.get("id") + ".jpg");
      if (image != null) {
        Path tmp = Path.of(file + ".tmp");
        Files.write(tmp, image);
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
      } else if (b.containsKey("avatar") && b.get("avatar") == null) Files.deleteIfExists(file);
      if (b.containsKey("avatar")) {
        a.put("hasAvatar", image != null);
        a.put("avatarVersion", integer(a.get("avatarVersion")) + 1);
      }
      if (!eq(a.get(key), nick) && user) {
        for (Map<String, Object> p : s.rows("points"))
          if (eq(p.get("authorId"), a.get("id"))) p.put("authorName", nick);
        s.bump();
      }
      a.put(key, nick);
      c.audit("修改自己的资料", a.get("id"), "");
      s.save();
      c.send(obj("account", ApiContext.safeAccount(a)));
      return true;
    }
    if (c.route("/api/auth/avatar", "GET")) {
      c.need();
      Path f = s.directory.resolve("avatars/" + ad + "-" + a.get("id") + ".jpg");
      if (!yes(a.get("hasAvatar")) || !Files.isRegularFile(f)) throw new ApiException("头像不存在", 404);
      c.response.setContentType("image/jpeg");
      c.response.setHeader("Cache-Control", "private, no-store");
      Files.copy(f, c.response.getOutputStream());
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
