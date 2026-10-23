package cn.campus.maps;

import static cn.campus.common.Json.*;

import cn.campus.common.*;
import cn.campus.web.ApiContext;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import org.springframework.stereotype.Service;

/** Native basemap stays WeChat's map. Vendor web-service keys never leave this server. */
@Service
public class MiniMapRouting {
  static final Map<String, String> KEYS =
      Map.of("tencent", "miniTencentKey", "amap", "miniAmapKey", "baidu", "miniBaiduKey");
  private final RateLimiter limits;

  interface Transport {
    Map<String, Object> get(URI uri) throws Exception;
  }

  private final Transport transport;

  @org.springframework.beans.factory.annotation.Autowired
  public MiniMapRouting(RateLimiter limits) {
    this(limits, MiniMapRouting::fetch);
  }

  MiniMapRouting(RateLimiter limits, Transport transport) {
    this.limits = limits;
    this.transport = transport;
  }

  static String provider(Map<String, Object> settings) {
    String p = str(settings.get("miniMapProvider"));
    return KEYS.containsKey(p) ? p : "tencent";
  }

  static String key(Map<String, Object> settings, String provider) {
    String value = str(settings.get(KEYS.get(provider)));
    return value.isEmpty() && provider.equals("tencent") ? str(settings.get("tencentKey")) : value;
  }

  public static Map<String, Object> config(Map<String, Object> settings) {
    String provider = provider(settings);
    return obj(
        "provider",
        provider,
        "nativeBasemap",
        "wechat",
        "configured",
        !key(settings, provider).isEmpty(),
        "revision",
        integer(settings.get("miniMapRevision")),
        "keyConfigured",
        obj(
            "tencent",
            !key(settings, "tencent").isEmpty(),
            "amap",
            !key(settings, "amap").isEmpty(),
            "baidu",
            !key(settings, "baidu").isEmpty()));
  }

  public boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("user")) return false;
    if (c.route("/api/maps/mini-config", "GET")) {
      try (var ignored = c.store.readAccess()) {
        c.send(config(c.store.settings()));
      }
      return true;
    }
    if (!c.route("/api/maps/walking", "POST")) return false;
    if (!c.miniProgram) throw new ApiException("请在小程序中使用此路线服务", 404);
    String provider, key;
    try (var ignored = c.store.readAccess()) {
      c.need();
      cn.campus.settings.InteractionFeatures.guard(c);
      provider = provider(c.store.settings());
      key = key(c.store.settings(), provider);
    }
    limits.check("mini-walking:" + c.account.get("id"), 30);
    if (!c.body.keySet().equals(Set.of("start", "target"))) throw new ApiException("路线参数无效");
    var start = coordinate(c.body.get("start"));
    var target = coordinate(c.body.get("target"));
    if (key.isEmpty()) throw new ApiException("所选小程序地图服务尚未配置，请联系管理员", 503);
    Map<String, Object> result;
    try {
      result = normalize(provider, transport.get(endpoint(provider, key, start, target)));
    } catch (ApiException e) {
      throw e;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new ApiException("路线请求已取消", 503);
    } catch (Exception e) {
      throw new ApiException("地图路线服务连接失败，请稍后重试", 502);
    }
    // Permissions and active configuration may have changed while the vendor was responding.
    try (var ignored = c.store.readAccess()) {
      var current =
          map(
              c.store.rows("users").stream()
                  .filter(u -> eq(u.get("id"), c.account.get("id")))
                  .findFirst()
                  .orElse(null));
      if (current.isEmpty() || !yes(current.get("enabled")) || yes(current.get("deleted")))
        throw new ApiException("账号状态已改变，请重新登录", 401);
      if (c.store.indexed("auth", "hash", str(c.session.get("hash"))).stream()
          .noneMatch(
              s ->
                  eq(s.get("hash"), c.session.get("hash"))
                      && integer(s.get("expires")) > TimeSource.now()))
        throw new ApiException("登录已失效，请重新登录", 401);
      cn.campus.settings.InteractionFeatures.guard(c);
      if (!provider.equals(provider(c.store.settings()))
          || !key.equals(key(c.store.settings(), provider)))
        throw new ApiException("地图配置已更新，请重新规划", 409);
    }
    c.send(result);
    return true;
  }

  static List<Double> coordinate(Object raw) {
    var p = map(raw);
    if (!p.keySet().equals(Set.of("lng", "lat"))
        || !(p.get("lng") instanceof Number)
        || !(p.get("lat") instanceof Number)) throw new ApiException("路线坐标无效");
    double lng = num(p.get("lng")), lat = num(p.get("lat"));
    if (!Double.isFinite(lng)
        || !Double.isFinite(lat)
        || lng < 73
        || lng > 136
        || lat < 3
        || lat > 54) throw new ApiException("路线坐标超出服务范围");
    return List.of(lng, lat);
  }

  static URI endpoint(String provider, String key, List<Double> a, List<Double> b) {
    var query = new LinkedHashMap<String, String>();
    String base;
    if (provider.equals("tencent")) {
      base = "https://apis.map.qq.com/ws/direction/v1/walking/";
      query.put("key", key);
      query.put("from", a.get(1) + "," + a.get(0));
      query.put("to", b.get(1) + "," + b.get(0));
      query.put("output", "json");
    } else if (provider.equals("amap")) {
      base = "https://restapi.amap.com/v3/direction/walking";
      query.put("key", key);
      query.put("origin", a.get(0) + "," + a.get(1));
      query.put("destination", b.get(0) + "," + b.get(1));
      query.put("output", "JSON");
    } else {
      base = "https://api.map.baidu.com/directionlite/v1/walking";
      query.put("ak", key);
      query.put("origin", a.get(1) + "," + a.get(0));
      query.put("destination", b.get(1) + "," + b.get(0));
      query.put("coord_type", "gcj02");
      query.put("ret_coordtype", "gcj02");
      query.put("steps_info", "1");
    }
    return URI.create(
        base
            + "?"
            + query.entrySet().stream()
                .map(
                    e -> e.getKey() + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(java.util.stream.Collectors.joining("&")));
  }

  private static Map<String, Object> fetch(URI uri) throws Exception {
    var response =
        HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(4))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build()
            .send(
                HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(8)).GET().build(),
                HttpResponse.BodyHandlers.ofInputStream());
    try (var body = response.body()) {
      byte[] bytes = body.readNBytes(2 * 1024 * 1024 + 1);
      if (response.statusCode() != 200 || bytes.length > 2 * 1024 * 1024)
        throw new ApiException("地图路线服务暂不可用", 502);
      return parse(new String(bytes, StandardCharsets.UTF_8));
    }
  }

  static Map<String, Object> normalize(String provider, Map<String, Object> raw) {
    boolean tencent = provider.equals("tencent"), amap = provider.equals("amap");
    if (amap ? !str(raw.get("status")).equals("1") : integer(raw.getOrDefault("status", -1)) != 0)
      throw new ApiException("所选地图服务未返回可用路线，请检查 Key 权限、额度或起终点", 502);
    var routes = rows(map(raw.get(amap ? "route" : "result")).get(amap ? "paths" : "routes"));
    if (routes.isEmpty()) throw new ApiException("此起终点暂无可用步行路线", 422);
    var route = routes.getFirst();
    var path = new ArrayList<List<Double>>();
    var steps = new ArrayList<Map<String, Object>>();
    if (tencent) {
      var encoded = list(route.get("polyline"));
      if (encoded.size() < 4 || encoded.size() % 2 != 0 || encoded.size() > 40000)
        throw new ApiException("地图路线数据不可用", 502);
      double lat = 0, lng = 0;
      for (int i = 0; i < encoded.size(); i += 2) {
        lat = i == 0 ? number(encoded.get(i)) : lat + number(encoded.get(i)) / 1e6;
        lng = i == 0 ? number(encoded.get(i + 1)) : lng + number(encoded.get(i + 1)) / 1e6;
        path.add(point(lng, lat));
      }
      for (var s : rows(route.get("steps")))
        steps.add(
            obj(
                "instruction",
                instruction(s.get("instruction")),
                "road",
                str(s.get("road_name")),
                "distance",
                number(s.getOrDefault("distance", 0)),
                "indices",
                s.get("polyline_idx")));
    } else {
      for (var s : rows(route.get("steps"))) {
        int from = Math.max(0, path.size() - 1);
        String line = str(s.get(amap ? "polyline" : "path"));
        if (line.length() > 1000000) throw new ApiException("地图路线数据过大", 502);
        for (String pair : line.split(";")) {
          String[] xy = pair.split(",");
          if (xy.length != 2) throw new ApiException("地图路线数据不可用", 502);
          var p = point(number(xy[0]), number(xy[1]));
          if (path.isEmpty() || !path.getLast().equals(p)) path.add(p);
          if (path.size() > 20000) throw new ApiException("地图路线数据过大", 502);
        }
        steps.add(
            obj(
                "instruction",
                instruction(s.get("instruction")),
                "road",
                str(s.get(amap ? "road" : "road_name")),
                "distance",
                number(s.getOrDefault("distance", 0)),
                "indices",
                List.of(from * 2, Math.max(0, path.size() - 1) * 2)));
      }
    }
    double length = number(route.get("distance")),
        duration = number(route.get("duration")) / (tencent ? 1 : 60);
    if (path.size() < 2 || length < 0 || duration < 0) throw new ApiException("地图路线数据不可用", 502);
    return obj(
        "available",
        true,
        "provider",
        provider,
        "coordinateSystem",
        "GCJ02",
        "path",
        path,
        "length",
        length,
        "duration",
        duration,
        "steps",
        steps);
  }

  private static String instruction(Object value) {
    return str(value)
        .replaceAll("<[^>]*>", "")
        .replace("&nbsp;", " ")
        .replace("&gt;", ">")
        .replace("&lt;", "<");
  }

  private static double number(Object raw) {
    try {
      double n = (raw instanceof Number value ? value.doubleValue() : Double.parseDouble(str(raw)));
      if (!Double.isFinite(n)) throw new NumberFormatException();
      return n;
    } catch (Exception e) {
      throw new ApiException("地图路线数据不可用", 502);
    }
  }

  private static List<Double> point(double lng, double lat) {
    if (Math.abs(lng) > 180 || Math.abs(lat) > 90) throw new ApiException("地图路线坐标不可用", 502);
    return List.of(lng, lat);
  }
}
