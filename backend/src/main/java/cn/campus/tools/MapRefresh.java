package cn.campus.tools;

import static cn.campus.Json.*;

import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;

/**
 * Optional historical OSM reference import. Live map/navigation continue to use the selected SDK.
 */
public final class MapRefresh {
  private static final double[] BOX = {106.0905, 38.4929, 106.1092, 38.5007};

  public static Map<String, Object> convert(Map<String, Object> input) {
    if (!(input.get("elements") instanceof List))
      throw new IllegalArgumentException("地图数据格式无效，保留原有资料");
    var elements = rows(input.get("elements"));
    Map<Long, Map<String, Object>> nodes = new HashMap<>();
    for (var e : elements) if (eq(e.get("type"), "node")) nodes.put(integer(e.get("id")), e);
    List<Map<String, Object>> features = new ArrayList<>();
    for (var e : elements) {
      if (!eq(e.get("type"), "way") || !(e.get("tags") instanceof Map)) continue;
      var tags = map(e.get("tags"));
      Object kind =
          integer(e.get("id")) == 461608579L
              ? "campus"
              : tags.containsKey("building")
                  ? "building"
                  : tags.getOrDefault("highway", tags.getOrDefault("leisure", tags.get("landuse")));
      if (kind == null) continue;
      var nodeIds = list(e.get("nodes"));
      if (nodeIds.size() < 2) continue;
      List<Map<String, Object>> ns = nodeIds.stream().map(id -> nodes.get(integer(id))).toList();
      if (ns.contains(null)) continue;
      boolean highway = tags.containsKey("highway"),
          polygon = !highway && eq(nodeIds.getFirst(), nodeIds.getLast());
      if (polygon && ns.stream().anyMatch(n -> !within(n))) continue;
      List<List<Map<String, Object>>> parts = new ArrayList<>();
      List<Map<String, Object>> current = new ArrayList<>();
      if (polygon) parts.add(ns);
      else {
        for (var node : ns) {
          if (within(node)) current.add(node);
          else {
            if (current.size() > 1) parts.add(current);
            current = new ArrayList<>();
          }
        }
        if (current.size() > 1) parts.add(current);
      }
      for (var part : parts) {
        var properties =
            obj("id", e.get("id"), "name", tags.getOrDefault("name", ""), "kind", kind);
        if (e.get("timestamp") != null) properties.put("updatedAt", e.get("timestamp"));
        if (highway) {
          properties.put("nodeIds", part.stream().map(n -> n.get("id")).toList());
          for (String field : List.of("access", "foot"))
            if (tags.containsKey(field)) properties.put(field, tags.get(field));
          if (tags.containsKey("oneway:foot"))
            properties.put("footOneway", tags.get("oneway:foot"));
          properties.put(
              "barriers",
              part.stream()
                  .map(
                      n -> {
                        var t = map(n.get("tags"));
                        return t.get("barrier") != null
                            && List.of("no", "private").contains(str(t.get("access")))
                            && !List.of("yes", "designated", "permissive")
                                .contains(str(t.get("foot")));
                      })
                  .toList());
        }
        var coordinates = part.stream().map(n -> List.of(n.get("lon"), n.get("lat"))).toList();
        features.add(
            obj(
                "type",
                "Feature",
                "properties",
                properties,
                "geometry",
                obj(
                    "type",
                    polygon ? "Polygon" : "LineString",
                    "coordinates",
                    polygon ? List.of(coordinates) : coordinates)));
      }
    }
    var roads =
        features.stream()
            .filter(f -> eq(map(f.get("geometry")).get("type"), "LineString"))
            .toList();
    if (features.stream().noneMatch(f -> eq(map(f.get("properties")).get("kind"), "campus"))
        || roads.size() < 10) throw new IllegalArgumentException("地图资料不完整，保留原有资料");
    return obj(
        "type",
        "FeatureCollection",
        "metadata",
        obj(
            "source",
            "OpenStreetMap",
            "sourceURL",
            "https://www.openstreetmap.org/way/461608579",
            "license",
            "ODbL",
            "coordinateSystem",
            "WGS84",
            "fetchedAt",
            Instant.now().toString(),
            "latestRoadEdit",
            roads.stream()
                .map(f -> str(map(f.get("properties")).get("updatedAt")))
                .filter(v -> !v.isBlank())
                .max(String::compareTo)
                .orElse(""),
            "roadCount",
            roads.size(),
            "notice",
            "获取时间不等于道路实地更新时间；公开道路资料可能不完整，通行情况以现场为准。"),
        "features",
        features);
  }

  private static boolean within(Map<String, Object> n) {
    double lng = num(n.get("lon")), lat = num(n.get("lat"));
    return Double.isFinite(lng)
        && Double.isFinite(lat)
        && lng >= BOX[0]
        && lng <= BOX[2]
        && lat >= BOX[1]
        && lat <= BOX[3];
  }

  public static void run(Path root, String[] args) throws Exception {
    Map<String, Object> data;
    if (args.length == 2 && args[0].equals("--from"))
      data = parse(Files.readString(Path.of(args[1]).toAbsolutePath()));
    else if (args.length == 0) {
      var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
      var response =
          client.send(
              HttpRequest.newBuilder(
                      URI.create(
                          "https://api.openstreetmap.org/api/0.6/map.json?bbox=106.0905,38.4929,106.1092,38.5007"))
                  .timeout(Duration.ofSeconds(30))
                  .header("User-Agent", "ExploreShoot/6.1 campus prototype")
                  .build(),
              HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() != 200)
        throw new IllegalStateException("OSM 返回 " + response.statusCode());
      data = parse(response.body());
    } else throw new IllegalArgumentException("用法：map-refresh [--from <JSON 文件>]");
    var geo = convert(data);
    Path target = root.resolve("dist/shared/campus.geojson"),
        temporary = Files.createTempFile(target.getParent(), "campus-", ".tmp");
    try {
      Files.writeString(temporary, write(geo));
      Files.move(
          temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    } finally {
      Files.deleteIfExists(temporary);
    }
    System.out.println(
        "已更新校园地理资料："
            + rows(geo.get("features")).size()
            + " 个要素，"
            + map(geo.get("metadata")).get("roadCount")
            + " 段道路");
  }
}
