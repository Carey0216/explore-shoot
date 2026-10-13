package cn.campus.maps;

import static cn.campus.common.Json.*;

import cn.campus.web.ApiContext;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.stereotype.Service;

/** Building footprints are display data, never a walking graph or a source of user statistics. */
@Service
public class CampusBuildingService {
  private final Map<String, Object> dataset;

  public CampusBuildingService() throws java.io.IOException {
    try (var input =
        Objects.requireNonNull(getClass().getResourceAsStream("/campus-buildings.json"))) {
      dataset = parse(new String(input.readAllBytes(), StandardCharsets.UTF_8));
    }
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
    if (!context.audience.equals("user") || !context.route("/api/maps/buildings", "GET"))
      return false;
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
            buildings));
    return true;
  }
}
