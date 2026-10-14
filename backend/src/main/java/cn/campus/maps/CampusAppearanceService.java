package cn.campus.maps;

import static cn.campus.common.Json.*;

import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.stereotype.Service;

/** Per-building appearance recipes and planar UVs, independent from navigation and user records. */
@Service
public final class CampusAppearanceService {
  private final Map<String, Map<String, Object>> profiles = new LinkedHashMap<>();
  private final Map<String, Object> assets;

  public CampusAppearanceService() throws java.io.IOException {
    for (var p : rows(read("/campus-appearance.json").get("buildings")))
      if (profiles.put(str(p.get("id")), p) != null) throw new IllegalArgumentException("重复建筑配置");
    assets = read("/campus-assets.json");
  }

  private Map<String, Object> read(String name) throws java.io.IOException {
    try (var in = Objects.requireNonNull(getClass().getResourceAsStream(name))) {
      return parse(new String(in.readAllBytes(), StandardCharsets.UTF_8));
    }
  }

  public Map<String, Object> profile(String id) {
    var p = profiles.get(id);
    if (p == null) throw new IllegalArgumentException("缺少建筑外观配置：" + id);
    return new LinkedHashMap<>(p);
  }

  public Map<String, Object> assets() {
    return assets;
  }

  public Map<String, Object> materials() {
    var m = obj();
    m.put("ivoryWindow", material("ivory", List.of(0, .5, .5, .5)));
    m.put("buffWindow", material("brick", List.of(0, .5, .5, .5)));
    m.put("greyBand", material("brick", List.of(.5, .5, .5, .5)));
    m.put("ivoryWall", material("ivory", List.of(0, 0, .5, .5)));
    m.put("tileRoof", material("brick", List.of(0, 0, .5, .5)));
    m.put("flatRoof", material("brick", List.of(.5, 0, .5, .5)));
    m.put("libraryFacade", material("library", List.of(0, 0, 1, 1)));
    m.put("gymFacade", material("gym", List.of(0, 0, 1, 1)));
    m.put("grass", material("landscape", List.of(0, .5, .5, .5)));
    m.put("paving", material("landscape", List.of(.5, .5, .5, .5)));
    m.put("water", material("landscape", List.of(0, 0, .5, .5)));
    m.put("track", material("landscape", List.of(.5, 0, .5, .5)));
    return m;
  }

  private Map<String, Object> material(String id, List<Number> region) {
    var texture =
        rows(assets.get("textures")).stream()
            .filter(t -> eq(t.get("id"), id))
            .findFirst()
            .orElseThrow();
    return obj("url", texture.get("url"), "region", region);
  }

  public double addSurfaces(
      List<Map<String, Object>> parts,
      Map<String, Object> profile,
      List<List<Double>> ring,
      List<List<List<Double>>> holes,
      double height) {
    String facade = str(profile.get("facade"));
    double tileWidth = facade.equals("libraryFacade") ? 72 : facade.equals("gymFacade") ? 39 : 20;
    double tileHeight =
        facade.endsWith("Facade") ? height : height / num(profile.get("floors")) * 4;
    var rings = new ArrayList<List<List<Double>>>();
    rings.add(ring);
    rings.addAll(holes);
    for (var outline : rings) {
      for (int i = 0; i < outline.size(); i++) {
        var a = outline.get(i);
        var b = outline.get((i + 1) % outline.size());
        double dx = b.get(0) - a.get(0), dz = b.get(1) - a.get(1), length = Math.hypot(dx, dz);
        if (length < .05) continue;
        // Shared planar coordinates: rows never depend on per-triangle normals or modulo wrapping.
        parts.add(
            obj(
                "shape",
                "surface",
                "vertices",
                List.of(
                    List.of(a.get(0), 0, a.get(1)), List.of(b.get(0), 0, b.get(1)),
                    List.of(b.get(0), height, b.get(1)), List.of(a.get(0), height, a.get(1))),
                "uv",
                List.of(
                    List.of(0, 0),
                    List.of(length / tileWidth, 0),
                    List.of(length / tileWidth, height / tileHeight),
                    List.of(0, height / tileHeight)),
                "material",
                facade));
      }
    }
    String roof = str(profile.get("roof"));
    parts.stream()
        .filter(p -> eq(p.get("shape"), "prism") && num(p.get("base")) > 0)
        .forEach(p -> p.put("material", "flatRoof"));
    if (!roof.startsWith("pitched")) return 0;
    double minX = ring.stream().mapToDouble(p -> p.get(0)).min().orElseThrow();
    double maxX = ring.stream().mapToDouble(p -> p.get(0)).max().orElseThrow();
    double minZ = ring.stream().mapToDouble(p -> p.get(1)).min().orElseThrow();
    double maxZ = ring.stream().mapToDouble(p -> p.get(1)).max().orElseThrow();
    boolean alongX = maxX - minX >= maxZ - minZ;
    double center = alongX ? (minZ + maxZ) / 2 : (minX + maxX) / 2;
    double half = alongX ? (maxZ - minZ) / 2 : (maxX - minX) / 2;
    double rise = Math.min(3, half * .22);
    parts.add(
        obj(
            "shape",
            "pitchedRoof",
            "ring",
            ring,
            "holes",
            holes,
            "base",
            height + .7,
            "rise",
            rise,
            "axis",
            alongX ? "x" : "z",
            "center",
            center,
            "half",
            half,
            "material",
            roof.equals("pitched-grey") ? "flatRoof" : "tileRoof"));
    for (int i = 0; i < ring.size(); i++) {
      var start = ring.get(i);
      var end = ring.get((i + 1) % ring.size());
      var edge = new ArrayList<List<Double>>();
      edge.add(start);
      double ca = (alongX ? start.get(1) : start.get(0)) - center;
      double cb = (alongX ? end.get(1) : end.get(0)) - center;
      if (ca * cb < 0) {
        double t = ca / (ca - cb);
        edge.add(
            List.of(
                start.get(0) + (end.get(0) - start.get(0)) * t,
                start.get(1) + (end.get(1) - start.get(1)) * t));
      }
      edge.add(end);
      for (int j = 1; j < edge.size(); j++) {
        var a = edge.get(j - 1);
        var b = edge.get(j);
        double ay =
            height + .7 + rise * (1 - Math.abs((alongX ? a.get(1) : a.get(0)) - center) / half);
        double by =
            height + .7 + rise * (1 - Math.abs((alongX ? b.get(1) : b.get(0)) - center) / half);
        parts.add(
            obj(
                "shape",
                "surface",
                "vertices",
                List.of(
                    List.of(a.get(0), height, a.get(1)), List.of(b.get(0), height, b.get(1)),
                    List.of(b.get(0), by, b.get(1)), List.of(a.get(0), ay, a.get(1))),
                "uv",
                List.of(List.of(0, 0), List.of(1, 0), List.of(1, 1), List.of(0, 1)),
                "material",
                "ivoryWall"));
      }
    }
    return rise + .7;
  }
}
