package cn.campus.point;

import static cn.campus.common.Json.*;

import cn.campus.common.*;
import cn.campus.settings.InteractionFeatures;
import cn.campus.web.ApiContext;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.stereotype.Service;

/** One public campus forecast, coalesced and cached; never queries a user's device location. */
@Service
public final class CampusWeatherService {
  private static volatile Map<String, Object> health =
      obj("status", "not-requested", "message", "本次进程尚未请求天气");

  public static Map<String, Object> health() {
    return cn.campus.common.Json.clone(health);
  }

  static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
  private final HttpClient client =
      HttpClient.newBuilder()
          .connectTimeout(Duration.ofSeconds(4))
          .followRedirects(HttpClient.Redirect.NEVER)
          .build();
  private Map<String, Object> cached;
  private String cachedKey = "", pendingKey = "", retryKey = "";
  private long fetchedAt, retryAfter;
  private CompletableFuture<Map<String, Object>> pending;

  public static Map<String, Object> configuration(cn.campus.storage.StoreRepository store) {
    var old = map(store.settings().get("campusWeather"));
    return obj(
        "provider",
        "open-meteo",
        "label",
        old.getOrDefault("label", "银川 · 西夏区"),
        "latitude",
        old.getOrDefault("latitude", 38.496),
        "longitude",
        old.getOrDefault("longitude", 106.136),
        "refreshMinutes",
        old.getOrDefault("refreshMinutes", 20),
        "revision",
        old.getOrDefault("revision", 0));
  }

  public boolean handleAdmin(ApiContext c) throws Exception {
    if (!c.audience.equals("admin") || !c.path.equals("/api/admin/weather")) return false;
    c.need();
    if (!cn.campus.admin.AdminPermissions.owner(c.account))
      throw new ApiException("此入口仅顶级管理员可管理", 403);
    if (c.method.equals("GET")) {
      c.send(configuration(c.store));
      return true;
    }
    if (!c.method.equals("PUT")) return false;
    var old = configuration(c.store);
    if (!whole(c.body.get("revision"))
        || integer(c.body.get("revision")) != integer(old.get("revision")))
      throw new ApiException("天气配置已更新，请重新载入", 409);
    RequestValues.fields(c.body, "revision", "label", "latitude", "longitude", "refreshMinutes");
    double lat = num(c.body.get("latitude")), lng = num(c.body.get("longitude"));
    if (!Double.isFinite(lat)
        || !Double.isFinite(lng)
        || lat < 38
        || lat > 39
        || lng < 105
        || lng > 107) throw new ApiException("天气查询位置须在银川校区周边");
    var saved =
        obj(
            "label",
            RequestValues.text(c.body, "label", "银川 · 西夏区", 30, true),
            "latitude",
            lat,
            "longitude",
            lng,
            "refreshMinutes",
            RequestValues.integer(c.body, "refreshMinutes", 20, 10, 120),
            "revision",
            integer(old.get("revision")) + 1);
    c.store.settings().put("campusWeather", saved);
    c.audit("调整校园天气", "weather", "公共校区位置与缓存周期已更新");
    c.store.save();
    c.send(configuration(c.store));
    return true;
  }

  // Called outside StoreRepository locks: external network must not block login or list loading.
  public boolean handleOutside(ApiContext c) throws Exception {
    if (c.audience.equals("admin") && c.route("/api/admin/weather/preview", "GET")) {
      Map<String, Object> config;
      try (var guard = c.store.readAccess()) {
        c.need();
        if (!cn.campus.admin.AdminPermissions.owner(c.account))
          throw new ApiException("仅顶级管理员可检查天气配置", 403);
        config = configuration(c.store);
      }
      c.send(forecast(config));
      return true;
    }
    if (!c.audience.equals("user")
        || !c.method.equals("GET")
        || !Set.of("/api/weather", "/api/photography/timing").contains(c.path)) return false;
    boolean timing = c.path.endsWith("/timing");
    Map<String, Object> config, spot = null;
    try (var guard = c.store.readAccess()) {
      InteractionFeatures.require(c.store, timing ? "photo-timing" : "weather");
      config = configuration(c.store);
      if (timing) {
        String id = Objects.toString(c.request.getParameter("spotId"), "");
        var selected = ShootingSpotService.published(c.store, id);
        if (selected == null) throw new ApiException("请选择已发布的真实机位", 404);
        spot = copy(selected);
        var point = find(c.store.rows("points"), "id", spot.get("pointId"));
        spot.put("pointOpen", point != null && yes(point.get("open")));
      }
    }
    var weather = forecast(config);
    Map<String, Object> result =
        timing ? recommend(weather, spot, Instant.ofEpochMilli(TimeSource.now())) : weather;
    try (var guard = c.store.readAccess()) {
      InteractionFeatures.require(c.store, timing ? "photo-timing" : "weather");
      if (timing && ShootingSpotService.published(c.store, spot.get("id")) == null)
        throw new ApiException("机位已下线，请重新选择", 404);
    }
    if (timing)
      try (var guard = c.store.readAccess()) {
        var selected = ShootingSpotService.published(c.store, spot.get("id"));
        if (selected == null) throw new ApiException("机位已下线，请重新选择", 404);
        result =
            recommend(
                weather,
                ShootingSpotService.publicView(c.store, selected),
                Instant.ofEpochMilli(TimeSource.now()));
      }
    c.send(result);
    return true;
  }

  public Map<String, Object> forecast(Map<String, Object> config) {
    String key = write(config);
    long now = TimeSource.now();
    CompletableFuture<Map<String, Object>> request;
    synchronized (this) {
      if (key.equals(cachedKey)
          && cached != null
          && now - fetchedAt < integer(config.get("refreshMinutes")) * 60000)
        return withAge(cached, false);
      if (now < retryAfter && key.equals(retryKey)) return fallback(config, now);
      if (pending == null || !key.equals(pendingKey)) {
        pendingKey = key;
        String url =
            "https://api.open-meteo.com/v1/forecast?latitude="
                + num(config.get("latitude"))
                + "&longitude="
                + num(config.get("longitude"))
                + "&current=temperature_2m,weather_code"
                + "&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset"
                + "&hourly=temperature_2m,cloud_cover,precipitation_probability,wind_speed_10m,weather_code"
                + "&timezone=Asia%2FShanghai&forecast_days=3&wind_speed_unit=kmh";
        pending =
            client
                .sendAsync(
                    HttpRequest.newBuilder(URI.create(url))
                        .timeout(Duration.ofSeconds(7))
                        .header("User-Agent", "JINGYU-Campus/8.1")
                        .GET()
                        .build(),
                    HttpResponse.BodyHandlers.ofString())
                .thenApply(
                    response -> {
                      if (response.statusCode() != 200 || response.body().length() > 200000)
                        throw new IllegalStateException("forecast unavailable");
                      var parsed =
                          normalize(
                              parse(response.body()),
                              config,
                              Instant.ofEpochMilli(TimeSource.now()));
                      health =
                          obj(
                              "status",
                              "ok",
                              "checkedAt",
                              Instant.ofEpochMilli(TimeSource.now()).toString(),
                              "provider",
                              "Open-Meteo");
                      synchronized (this) {
                        if (key.equals(pendingKey)) {
                          cached = parsed;
                          cachedKey = key;
                          fetchedAt = TimeSource.now();
                          retryAfter = 0;
                        }
                      }
                      return parsed;
                    });
      }
      request = pending;
    }
    try {
      return withAge(request.get(8, TimeUnit.SECONDS), false);
    } catch (Exception error) {
      health =
          obj(
              "status",
              "unavailable",
              "checkedAt",
              Instant.ofEpochMilli(TimeSource.now()).toString(),
              "message",
              "天气接口暂时不可用，已启用缓存或稍后重试");
      synchronized (this) {
        if (key.equals(pendingKey)) {
          retryAfter = TimeSource.now() + 60000;
          retryKey = key;
        }
        return fallback(config, TimeSource.now());
      }
    } finally {
      synchronized (this) {
        if (pending == request && request.isDone()) pending = null;
      }
    }
  }

  private Map<String, Object> fallback(Map<String, Object> config, long now) {
    if (cached != null
        && cachedKey.equals(write(config))
        && now - fetchedAt <= 90 * 60000
        && eq(cached.get("date"), Instant.ofEpochMilli(now).atZone(ZONE).toLocalDate().toString()))
      return withAge(cached, true);
    return obj(
        "available",
        false,
        "label",
        config.get("label"),
        "message",
        "天气暂时无法更新，稍后再试",
        "provider",
        "Open-Meteo",
        "sourceURL",
        "https://open-meteo.com/",
        "hours",
        List.of());
  }

  private static Map<String, Object> withAge(Map<String, Object> data, boolean stale) {
    var out = cn.campus.common.Json.clone(data);
    out.put("stale", stale);
    return out;
  }

  public static Map<String, Object> normalize(
      Map<String, Object> raw, Map<String, Object> config, Instant now) {
    var current = map(raw.get("current"));
    var daily = map(raw.get("daily"));
    var hourly = map(raw.get("hourly"));
    String date = now.atZone(ZONE).toLocalDate().toString();
    int day = list(daily.get("time")).indexOf(date);
    if (day < 0
        || !(current.get("temperature_2m") instanceof Number)
        || !str(current.get("time")).startsWith(date))
      throw new IllegalArgumentException("Forecast has no current campus day");
    double temperature = num(current.get("temperature_2m")),
        code = num(current.get("weather_code"));
    Instant observed = LocalDateTime.parse(str(current.get("time"))).atZone(ZONE).toInstant();
    if (!Double.isFinite(temperature)
        || !Double.isFinite(code)
        || code < 0
        || code > 99
        || Math.abs(Duration.between(observed, now).toMinutes()) > 180
        || numberAt(daily, "temperature_2m_min", day) > numberAt(daily, "temperature_2m_max", day))
      throw new IllegalArgumentException("Invalid current forecast");
    var hours = new ArrayList<Map<String, Object>>();
    var times = list(hourly.get("time"));
    for (int i = 0; i < Math.min(times.size(), 96); i++) {
      String t = str(times.get(i));
      Instant at = java.time.LocalDateTime.parse(t).atZone(ZONE).toInstant();
      hours.add(
          obj(
              "time",
              at.toString(),
              "temperature",
              numberAt(hourly, "temperature_2m", i),
              "cloud",
              numberAt(hourly, "cloud_cover", i),
              "rain",
              numberAt(hourly, "precipitation_probability", i),
              "wind",
              numberAt(hourly, "wind_speed_10m", i),
              "code",
              numberAt(hourly, "weather_code", i)));
    }
    return obj(
        "available",
        true,
        "label",
        config.get("label"),
        "date",
        date,
        "timezone",
        "Asia/Shanghai",
        "temperature",
        num(current.get("temperature_2m")),
        "high",
        numberAt(daily, "temperature_2m_max", day),
        "low",
        numberAt(daily, "temperature_2m_min", day),
        "code",
        current.get("weather_code"),
        "observedAt",
        str(current.get("time")) + "+08:00",
        "updatedAt",
        now.toString(),
        "hours",
        hours,
        "provider",
        "Open-Meteo",
        "sourceURL",
        "https://open-meteo.com/",
        "latitude",
        config.get("latitude"),
        "longitude",
        config.get("longitude"));
  }

  private static double numberAt(Map<String, Object> data, String field, int index) {
    var values = list(data.get(field));
    if (index >= values.size() || !Double.isFinite(num(values.get(index))))
      throw new IllegalArgumentException("Incomplete forecast");
    return num(values.get(index));
  }

  public static Map<String, Object> recommend(
      Map<String, Object> weather, Map<String, Object> spot, Instant now) {
    var out =
        obj(
            "spotId",
            spot.get("id"),
            "spotTitle",
            spot.get("title"),
            "pointId",
            spot.get("pointId"),
            "bearing",
            spot.get("bearing"),
            "weather",
            weather,
            "windows",
            new ArrayList<>(),
            "timezone",
            "Asia/Shanghai",
            "notice",
            "预报与太阳方向推算，未计入楼宇和树木遮挡；以现场通行与天气变化为准。");
    if (!yes(weather.get("available"))) {
      out.put("message", "天气暂不可用，暂不生成拍摄时机");
      return out;
    }
    if (!yes(spot.get("pointOpen")) || eq(spot.get("availability"), "closed")) {
      out.put("message", "地点当前关闭，开放后再安排拍摄");
      return out;
    }
    var candidates = new ArrayList<Map<String, Object>>();
    LocalDate today = now.atZone(ZONE).toLocalDate();
    double bearing = num(spot.get("bearing"));
    for (var hour : rows(weather.get("hours"))) {
      Instant at = Instant.parse(str(hour.get("time")));
      var local = at.atZone(ZONE);
      if (!local.toLocalDate().equals(today) || at.isBefore(now.plusSeconds(300))) continue;
      var sun = SolarPosition.at(local, num(spot.get("lat")), num(spot.get("lng")));
      if (sun.elevation() < 1
          || sun.elevation() > 65
          || num(hour.get("rain")) >= 60
          || num(hour.get("wind")) >= 40
          || num(hour.get("code")) >= 95) continue;
      var opening = rows(spot.get("openingWindows"));
      if (!opening.isEmpty()
          && (!PlanExecution.within(opening, local)
              || !PlanExecution.within(opening, local.plusMinutes(29)))) continue;
      String light = SolarPosition.lighting(bearing, sun.azimuth(), num(hour.get("cloud")));
      double score =
          100
              - Math.abs(sun.elevation() - 12)
              - num(hour.get("rain")) * .7
              - num(hour.get("wind")) * .4;
      if (light.equals("diffuse")) score -= 15;
      String label =
          switch (light) {
            case "front" -> "顺光";
            case "silhouette" -> "逆光 / 剪影";
            case "side" -> "侧光";
            case "diffuse" -> "柔和散射光";
            default -> "低角度自然光";
          };
      candidates.add(
          obj(
              "start",
              at.toString(),
              "end",
              at.plusSeconds(1800).toString(),
              "lighting",
              light,
              "label",
              label,
              "solarAzimuth",
              Math.round(sun.azimuth()),
              "solarElevation",
              Math.round(sun.elevation()),
              "rain",
              hour.get("rain"),
              "cloud",
              hour.get("cloud"),
              "score",
              score,
              "reason",
              light.equals("unknown")
                  ? "机位朝向待补充，可先观察光线方向"
                  : light.equals("diffuse")
                      ? "云量较多，适合柔和层次，剪影效果可能较弱"
                      : sun.elevation() <= 20 ? "太阳角度较低，明暗层次更柔和" : "结合机位朝向选择构图，注意控制强光",
              "openingUnverified",
              opening.isEmpty()));
    }
    candidates.sort(
        Comparator.comparingDouble((Map<String, Object> w) -> num(w.get("score"))).reversed());
    var selected =
        candidates.stream()
            .limit(3)
            .sorted(Comparator.comparing(w -> str(w.get("start"))))
            .map(
                w -> {
                  w.remove("score");
                  return w;
                })
            .toList();
    out.put("windows", selected);
    out.put("message", selected.isEmpty() ? "今天剩余自然光时段或天气条件不理想，换个时间再看看" : "今天可以这样拍");
    return out;
  }
}
