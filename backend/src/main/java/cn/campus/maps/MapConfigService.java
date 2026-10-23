package cn.campus.maps;

import static cn.campus.auth.Security.*;
import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.common.RateLimiter;
import cn.campus.common.TimeSource;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
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
    if (!cn.campus.admin.AdminPermissions.has(c.account, "map-config.write"))
      throw new ApiException("仅超级管理员可访问地图配置", 403);
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
        || !cn.campus.admin.AdminPermissions.privileged(verifier)
        || !cn.campus.admin.AdminPermissions.has(verifier, "map-config.write")
        || !yes(verifier.get("enabled"))
        || yes(verifier.get("deleted"))
        || !eq(verifier.get("passwordHash"), g.get("verifierHash")))
      throw new ApiException("地图配置验证已失效，请重新验证超级管理员", 403);
    return g;
  }

  public boolean handle(ApiContext context) throws Exception {
    if (!context.audience.equals("admin")) return false;
    Map<String, Object> body = context.body;
    StoreRepository store = context.store;
    if (context.route("/api/admin/map-config/unlock", "POST")) {
      requireSuper(context);
      limits.check(context.ip + ":map-unlock", 5);
      String name = str(body.get("username")).trim().toLowerCase(Locale.ROOT);
      Map<String, Object> verifier =
          store.rows("admins").stream()
              .filter(
                  a ->
                      eq(a.get("username"), name)
                          && cn.campus.admin.AdminPermissions.privileged(a)
                          && cn.campus.admin.AdminPermissions.has(a, "map-config.write")
                          && yes(a.get("enabled"))
                          && !yes(a.get("deleted")))
              .findFirst()
              .orElse(null);
      if (verifier == null
          || !(body.get("password") instanceof String)
          || str(body.get("password")).length() > 128
          || !verifyPassword(body.get("password"), verifier.get("passwordHash")))
        throw new ApiException("超级管理员账号或密码不正确", 403);
      grants.entrySet().removeIf(e -> integer(e.getValue().get("expires")) <= TimeSource.now());
      if (grants.size() >= 200) throw new ApiException("验证请求过多，请稍后重试", 429);
      String token = token();
      long expires = TimeSource.now() + 3 * 60000;
      grants.put(
          digest(token),
          obj(
              "accountId",
              context.account.get("id"),
              "session",
              context.session.get("hash"),
              "ip",
              context.ip,
              "hash",
              context.account.get("passwordHash"),
              "verifier",
              verifier.get("id"),
              "verifierHash",
              verifier.get("passwordHash"),
              "expires",
              expires));
      context.audit("验证地图配置权限", "map", "验证者 ID " + verifier.get("id"));
      store.save();
      context.send(obj("token", token, "expiresAt", expires, "verifiedBy", verifier.get("id")));
      return true;
    }
    if (context.route("/api/admin/map-config/read", "POST")) {
      verify(context, body.get("verification"));
      Map<String, Object> settings = store.settings();
      context.send(
          obj(
              "mini",
              MiniMapRouting.config(settings),
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
    if (context.route("/api/admin/map-config/mini", "POST")) {
      var grant = verify(context, body.get("verification"));
      if (!Set.of(
              "verification",
              "revision",
              "provider",
              "miniTencentKey",
              "miniAmapKey",
              "miniBaiduKey")
          .containsAll(body.keySet())) throw new ApiException("小程序地图配置字段无效");
      if (!whole(body.get("revision"))
          || integer(body.get("revision")) != integer(store.settings().get("miniMapRevision")))
        throw new ApiException("小程序地图配置已更新，请重新载入", 409);
      String provider = str(body.get("provider"));
      if (!MiniMapRouting.KEYS.containsKey(provider)) throw new ApiException("小程序地图服务无效");
      var update = obj();
      for (var entry : MiniMapRouting.KEYS.entrySet()) {
        if (!body.containsKey(entry.getValue())) continue;
        if (!(body.get(entry.getValue()) instanceof String)) throw new ApiException("地图 Key 格式无效");
        String value = str(body.get(entry.getValue())).trim();
        if (value.isEmpty()) continue;
        String regex =
            switch (entry.getKey()) {
              case "tencent" -> "[A-Z0-9]{5}(?:-[A-Z0-9]{5}){5}";
              case "amap" -> "[a-fA-F0-9]{32}";
              default -> "[a-zA-Z0-9]{16,64}";
            };
        if (value.length() > 100 || !value.matches(regex)) throw new ApiException("地图 Key 格式无效");
        update.put(entry.getValue(), value);
      }
      var merged = copy(store.settings());
      merged.putAll(update);
      if (MiniMapRouting.key(merged, provider).isEmpty())
        throw new ApiException("请先填写所选服务的 Web 服务 Key");
      update.put("miniMapProvider", provider);
      update.put("miniMapRevision", integer(body.get("revision")) + 1);
      store.settings().putAll(update);
      store.bump();
      context.audit("小程序地图服务配置", "map", provider + " · 验证者 ID " + grant.get("verifier"));
      store.save();
      context.send(MiniMapRouting.config(store.settings()));
      return true;
    }
    if (context.route("/api/admin/map-config/lock", "POST")) {
      requireSuper(context);
      if (body.get("verification") instanceof String)
        grants.remove(digest(str(body.get("verification"))));
      context.send(obj("ok", true));
      return true;
    }
    if (context.route("/api/admin/settings", "PATCH")) {
      Map<String, Object> grant = verify(context, body.get("verification"));
      if (body.keySet().stream()
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
      String provider = str(body.get("mapProvider"));
      if (!FIELDS.containsKey(provider)) throw new ApiException("地图服务无效");
      if (body.containsKey("activate") && !(body.get("activate") instanceof Boolean))
        throw new ApiException("启用选项无效");
      String field = FIELDS.get(provider),
          value = str(body.get(field)).trim(),
          regex =
              switch (provider) {
                case "tencent" -> "[A-Z0-9]{5}(?:-[A-Z0-9]{5}){5}";
                case "amap" -> "[a-fA-F0-9]{32}";
                default -> "[a-zA-Z0-9]{16,64}";
              };
      if (!(body.get(field) instanceof String)
          || str(body.get(field)).length() > 100
          || !value.isEmpty() && !value.matches(regex)) throw new ApiException("地图 Key 格式无效");
      Map<String, Object> update = obj(field, value);
      if (provider.equals("amap")) {
        if (body.containsKey("clearAmapSecurity")
            && !(body.get("clearAmapSecurity") instanceof Boolean))
          throw new ApiException("安全密钥选项无效");
        if (body.containsKey("amapSecurity") && !(body.get("amapSecurity") instanceof String))
          throw new ApiException("高德安全密钥格式无效");
        if (!str(body.get("amapSecurity")).isEmpty()) {
          if (!str(body.get("amapSecurity")).trim().matches("[a-fA-F0-9]{32}"))
            throw new ApiException("高德安全密钥格式无效");
          update.put("amapSecurity", str(body.get("amapSecurity")).trim());
        }
        if (yes(body.get("clearAmapSecurity"))) update.put("amapSecurity", "");
        if (!Boolean.FALSE.equals(body.get("activate"))
            && !value.isEmpty()
            && str(update.getOrDefault("amapSecurity", store.settings().get("amapSecurity")))
                .isEmpty()) throw new ApiException("启用高德需要配置安全密钥");
      }
      store.settings().putAll(update);
      if (!Boolean.FALSE.equals(body.get("activate")))
        store.settings().put("mapProvider", provider);
      store.bump();
      context.audit("地图服务配置", "map", provider + " · 验证者 ID " + grant.get("verifier"));
      store.save();
      context.send(
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
