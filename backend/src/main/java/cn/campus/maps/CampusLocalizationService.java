package cn.campus.maps;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.common.TimeSource;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.stereotype.Service;

/** Campus directory is separate from photographic check-ins and from provider routing data. */
@Service
public class CampusLocalizationService {
  private final List<Map<String, Object>> seeds;
  public static final List<String> CATEGORIES = List.of("学院", "楼宇", "宿舍", "餐饮", "运动", "大门", "服务");

  public CampusLocalizationService() throws java.io.IOException {
    try (var in =
        Objects.requireNonNull(getClass().getResourceAsStream("/campus-localization.json"))) {
      seeds = rows(parse(new String(in.readAllBytes(), StandardCharsets.UTF_8)).get("places"));
    }
  }

  public List<Map<String, Object>> places(StoreRepository store, boolean admin) {
    var merged = new LinkedHashMap<String, Map<String, Object>>();
    for (var seed : seeds) merged.put(str(seed.get("id")), copy(seed));
    for (var saved : store.rows("campusPlaces")) {
      // Private drafts never override public demonstration geometry.
      if (admin
          || (yes(saved.get("published")) && yes(saved.get("confirmed")))
          || yes(saved.get("archived"))) merged.put(str(saved.get("id")), copy(saved));
    }
    return merged.values().stream().filter(p -> !yes(p.get("archived"))).toList();
  }

  public List<Map<String, Object>> directory(StoreRepository store) {
    return places(store, false).stream()
        .filter(p -> yes(p.get("published")) && yes(p.get("confirmed")))
        .map(this::safe)
        .toList();
  }

  private Map<String, Object> safe(Map<String, Object> p) {
    var out = obj();
    for (String key :
        List.of(
            "id",
            "name",
            "aliases",
            "category",
            "zone",
            "lng",
            "lat",
            "description",
            "height",
            "width",
            "depth",
            "roof",
            "rotation",
            "source",
            "sourceType",
            "confirmed",
            "published",
            "revision",
            "appearanceEstimated",
            "positionEstimated")) if (p.containsKey(key)) out.put(key, p.get(key));
    return out;
  }

  private static String text(Map<String, Object> b, String field, int max, boolean required) {
    if (!(b.get(field) instanceof String)) throw new ApiException("地点字段格式无效");
    String value = str(b.get(field)).trim();
    if (value.length() > max || (required && value.isEmpty())) throw new ApiException("地点文字为空或过长");
    return value;
  }

  private static double number(Map<String, Object> b, String field, double min, double max) {
    double n = num(b.get(field));
    if (!Double.isFinite(n) || n < min || n > max) throw new ApiException("建筑尺寸或方向无效");
    return n;
  }

  public boolean handle(ApiContext c) throws Exception {
    if (c.audience.equals("user")) {
      if (c.route("/api/maps/places", "GET")) {
        c.send(obj("coordinateSystem", "WGS84", "places", directory(c.store)));
        return true;
      }
      if (c.route("/api/maps/scene", "GET")) {
        c.send(CampusSceneGenerator.scene(places(c.store, false), c.store.campus));
        return true;
      }
      return false;
    }
    if (!c.path.startsWith("/api/admin/campus-map")) return false;
    c.need();
    if (c.route("/api/admin/campus-map", "GET")) {
      c.send(
          obj(
              "campus",
              c.store.campus,
              "map",
              MapConfigService.publicMap(c.store.settings()),
              "places",
              places(c.store, true).stream().map(this::safe).toList(),
              "categories",
              CATEGORIES));
      return true;
    }
    if (c.route("/api/admin/campus-map/scene", "GET")) {
      c.send(CampusSceneGenerator.scene(places(c.store, true), c.store.campus));
      return true;
    }
    boolean create = c.route("/api/admin/campus-map/places", "POST");
    boolean edit =
        c.path.matches("/api/admin/campus-map/places/[a-zA-Z0-9-]{1,80}")
            && c.method.equals("PATCH");
    if (!create && !edit) return false;
    var b = c.body;
    if (b.keySet().stream()
        .anyMatch(
            k ->
                !List.of(
                        "name",
                        "aliases",
                        "category",
                        "zone",
                        "lng",
                        "lat",
                        "description",
                        "height",
                        "width",
                        "depth",
                        "roof",
                        "rotation",
                        "source",
                        "confirmed",
                        "published",
                        "revision",
                        "archived")
                    .contains(k))) throw new ApiException("不支持的校园地点字段");
    var p =
        create
            ? obj("id", Security.id(), "revision", 0)
            : find(places(c.store, true), "id", c.path.substring(c.path.lastIndexOf('/') + 1));
    if (p == null) throw new ApiException("校园地点不存在", 404);
    if (!whole(b.get("revision")) || integer(b.get("revision")) != integer(p.get("revision")))
      throw new ApiException("地点已被其他管理员修改，请刷新后重试", 409);
    var updated = copy(p);
    if (yes(b.get("archived"))) {
      updated.put("archived", true);
      updated.put("published", false);
    } else {
      updated.put("name", text(b, "name", 80, true));
      updated.put("aliases", text(b, "aliases", 300, false));
      updated.put("description", text(b, "description", 1000, false));
      updated.put("source", text(b, "source", 300, true));
      String category = text(b, "category", 20, true),
          zone = text(b, "zone", 20, true),
          roof = text(b, "roof", 20, true);
      if (!CATEGORIES.contains(category)
          || !List.of("东校区", "西校区").contains(zone)
          || !List.of("flat", "gable", "tower").contains(roof))
        throw new ApiException("分类、校区或屋顶选项无效");
      updated.putAll(obj("category", category, "zone", zone, "roof", roof));
      updated.putAll(Campus.coordinate(c.store.campus, b.get("lng"), b.get("lat")));
      for (String field : List.of("confirmed", "published"))
        if (!(b.get(field) instanceof Boolean)) throw new ApiException("确认与发布选项无效");
      if (yes(b.get("published")) && !yes(b.get("confirmed")))
        throw new ApiException("请先校准并确认位置，再发布校园地点");
      updated.putAll(
          obj(
              "confirmed",
              b.get("confirmed"),
              "published",
              b.get("published"),
              "positionEstimated",
              !yes(b.get("confirmed")),
              "appearanceEstimated",
              true,
              "sourceType",
              "admin-localization"));
      updated.put("height", number(b, "height", 1, 100));
      updated.put("width", number(b, "width", 3, 180));
      updated.put("depth", number(b, "depth", 3, 180));
      updated.put("rotation", number(b, "rotation", -180, 180));
      updated.remove("footprint");
      // Reject boxes extending outside the campus, not just their centres.
      for (var corner : CampusSceneGenerator.footprint(updated))
        Campus.coordinate(c.store.campus, corner.get(0), corner.get(1));
    }
    if (create && c.store.rows("campusPlaces").size() >= 500) throw new ApiException("校园地点数量已达上限");
    updated.put("revision", integer(p.get("revision")) + 1);
    updated.put("updatedAt", java.time.Instant.ofEpochMilli(TimeSource.now()).toString());
    updated.put("updatedBy", c.account.get("id"));
    c.store.rows("campusPlaces").removeIf(x -> eq(x.get("id"), updated.get("id")));
    c.store.rows("campusPlaces").add(updated);
    c.store.bump();
    c.audit(
        create ? "新增校园地点" : "修改校园地点",
        str(updated.get("id")),
        yes(updated.get("archived")) ? "归档" : yes(updated.get("published")) ? "发布已确认地点" : "保存草稿");
    c.store.save();
    c.send(obj("place", safe(updated)), create ? 201 : 200);
    return true;
  }
}
