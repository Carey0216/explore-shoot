package cn.campus.maps;

import static cn.campus.common.Json.*;

import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.stereotype.Service;

/**
 * Independent display model: traced compound footprints and public geometry, never a routing graph.
 */
@Service
public final class CampusModelService {
  private final Map<String, Object> source, osm;
  private static final double LNG = 106.1, LAT = 38.4968;
  private static final double EAST = 111320 * Math.cos(Math.toRadians(LAT)), NORTH = 111320;

  public CampusModelService() throws java.io.IOException {
    source = read("/campus-model.json");
    osm = read("/campus-buildings.json");
  }

  private Map<String, Object> read(String name) throws java.io.IOException {
    try (var in = Objects.requireNonNull(getClass().getResourceAsStream(name))) {
      return parse(new String(in.readAllBytes(), StandardCharsets.UTF_8));
    }
  }

  private List<Double> geo(double lng, double lat) {
    return List.of((lng - LNG) * EAST, (LAT - lat) * NORTH);
  }

  private List<Double> plan(Object point) {
    var p = list(point);
    var a = list(source.get("planBounds"));
    var g = list(source.get("geographicBounds"));
    double lng =
        num(g.get(0))
            + (num(p.get(0)) - num(a.get(0)))
                / (num(a.get(2)) - num(a.get(0)))
                * (num(g.get(2)) - num(g.get(0)));
    double lat =
        num(g.get(3))
            - (num(p.get(1)) - num(a.get(1)))
                / (num(a.get(3)) - num(a.get(1)))
                * (num(g.get(3)) - num(g.get(1)));
    return geo(lng, lat);
  }

  private List<List<Double>> ring(Object points, boolean geographic) {
    return list(points).stream()
        .map(p -> geographic ? geo(num(list(p).get(0)), num(list(p).get(1))) : plan(p))
        .toList();
  }

  private static List<List<Double>> rectangle(double x, double z, double w, double d) {
    return List.of(
        List.of(x - w / 2, z - d / 2),
        List.of(x + w / 2, z - d / 2),
        List.of(x + w / 2, z + d / 2),
        List.of(x - w / 2, z + d / 2));
  }

  private static Map<String, Object> box(
      double x, double y, double z, double w, double h, double d, String material) {
    return obj(
        "shape",
        "box",
        "position",
        List.of(x, y, z),
        "size",
        List.of(w, h, d),
        "material",
        material);
  }

  private Map<String, Object> building(Map<String, Object> b, boolean geographic) {
    var outline = ring(b.get(geographic ? "footprint" : "outline"), geographic);
    double x = outline.stream().mapToDouble(p -> p.get(0)).average().orElseThrow(),
        z = outline.stream().mapToDouble(p -> p.get(1)).average().orElseThrow();
    double minX = outline.stream().mapToDouble(p -> p.get(0)).min().orElseThrow(),
        maxX = outline.stream().mapToDouble(p -> p.get(0)).max().orElseThrow(),
        minZ = outline.stream().mapToDouble(p -> p.get(1)).min().orElseThrow(),
        maxZ = outline.stream().mapToDouble(p -> p.get(1)).max().orElseThrow();
    double h = num(b.get("height")), w = maxX - minX, d = maxZ - minZ;
    x = (minX + maxX) / 2;
    z = (minZ + maxZ) / 2;
    String style = str(b.get("style"));
    var parts = new ArrayList<Map<String, Object>>();
    var holes = new ArrayList<List<List<Double>>>();
    if (style.equals("library")) holes.add(rectangle(x + w * .04, z - d * .02, w * .36, d * .34));
    parts.add(
        obj(
            "shape",
            "prism",
            "ring",
            outline,
            "holes",
            holes,
            "height",
            h,
            "base",
            0,
            "material",
            style.equals("residence") ? "sand" : "ivory"));
    parts.add(
        obj(
            "shape",
            "prism",
            "ring",
            outline,
            "holes",
            holes,
            "height",
            .65,
            "base",
            h,
            "material",
            "roof"));
    if (style.equals("library")) {
      parts.add(box(x, h + .5, z, w * .42, 1.3, d * .4, "glass"));
      for (int i = 0; i < 7; i++)
        parts.add(box(x - w * .19 + i * w * .064, h + 1.2, z, .35, .45, d * .4, "frame"));
      for (int i = 0; i < 9; i++)
        parts.add(box(minX + 8 + i * (w - 16) / 8, h * .42, minZ - .9, 1.2, h * .84, 2.3, "ivory"));
      parts.add(
          obj(
              "shape",
              "photo",
              "face",
              "l",
              "position",
              List.of(x, h * .43, minZ - 1.5),
              "size",
              List.of(w * .73, h * .83),
              "rotation",
              0,
              "uv",
              List.of(List.of(.40, .03), List.of(.70, .12), List.of(.70, .29), List.of(.40, .20))));
    } else if (style.equals("clock")) {
      double tower = 56, tw = 19;
      parts.add(box(x, 28, z, tw, tower, 18, "ivory"));
      parts.add(box(x, tower + 1, z, 24, 2, 23, "roof"));
      parts.add(
          obj(
              "shape",
              "cone",
              "position",
              List.of(x, tower + 7, z),
              "size",
              List.of(15, 12, 15),
              "material",
              "red"));
      parts.add(box(x, tower + 19, z, 1.5, 24, 1.5, "ivory"));
      parts.add(box(x, 37, z - 9.2, 8, 28, .7, "glass"));
      for (int i = 0; i < 5; i++) parts.add(box(x - 4 + i * 2, 37, z - 9.7, .35, 28, .5, "frame"));
      parts.add(
          obj(
              "shape",
              "photo",
              "face",
              "b",
              "position",
              List.of(x - 10, 29, z),
              "size",
              List.of(19, 53),
              "rotation",
              -Math.PI / 2,
              "uv",
              List.of(
                  List.of(.599, .25), List.of(.66, .25), List.of(.66, .40), List.of(.599, .40))));
      h = 80;
    } else if (style.equals("gym")) {
      parts.add(box(x, h + .7, z, w * .9, 1.4, d * .92, "silver"));
      parts.add(
          obj(
              "shape",
              "photo",
              "face",
              "r",
              "position",
              List.of(maxX + .7, h * .48, z),
              "size",
              List.of(w * .85, h * .91),
              "rotation",
              Math.PI / 2,
              "uv",
              List.of(List.of(.26, .25), List.of(.45, .31), List.of(.45, .41), List.of(.26, .35))));
    } else if (style.equals("residence")) {
      parts.add(box(x, h + 1.1, z, w * .96, 1.8, d * .92, "terracotta"));
    }
    return obj(
        "id",
        b.get("id"),
        "name",
        b.get("name"),
        "position",
        List.of(x, 0, z),
        "extent",
        List.of(w, h, d),
        "height",
        h,
        "style",
        style,
        "parts",
        parts,
        "footprintSource",
        geographic ? "OpenStreetMap / ODbL-1.0" : "supplied-plan+pano",
        "positionEstimated",
        !geographic,
        "heightEstimated",
        true,
        "appearanceEstimated",
        true);
  }

  public Map<String, Object> scene() {
    var models = new ArrayList<Map<String, Object>>();
    Set<String> replaced =
        Set.of("library", "gym", "north-dining", "building-2", "building-3", "building-5", "clock");
    for (var b : rows(source.get("buildings")))
      if (!replaced.contains(str(b.get("id")))) models.add(building(b, false));
    for (var original : rows(osm.get("buildings"))) {
      var b = copy(original);
      String id = str(b.get("id"));
      String style =
          id.endsWith("461608942")
              ? "library"
              : id.endsWith("683690680") ? "clock" : id.endsWith("973124825") ? "gym" : "academic";
      if (style.equals("clock")) b.put("name", "党政主楼 · 钟楼");
      if (style.equals("gym")) b.put("name", "北方民族大学体育馆");
      if (str(b.get("name")).isEmpty()) b.put("name", "公开轮廓建筑 " + id.substring(8));
      b.put("style", style);
      b.put("height", style.equals("library") ? 24 : style.equals("gym") ? 13 : 18);
      models.add(building(b, true));
    }
    var landscape = new ArrayList<Map<String, Object>>();
    for (var p : rows(source.get("landscape")))
      landscape.add(
          obj(
              "kind",
              p.get("kind"),
              "name",
              str(p.get("name")),
              "ring",
              ring(p.get("outline"), false)));
    var roads = new ArrayList<Map<String, Object>>();
    for (var r : rows(source.get("roads")))
      roads.add(obj("points", ring(r.get("points"), false), "width", r.get("width")));
    var fields = new ArrayList<Map<String, Object>>();
    for (var f : rows(source.get("fields")))
      fields.add(
          obj(
              "id",
              f.get("id"),
              "name",
              f.get("name"),
              "center",
              plan(f.get("center")),
              "width",
              num(f.get("width")) * 1.65,
              "depth",
              num(f.get("depth")) * 1.63));
    return obj(
        "version",
        1,
        "coordinateSystem",
        "local-metres",
        "origin",
        List.of(LNG, LAT),
        "models",
        models,
        "landscape",
        landscape,
        "roads",
        roads,
        "fields",
        fields,
        "sources",
        source.get("sources"),
        "notice",
        source.get("notice"),
        "photoFaces",
        List.of("b", "l", "r"));
  }
}
