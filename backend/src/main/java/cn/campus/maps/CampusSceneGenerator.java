package cn.campus.maps;

import static cn.campus.common.Json.*;

import java.util.*;

/** Procedural architectural parts in metres; styles are estimates, not photogrammetric evidence. */
public final class CampusSceneGenerator {
  public static final double LNG = 106.1, LAT = 38.4968;
  private static final double EAST = 111320 * Math.cos(Math.toRadians(LAT)), NORTH = 111320;

  public static List<List<Double>> footprint(Map<String, Object> b) {
    var out = new ArrayList<List<Double>>();
    double angle = Math.toRadians(num(b.get("rotation"))),
        w = num(b.get("width")) / 2,
        d = num(b.get("depth")) / 2;
    for (var v : new double[][] {{-w, -d}, {w, -d}, {w, d}, {-w, d}, {-w, -d}})
      out.add(
          List.of(
              num(b.get("lng")) + (v[0] * Math.cos(angle) - v[1] * Math.sin(angle)) / EAST,
              num(b.get("lat")) - (v[0] * Math.sin(angle) + v[1] * Math.cos(angle)) / NORTH));
    return out;
  }

  private static Map<String, Object> part(
      String type, double x, double y, double z, double w, double h, double d, String color) {
    return obj(
        "type", type, "position", List.of(x, y, z), "size", List.of(w, h, d), "color", color);
  }

  public static Map<String, Object> model(Map<String, Object> b) {
    double w = num(b.get("width")), d = num(b.get("depth")), h = num(b.get("height"));
    String category = str(b.get("category"));
    String wall = category.equals("宿舍") ? "#ead7b3" : category.equals("餐饮") ? "#bdd5d6" : "#d7d3e3";
    var parts = new ArrayList<Map<String, Object>>();
    var outline = list(b.get("footprint"));
    if (!outline.isEmpty()) {
      var ring =
          outline.stream()
              .map(
                  v -> {
                    var p = list(v);
                    return List.of(
                        (num(p.get(0)) - num(b.get("lng"))) * EAST,
                        (num(b.get("lat")) - num(p.get(1))) * NORTH);
                  })
              .toList();
      parts.add(obj("type", "polygon", "ring", ring, "height", h, "color", wall));
      parts.add(
          obj("type", "polygon", "ring", ring, "height", 1.2, "elevation", h, "color", "#98a6b6"));
      return obj(
          "id",
          b.get("id"),
          "name",
          b.get("name"),
          "category",
          category,
          "zone",
          b.get("zone"),
          "position",
          List.of((num(b.get("lng")) - LNG) * EAST, 0, (LAT - num(b.get("lat"))) * NORTH),
          "rotation",
          0,
          "height",
          h,
          "parts",
          parts,
          "positionEstimated",
          false,
          "appearanceEstimated",
          true,
          "source",
          b.get("source"));
    }
    parts.add(part("box", 0, h / 2, 0, w, h, d, wall));
    parts.add(part("box", 0, 0.6, 0, w + 2, 1.2, d + 2, "#b8b5b2"));
    int floors = Math.max(1, Math.min(16, (int) (h / 3.4)));
    for (int floor = 1; floor <= floors; floor++) {
      double y = Math.min(h - 1, floor * 3.2 - 1.2);
      for (int side : new int[] {-1, 1}) {
        parts.add(part("box", 0, y, side * (d / 2 + .08), w * .9, 1.2, .18, "#7495a6"));
        parts.add(part("box", side * (w / 2 + .08), y, 0, .18, 1.2, d * .86, "#7495a6"));
      }
    }
    // Sparse vertical mullions interrupt continuous window bands without thousands of meshes.
    for (double x = -w / 2 + 5; x < w / 2; x += 8)
      for (int side : new int[] {-1, 1})
        parts.add(part("box", x, h / 2, side * (d / 2 + .2), .6, h, .3, wall));
    String roof = str(b.get("roof"));
    if (roof.equals("gable"))
      parts.add(part("gable", 0, h, 0, w + 2, Math.min(5, d / 5), d + 2, "#84708e"));
    else {
      parts.add(part("box", 0, h + .6, 0, w + 1, 1.2, d + 1, "#98a6b6"));
      parts.add(part("box", 0, h + 1.6, 0, w * .42, 1.3, d * .3, "#ced7dd"));
    }
    if (roof.equals("tower")) {
      parts.add(part("box", 0, h + 14, 0, w * .23, 28, d * .33, "#d8e0df"));
      parts.add(part("box", 0, h + 29, 0, w * .28, 2, d * .37, "#b56d58"));
      parts.add(part("spire", 0, h + 36, 0, 13, 12, 13, "#d5dadf"));
    }
    return obj(
        "id",
        b.get("id"),
        "name",
        b.get("name"),
        "category",
        category,
        "zone",
        b.get("zone"),
        "position",
        List.of((num(b.get("lng")) - LNG) * EAST, 0, (LAT - num(b.get("lat"))) * NORTH),
        "rotation",
        b.get("rotation"),
        "height",
        h,
        "parts",
        parts,
        "positionEstimated",
        b.get("positionEstimated"),
        "appearanceEstimated",
        true,
        "source",
        b.get("source"));
  }

  public static Map<String, Object> scene(
      List<Map<String, Object>> places, Map<String, Object> campus) {
    return obj(
        "coordinateSystem",
        "local-metres",
        "origin",
        List.of(LNG, LAT),
        "appearanceEstimated",
        true,
        "notice",
        "校园示意模型 · 建筑高度与外观为估算，不能用于判断入口或通行",
        "panoramaUrl",
        "https://720yun.com/u/296249fuxef",
        "models",
        places.stream()
            .filter(
                b ->
                    !eq(b.get("category"), "大门")
                        && !eq(b.get("category"), "运动")
                        && num(b.get("height")) > 0)
            .map(CampusSceneGenerator::model)
            .toList(),
        "boundary",
        list(campus.get("boundary")).stream()
            .map(
                v -> {
                  var p = list(v);
                  return List.of((num(p.get(0)) - LNG) * EAST, (LAT - num(p.get(1))) * NORTH);
                })
            .toList());
  }
}
