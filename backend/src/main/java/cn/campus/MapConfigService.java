package cn.campus;

import static cn.campus.Json.*;
import static cn.campus.Security.*;

import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class MapConfigService {
  private final Map<String, Map<String, Object>> grants = new HashMap<>();
  private final RateLimiter limits;
  private static final Map<String, String> FIELDS =
      Map.of("tencent", "tencentKey", "amap", "amapKey", "baidu", "baiduKey");

  public MapConfigService(RateLimiter limits) {
    this.limits = limits;
  }

  public static Map<String, Object> publicMap(Map<String, Object> settings) {
    String
        provider =
            FIELDS.containsKey(str(settings.get("mapProvider")))
                ? str(settings.get("mapProvider"))
                : "tencent",
        key = str(settings.get(FIELDS.get(provider)));
    Map<String, Object> result =
        obj("provider", provider, "configured", !key.isEmpty(), FIELDS.get(provider), key);
    if (provider.equals("amap")) result.put("amapProxy", true);
    return result;
  }

  private void requireSuper(ApiContext c) {
    c.need();
    if (!eq(c.account.get("role"), "super")) throw new ApiException("仅超级管理员可访问地图配置", 403);
  }

  private Map<String, Object> verify(ApiContext c, Object token) {
    requireSuper(c);
    Map<String, Object> g = token instanceof String ? grants.get(digest(str(token))) : null,
        verifier = g == null ? null : find(c.store.rows("admins"), "id", g.get("verifier"));
    if (g == null
        || !eq(g.get("accountId"), c.account.get("id"))
        || !eq(g.get("session"), c.session.get("hash"))
        || !eq(g.get("ip"), c.ip)
        || !eq(g.get("hash"), c.account.get("passwordHash"))
        || integer(g.get("expires")) <= TimeSource.now()
        || verifier == null
        || !eq(verifier.get("role"), "super")
        || !yes(verifier.get("enabled"))
        || yes(verifier.get("deleted"))
        || !eq(verifier.get("passwordHash"), g.get("verifierHash")))
      throw new ApiException("地图配置验证已失效，请重新验证超级管理员", 403);
    return g;
  }

  public boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("admin")) return false;
    Map<String, Object> b = c.body;
    StoreRepository s = c.store;
    if (c.route("/api/admin/map-config/unlock", "POST")) {
      requireSuper(c);
      limits.check(c.ip + ":map-unlock", 5);
      String name = str(b.get("username")).trim().toLowerCase(Locale.ROOT);
      Map<String, Object> verifier =
          s.rows("admins").stream()
              .filter(
                  a ->
                      eq(a.get("username"), name)
                          && eq(a.get("role"), "super")
                          && yes(a.get("enabled"))
                          && !yes(a.get("deleted")))
              .findFirst()
              .orElse(null);
      if (verifier == null
          || !(b.get("password") instanceof String)
          || str(b.get("password")).length() > 128
          || !verifyPassword(b.get("password"), verifier.get("passwordHash")))
        throw new ApiException("超级管理员账号或密码不正确", 403);
      grants.entrySet().removeIf(e -> integer(e.getValue().get("expires")) <= TimeSource.now());
      if (grants.size() >= 200) throw new ApiException("验证请求过多，请稍后重试", 429);
      String token = token();
      long expires = TimeSource.now() + 3 * 60000;
      grants.put(
          digest(token),
          obj(
              "accountId",
              c.account.get("id"),
              "session",
              c.session.get("hash"),
              "ip",
              c.ip,
              "hash",
              c.account.get("passwordHash"),
              "verifier",
              verifier.get("id"),
              "verifierHash",
              verifier.get("passwordHash"),
              "expires",
              expires));
      c.audit("验证地图配置权限", "map", "验证者 ID " + verifier.get("id"));
      s.save();
      c.send(obj("token", token, "expiresAt", expires, "verifiedBy", verifier.get("id")));
      return true;
    }
    if (c.route("/api/admin/map-config/read", "POST")) {
      verify(c, b.get("verification"));
      Map<String, Object> settings = s.settings();
      c.send(
          obj(
              "mapProvider",
              settings.get("mapProvider"),
              "tencentKey",
              str(settings.get("tencentKey")),
              "amapKey",
              str(settings.get("amapKey")),
              "amapSecurityConfigured",
              !str(settings.get("amapSecurity")).isEmpty(),
              "baiduKey",
              str(settings.get("baiduKey"))));
      return true;
    }
    if (c.route("/api/admin/map-config/lock", "POST")) {
      requireSuper(c);
      if (b.get("verification") instanceof String)
        grants.remove(digest(str(b.get("verification"))));
      c.send(obj("ok", true));
      return true;
    }
    if (c.route("/api/admin/settings", "PATCH")) {
      Map<String, Object> grant = verify(c, b.get("verification"));
      if (b.keySet().stream()
          .anyMatch(
              k ->
                  !List.of(
                          "verification",
                          "mapProvider",
                          "tencentKey",
                          "amapKey",
                          "amapSecurity",
                          "baiduKey",
                          "activate",
                          "clearAmapSecurity")
                      .contains(k))) throw new ApiException("地图配置字段无效");
      String provider = str(b.get("mapProvider"));
      if (!FIELDS.containsKey(provider)) throw new ApiException("地图服务无效");
      if (b.containsKey("activate") && !(b.get("activate") instanceof Boolean))
        throw new ApiException("启用选项无效");
      String field = FIELDS.get(provider),
          value = str(b.get(field)).trim(),
          regex =
              switch (provider) {
                case "tencent" -> "[A-Z0-9]{5}(?:-[A-Z0-9]{5}){5}";
                case "amap" -> "[a-fA-F0-9]{32}";
                default -> "[a-zA-Z0-9]{16,64}";
              };
      if (!(b.get(field) instanceof String)
          || str(b.get(field)).length() > 100
          || !value.isEmpty() && !value.matches(regex)) throw new ApiException("地图 Key 格式无效");
      Map<String, Object> update = obj(field, value);
      if (provider.equals("amap")) {
        if (b.containsKey("clearAmapSecurity") && !(b.get("clearAmapSecurity") instanceof Boolean))
          throw new ApiException("安全密钥选项无效");
        if (b.containsKey("amapSecurity") && !(b.get("amapSecurity") instanceof String))
          throw new ApiException("高德安全密钥格式无效");
        if (!str(b.get("amapSecurity")).isEmpty()) {
          if (!str(b.get("amapSecurity")).trim().matches("[a-fA-F0-9]{32}"))
            throw new ApiException("高德安全密钥格式无效");
          update.put("amapSecurity", str(b.get("amapSecurity")).trim());
        }
        if (yes(b.get("clearAmapSecurity"))) update.put("amapSecurity", "");
        if (!Boolean.FALSE.equals(b.get("activate"))
            && !value.isEmpty()
            && str(update.getOrDefault("amapSecurity", s.settings().get("amapSecurity"))).isEmpty())
          throw new ApiException("启用高德需要配置安全密钥");
      }
      s.settings().putAll(update);
      if (!Boolean.FALSE.equals(b.get("activate"))) s.settings().put("mapProvider", provider);
      s.bump();
      c.audit("地图服务配置", "map", provider + " · 验证者 ID " + grant.get("verifier"));
      s.save();
      c.send(
          obj(
              "ok",
              true,
              "provider",
              provider,
              "configured",
              !value.isEmpty(),
              "verifiedBy",
              grant.get("verifier")));
      return true;
    }
    return false;
  }
}
