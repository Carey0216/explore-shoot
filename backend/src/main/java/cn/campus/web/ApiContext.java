package cn.campus.web;

import static cn.campus.common.Json.*;

import cn.campus.ExploreApplication;
import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.common.TimeSource;
import cn.campus.settings.Preferences;
import cn.campus.storage.StoreRepository;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.*;

/** The account always comes from a server-side session, never from client-supplied roles. */
public final class ApiContext {
  public final HttpServletRequest request;
  public final HttpServletResponse response;
  public final StoreRepository store;
  public final String audience, path, method, ip;
  public final Map<String, Object> body, account, session;
  public final boolean miniProgram;
  private String issuedToken;
  private long tokenExpires;

  public ApiContext(
      HttpServletRequest req,
      HttpServletResponse res,
      StoreRepository repository,
      Map<String, Object> input) {
    request = req;
    response = res;
    store = repository;
    body = input;
    path = req.getRequestURI();
    method = req.getMethod();
    ip = req.getRemoteAddr();
    audience = req.getLocalPort() == ExploreApplication.port("ADMIN_PORT", 4176) ? "admin" : "user";
    miniProgram =
        req instanceof cn.campus.miniprogram.MiniProgramRequest && audience.equals("user");
    String cookie = credential();
    session =
        cookie.matches("[a-f0-9]{64}")
            ? store.rows("auth").stream()
                .filter(
                    s ->
                        eq(s.get("audience"), audience)
                            && (miniProgram
                                ? eq(s.get("client"), "miniprogram")
                                : !eq(s.get("client"), "miniprogram"))
                            && eq(s.get("hash"), Security.digest(cookie))
                            && integer(s.get("expires")) > TimeSource.now())
                .findFirst()
                .orElse(null)
            : null;
    account =
        session == null
            ? null
            : store.rows(audience.equals("user") ? "users" : "admins").stream()
                .filter(
                    a ->
                        eq(a.get("id"), session.get("accountId"))
                            && yes(a.get("enabled"))
                            && !yes(a.get("deleted")))
                .findFirst()
                .orElse(null);
  }

  public boolean route(String value, String verb) {
    return path.equals(value) && method.equals(verb);
  }

  public Map<String, Object> need() {
    if (account == null) throw new ApiException("请先登录", 401);
    return account;
  }

  public void superOnly() {
    need();
    if (!eq(account.get("role"), "super")) throw new ApiException("仅超级管理员可以管理管理员账号", 403);
  }

  public Map<String, Object> audit(String action, Object subject, String detail) {
    return store.audit(need(), action, subject, detail, ip, audience);
  }

  public String cookie() {
    String raw = Objects.toString(request.getHeader("Cookie"), "");
    for (String part : raw.split(";")) {
      String[] p = part.trim().split("=", 2);
      if (p.length == 2 && p[0].equals("nmu_" + audience)) return p[1];
    }
    return "";
  }

  public String credential() {
    if (!miniProgram) return cookie();
    String header = Objects.toString(request.getHeader("Authorization"), "");
    return header.matches("Bearer [a-f0-9]{64}") ? header.substring(7) : "";
  }

  public void clearCookie() {
    if (miniProgram) return;
    response.setHeader(
        "Set-Cookie", "nmu_" + audience + "=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
  }

  public void login(Map<String, Object> a) {
    String token = Security.token();
    tokenExpires = TimeSource.now() + 7 * 86400000L;
    store.rows("auth").removeIf(s -> integer(s.get("expires")) <= TimeSource.now());
    store
        .rows("auth")
        .add(
            obj(
                "hash",
                Security.digest(token),
                "audience",
                audience,
                "accountId",
                a.get("id"),
                "client",
                miniProgram ? "miniprogram" : "web",
                "expires",
                tokenExpires));
    if (miniProgram) issuedToken = token;
    else
      response.setHeader(
          "Set-Cookie",
          "nmu_" + audience + "=" + token + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800");
    store.save();
  }

  public static Map<String, Object> safeAccount(Map<String, Object> a) {
    if (a == null) return null;
    Map<String, Object> safe = copy(a);
    safe.remove("passwordHash");
    safe.put("preferences", Preferences.normalize(a.get("preferences")));
    safe.put("preferencesRevision", integer(a.get("preferencesRevision")));
    return safe;
  }

  public void send(Object value) throws IOException {
    send(value, 200);
  }

  public void send(Object value, int status) throws IOException {
    if (miniProgram && issuedToken != null && value instanceof Map<?, ?>) {
      var out = copy(map(value));
      out.putAll(obj("token", issuedToken, "tokenType", "Bearer", "expiresAt", tokenExpires));
      value = out;
    }
    response.setStatus(status);
    response.setContentType("application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response
        .getOutputStream()
        .write(write(value).getBytes(java.nio.charset.StandardCharsets.UTF_8));
  }

  public Map<String, Object> ownedMedia(Object id) {
    need();
    Map<String, Object> m =
        store.rows("media").stream()
            .filter(
                x ->
                    eq(x.get("id"), id)
                        && eq(x.get("ownerId"), account.get("id"))
                        && !yes(x.get("deleted")))
            .findFirst()
            .orElse(null);
    if (m == null) throw new ApiException("照片不存在或不属于当前账号");
    if (cn.campus.storage.MediaCleanupService.expired(store, m, TimeSource.now()))
      throw new ApiException("照片临时存储已过期，请重新上传", 410);
    return m;
  }
}
