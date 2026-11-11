package cn.campus.maps;

import static cn.campus.common.Json.*;

import cn.campus.admin.AdminPermissions;
import cn.campus.auth.Security;
import cn.campus.checkin.AtlasGeometry;
import cn.campus.common.ApiException;
import cn.campus.common.RequestValues;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.util.*;
import org.springframework.stereotype.Service;

/** Building footprints are display data, never a walking graph or a source of user statistics. */
@Service
public class CampusBuildingService {
  private static final String REVIEWS = "tencentBuildingCoverage";
  private static final String EDITS = "tencentBuildingEdits";
  private static final Set<String> STATUSES = Set.of("native", "missing", "unreviewed");
  private final Map<String, Object> dataset;
  private final Map<String, Object> sdkDataset;
  private final Map<String, Object> sourceReviews;

  public CampusBuildingService() throws java.io.IOException {
    dataset = resource("campus-buildings.json");
    sdkDataset = resource("campus-sdk-buildings.json");
    var audit = resource("campus-sdk-building-audit.json");
    sourceReviews = eq(audit.get("provider"), "tencent-gl") ? map(audit.get("reviews")) : Map.of();
  }

  private Map<String, Object> resource(String filename) throws java.io.IOException {
    try (var input =
        Objects.requireNonNull(getClass().getResourceAsStream("/" + filename))) {
      return parse(new String(input.readAllBytes(), StandardCharsets.UTF_8));
    }
  }

  private Map<String, Object> review(StoreRepository store, Map<String, Object> building) {
    String id = str(building.get("id"));
    var settings = map(store.settings().get(REVIEWS));
    return map(settings.getOrDefault(id, sourceReviews.get(id)));
  }

  private List<Map<String, Object>> currentBuildings(StoreRepository store) {
    var current = new LinkedHashMap<String, Map<String, Object>>();
    for (var building : rows(sdkDataset.get("buildings")))
      current.put(str(building.get("id")), building);
    map(store.settings().get(EDITS)).forEach((id, value) -> current.put(id, map(value)));
    return List.copyOf(current.values());
  }

  private String coverage(Map<String, Object> building, Map<String, Object> review) {
    if (building.containsKey("blocked")) return "excluded";
    String status = str(review.get("status"));
    if (STATUSES.contains(status) && !status.equals("unreviewed")
        && !str(review.get("observedAt")).isBlank()
        && eq(building.get("geometryChecksum"), review.get("geometryChecksum"))) return status;
    return "unreviewed";
  }

  private Map<String, Object> candidate(StoreRepository store, Map<String, Object> building) {
    var review = review(store, building);
    var result = copy(building);
    result.put("coverage", coverage(building, review));
    result.put("revision", integer(review.get("revision")));
    return result;
  }

  private void saveReview(ApiContext c) throws Exception {
    c.need();
    if (!AdminPermissions.owner(c.account))
      throw new ApiException("仅顶级管理员可维护楼栋补绘", 403);
    RequestValues.fields(c.body, "id", "geometryChecksum", "revision", "status");
    String id = RequestValues.text(c.body, "id", "", 80, true);
    var building = find(currentBuildings(c.store), "id", id);
    if (building == null || building.containsKey("blocked"))
      throw new ApiException("此轮廓不能用于地图补绘", 409);
    long revision = RequestValues.integer(c.body, "revision", -1, 0, Integer.MAX_VALUE - 1);
    if (revision != integer(review(c.store, building).get("revision"))
        || !eq(c.body.get("geometryChecksum"), building.get("geometryChecksum")))
      throw new ApiException("楼栋数据已更新，请重新打开核对面板", 409);
    String status = RequestValues.text(c.body, "status", "", 16, true);
    if (!STATUSES.contains(status))
      throw new ApiException("楼栋状态无效");
    var reviews = copy(map(c.store.settings().get(REVIEWS)));
    reviews.put(id, obj("status", status, "geometryChecksum", building.get("geometryChecksum"),
        "observedAt", StoreRepository.now(), "revision", revision + 1));
    c.store.settings().put(REVIEWS, reviews);
    c.audit("核对腾讯底图楼栋", id, status);
    c.store.save();
    c.send(candidate(c.store, building));
  }

  private void saveBuilding(ApiContext c, boolean create) throws Exception {
    c.need();
    if (!AdminPermissions.owner(c.account))
      throw new ApiException("仅顶级管理员可维护楼栋补绘", 403);
    RequestValues.fields(c.body, "id", "revision", "name", "height", "color", "footprint", "holes", "status");
    var edits = copy(map(c.store.settings().get(EDITS)));
    String id = create ? "custom-" + Security.id() : RequestValues.text(c.body, "id", "", 80, true);
    var previous = create ? null : find(currentBuildings(c.store), "id", id);
    if (!create && (previous == null || previous.containsKey("blocked")))
      throw new ApiException("此楼栋不能编辑", 404);
    long revision = RequestValues.integer(c.body, "revision", -1, 0, Integer.MAX_VALUE - 1);
    if (revision != (create ? 0 : integer(review(c.store, previous).get("revision"))))
      throw new ApiException("楼栋已被更新，请重新打开编辑器", 409);
    if (create && edits.size() >= 250) throw new ApiException("楼栋编辑数量已达上限");
    String name = RequestValues.text(c.body, "name", "", 80, true);
    double height = num(c.body.get("height"));
    if (!(height >= 1 && height <= 120)) throw new ApiException("高度应为 1 到 120 米");
    String color = RequestValues.text(c.body, "color", "", 7, true);
    if (!color.matches("#[a-fA-F0-9]{6}")) throw new ApiException("请选择有效的屋顶颜色");
    String status = RequestValues.text(c.body, "status", "unreviewed", 16, true);
    if (!STATUSES.contains(status)) throw new ApiException("楼栋状态无效");
    var footprint = geographicRing(c, c.body.get("footprint"));
    if (!(c.body.get("holes") instanceof List<?> rawHoles) || rawHoles.size() > 8)
      throw new ApiException("内院轮廓格式无效");
    var holes = new ArrayList<List<List<Double>>>();
    for (var hole : rawHoles) holes.add(geographicRing(c, hole));
    AtlasGeometry.validate(localRing(footprint), holes.stream().map(CampusBuildingService::localRing).toList(),
        3000, 2000);
    double lng = footprint.stream().mapToDouble(p -> p.get(0)).average().orElseThrow();
    double lat = footprint.stream().mapToDouble(p -> p.get(1)).average().orElseThrow();
    var building = obj("id", id, "name", name, "height", height, "estimated", true,
        "heightSource", "admin-estimate", "source", "admin-map-outline", "color", color,
        "center", obj("lng", lng, "lat", lat), "footprint", closed(footprint),
        "holes", holes.stream().map(CampusBuildingService::closed).toList());
    building.put("geometryChecksum", Security.digest(write(building)));
    var reviews = copy(map(c.store.settings().get(REVIEWS)));
    var approval = obj("status", status, "geometryChecksum", building.get("geometryChecksum"),
        "observedAt", StoreRepository.now(), "revision", revision + 1);
    var dir = c.store.directory.resolve("maintenance-backups/campus-buildings");
    Files.createDirectories(dir);
    var file = dir.resolve(Security.id() + ".json");
    var before = previous == null ? null : candidate(c.store, previous);
    String snapshot = write(obj("before", before, "after", building, "review", approval,
        "savedAt", StoreRepository.now(), "actorId", c.account.get("id")));
    Files.writeString(file, snapshot, StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
    if (!Files.readString(file, StandardCharsets.UTF_8).equals(snapshot))
      throw new IllegalStateException("三维楼栋备份校验失败");
    Files.writeString(dir.resolve(file.getFileName() + ".sha256"), Security.digest(snapshot),
        StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
    edits.put(id, building);
    reviews.put(id, approval);
    c.store.settings().put(EDITS, edits);
    c.store.settings().put(REVIEWS, reviews);
    c.audit(create ? "新建地图三维楼栋" : "编辑地图三维楼栋", id, name);
    c.store.save();
    c.send(candidate(c.store, building));
  }

  private static List<List<Double>> geographicRing(ApiContext c, Object raw) {
    if (!(raw instanceof List<?> points) || points.size() < 3 || points.size() > 129)
      throw new ApiException("轮廓需要 3 到 128 个顶点");
    var ring = new ArrayList<List<Double>>();
    for (var value : points) {
      if (!(value instanceof List<?> point) || point.size() != 2) throw new ApiException("轮廓坐标格式无效");
      var coordinate = Campus.coordinate(c.store.campus, point.get(0), point.get(1));
      ring.add(List.of(Math.round(num(coordinate.get("lng")) * 1e7) / 1e7,
          Math.round(num(coordinate.get("lat")) * 1e7) / 1e7));
    }
    if (ring.get(0).equals(ring.get(ring.size() - 1))) ring.remove(ring.size() - 1);
    return ring;
  }

  private static List<List<Double>> localRing(List<List<Double>> ring) {
    return ring.stream().map(p -> List.of((p.get(0) - 106.08) * 87000, (p.get(1) - 38.49) * 111195)).toList();
  }

  private static List<List<Double>> closed(List<List<Double>> ring) {
    var closed = new ArrayList<>(ring);
    closed.add(ring.get(0));
    return closed;
  }

  public static Map<String, Object> height(Map<String, Object> tags) {
    double explicit = positive(tags.get("height"));
    if (Double.isFinite(explicit))
      return obj("height", explicit, "heightSource", "map-height", "estimated", false);
    double floors = positive(tags.get("building:levels"));
    if (Double.isFinite(floors) && floors <= 100)
      return obj(
          "height",
          Math.min(300, floors * 3),
          "heightSource",
          "levels-estimate",
          "estimated",
          true);
    double fallback =
        eq(tags.get("amenity"), "library")
            ? 24
            : eq(tags.get("leisure"), "sports_hall")
                ? 12
                : eq(tags.get("building"), "university") ? 18 : 12;
    return obj("height", fallback, "heightSource", "display-estimate", "estimated", true);
  }

  private static double positive(Object value) {
    try {
      double n = Double.parseDouble(String.valueOf(value).trim().replaceFirst("\\s*m$", ""));
      return Double.isFinite(n) && n > 0 && n <= 300 ? n : Double.NaN;
    } catch (RuntimeException e) {
      return Double.NaN;
    }
  }

  public static boolean contains(List<Object> ring, double lng, double lat) {
    boolean inside = false;
    for (int i = 0, j = ring.size() - 1; i < ring.size(); j = i++) {
      var a = list(ring.get(i));
      var b = list(ring.get(j));
      double ax = num(a.get(0)), ay = num(a.get(1)), bx = num(b.get(0)), by = num(b.get(1));
      if ((ay > lat) != (by > lat) && lng < (bx - ax) * (lat - ay) / (by - ay) + ax)
        inside = !inside;
    }
    return inside;
  }

  public boolean handle(ApiContext context) throws Exception {
    if (context.audience.equals("admin")
        && (context.route("/api/admin/campus-map/buildings", "POST")
            || context.route("/api/admin/campus-map/buildings", "PUT"))) {
      saveBuilding(context, context.route("/api/admin/campus-map/buildings", "POST"));
      return true;
    }
    if (context.audience.equals("admin") && context.route("/api/admin/campus-map/building-coverage", "PATCH")) {
      saveReview(context);
      return true;
    }
    if (!context.route("/api/maps/buildings", "GET")) return false;
    if (context.audience.equals("admin")) context.need();
    boolean review = "1".equals(context.request.getParameter("review"));
    if (review) {
      if (!context.audience.equals("admin") || !AdminPermissions.owner(context.account))
        throw new ApiException("仅顶级管理员可查看补绘核对数据", 403);
      var candidates = currentBuildings(context.store).stream()
          .map(b -> candidate(context.store, b)).toList();
      context.send(obj("coordinateSystem", "WGS84", "provider", "tencent-gl",
          "registration", sdkDataset.get("registration"), "candidates", candidates));
      return true;
    }
    List<Map<String, Object>> buildings = new ArrayList<>();
    for (var source : rows(dataset.get("buildings"))) {
      List<Object> ring = list(source.get("footprint"));
      // Every distributed footprint was imported from a closed OSM way within the campus.
      if (ring.size() < 4 || ring.size() > 2000) continue;
      var building = copy(source);
      var tags = map(building.remove("tags"));
      building.putAll(height(tags));
      var center = map(building.get("center"));
      List<String> pointIds =
          context.store.rows("points").stream()
              .filter(p -> yes(p.get("published")))
              .filter(
                  p ->
                      contains(ring, num(p.get("lng")), num(p.get("lat")))
                          || Campus.distance(center, p) <= 75)
              .sorted(Comparator.comparingDouble(p -> Campus.distance(center, p)))
              .map(p -> str(p.get("id")))
              .toList();
      building.put("pointIds", pointIds);
      buildings.add(building);
    }
    context.send(
        obj(
            "coordinateSystem",
            "WGS84",
            "source",
            dataset.get("source"),
            "fetchedAt",
            dataset.get("fetchedAt"),
            "attribution",
            "© OpenStreetMap contributors",
            "license",
            "ODbL-1.0",
            "licenseUrl",
            "https://www.openstreetmap.org/copyright",
            "buildings",
            buildings,
            "supplements",
            currentBuildings(context.store).stream()
                .filter(b -> coverage(b, review(context.store, b)).equals("missing"))
                .map(b -> {
                  var result = copy(b);
                  result.put("coverage", "missing");
                  result.put("pointIds", context.store.rows("points").stream()
                      .filter(p -> yes(p.get("published")))
                      .filter(p -> contains(list(b.get("footprint")), num(p.get("lng")), num(p.get("lat"))))
                      .map(p -> str(p.get("id"))).toList());
                  return result;
                }).toList()));
    return true;
  }
}
