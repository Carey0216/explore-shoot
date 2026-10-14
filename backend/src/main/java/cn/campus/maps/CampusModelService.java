package cn.campus.maps;

import static cn.campus.common.Json.*;

import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.stereotype.Service;

/** Independent display model in the supplied drawing frame, never a routing graph. */
@Service
public final class CampusModelService {
  private final Map<String, Object> source;
  private final CampusAppearanceService appearance;
  private static final double LNG = 106.1, LAT = 38.4968;
  private static final double EAST = 111320 * Math.cos(Math.toRadians(LAT)), NORTH = 111320;

  public CampusModelService(CampusAppearanceService appearance) throws java.io.IOException {
    this.appearance = appearance;
    source = read("/campus-model.json");
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

  private List<List<Double>> ring(Object points) {
    return list(points).stream().map(this::plan).toList();
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

  private Map<String, Object> building(Map<String, Object> b) {
    var outline = ring(b.get("outline"));
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
    var profile = appearance.profile(str(b.get("id")));
    double bodyHeight = h;
    var parts = new ArrayList<Map<String, Object>>();
    var holes = new ArrayList<List<List<Double>>>();
    for (var hole : list(b.get("holes"))) holes.add(ring(hole));
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
      h = 80;
    } else if (style.equals("gym")) {
      parts.add(box(x, h + .7, z, w * .9, 1.4, d * .92, "silver"));
    }
    double roofRise = appearance.addSurfaces(parts, profile, outline, holes, bodyHeight);
    h += roofRise;
    var result =
        obj(
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
            "supplied-numbering-plan",
            "positionEstimated",
            true,
            "heightEstimated",
            true,
            "appearanceEstimated",
            true,
            "existenceUnverified",
            yes(b.get("existenceUnverified")),
            "appearance",
            profile,
            "constructionMode",
            "parametric+ai-material");
    if (style.equals("clock")) {
      var asset = rows(appearance.assets().get("models")).getFirst();
      result.put("meshAsset", asset);
      result.put("constructionMode", "planar-reconstruction+orthographic-texture");
    }
    return result;
  }

  public Map<String, Object> scene() {
    var models = new ArrayList<Map<String, Object>>();
    // The numbered drawing is an illustration, not a georeferenced orthophoto.
    // All display objects must use its coordinate frame; never mix raw WGS84
    // geometry into a scene whose lakes and roads came from that drawing.
    for (var b : rows(source.get("buildings"))) {
      var model = building(b);
      model.put("planCenter", b.get("planCenter"));
      model.put("planId", b.get("id"));
      models.add(model);
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
              ring(p.get("outline")),
              "holes",
              list(p.get("holes")).stream().map(this::ring).toList()));
    var roads = new ArrayList<Map<String, Object>>();
    for (var r : rows(source.get("roads")))
      roads.add(obj("points", ring(r.get("points")), "width", r.get("width")));
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
              num(f.get("depth")) * 1.63,
              "standSide",
              str(f.getOrDefault("standSide", "east"))));
    var facilities = new ArrayList<Map<String, Object>>();
    for (var f : rows(source.get("facilities"))) {
      var feature = copy(f);
      feature.remove("planCenter");
      feature.put("center", plan(f.get("planCenter")));
      feature.put("width", num(f.get("width")) * 1.65);
      feature.put("depth", num(f.get("depth")) * 1.63);
      if (f.containsKey("outlines"))
        feature.put("rings", list(f.get("outlines")).stream().map(this::ring).toList());
      feature.remove("outlines");
      feature.put("estimated", true);
      feature.put("displayOnly", true);
      facilities.add(feature);
    }
    return obj(
        "version",
        2,
        "coordinateSystem",
        "local-metres",
        "layoutBasis",
        "supplied-numbering-plan",
        "displayOnly",
        true,
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
        "facilities",
        facilities,
        "sources",
        source.get("sources"),
        "materials",
        appearance.materials(),
        "assets",
        appearance.assets(),
        "coverage",
        obj(
            "buildingCount",
            models.size(),
            "east",
            models.stream().filter(m -> eq(map(m.get("appearance")).get("zone"), "east")).count(),
            "west",
            models.stream().filter(m -> eq(map(m.get("appearance")).get("zone"), "west")).count()),
        "notice",
        source.get("notice"));
  }
}
