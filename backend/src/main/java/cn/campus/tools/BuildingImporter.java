package cn.campus.tools;

import static cn.campus.common.Json.*;

import cn.campus.common.Json;
import cn.campus.maps.CampusBuildingService;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.*;

/** Offline import: no scraping of provider tiles, no connection to the user's live database. */
public final class BuildingImporter {
  public static void run(Path root, String[] args) throws Exception {
    if (args.length != 1) throw new IllegalArgumentException("用法：buildings <公开OSM地图文件路径>");
    var factory = DocumentBuilderFactory.newInstance();
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
    var document = factory.newDocumentBuilder().parse(Path.of(args[0]).toFile());
    Map<String, List<Double>> nodes = new HashMap<>();
    var items = document.getElementsByTagName("node");
    for (int i = 0; i < items.getLength(); i++) {
      Element n = (Element) items.item(i);
      nodes.put(
          n.getAttribute("id"),
          List.of(
              Double.parseDouble(n.getAttribute("lon")),
              Double.parseDouble(n.getAttribute("lat"))));
    }
    var campus =
        map(
            parse(Files.readString(root.resolve("backend/src/main/resources/campus-seed.json")))
                .get("campus"));
    List<Map<String, Object>> buildings = new ArrayList<>();
    var ways = document.getElementsByTagName("way");
    for (int i = 0; i < ways.getLength(); i++) {
      Element way = (Element) ways.item(i);
      Map<String, Object> tags = obj();
      var tagNodes = way.getElementsByTagName("tag");
      for (int j = 0; j < tagNodes.getLength(); j++) {
        var tag = (Element) tagNodes.item(j);
        String key = tag.getAttribute("k");
        if (Set.of("name", "building", "height", "building:levels", "amenity", "leisure")
            .contains(key)) tags.put(key, tag.getAttribute("v"));
      }
      if (str(tags.get("building")).isEmpty() || eq(tags.get("building"), "no")) continue;
      List<Object> ring = new ArrayList<>();
      var nd = way.getElementsByTagName("nd");
      boolean valid = true;
      for (int j = 0; j < nd.getLength(); j++) {
        var node = nodes.get(((Element) nd.item(j)).getAttribute("ref"));
        if (node == null
            || !CampusBuildingService.contains(
                list(campus.get("boundary")), node.get(0), node.get(1))) {
          valid = false;
          break;
        }
        ring.add(node);
      }
      if (!valid || ring.size() < 4 || !ring.getFirst().equals(ring.getLast())) continue;
      double lng = 0, lat = 0;
      for (int j = 0; j < ring.size() - 1; j++) {
        lng += num(list(ring.get(j)).get(0));
        lat += num(list(ring.get(j)).get(1));
      }
      String id = way.getAttribute("id");
      buildings.add(
          obj(
              "id",
              "osm-way-" + id,
              "name",
              str(tags.get("name")),
              "footprint",
              ring,
              "center",
              obj("lng", lng / (ring.size() - 1), "lat", lat / (ring.size() - 1)),
              "sourceUrl",
              "https://www.openstreetmap.org/way/" + id,
              "tags",
              tags));
    }
    if (buildings.isEmpty()) throw new IllegalArgumentException("没有可用的校园建筑轮廓；原数据未改动");
    Path output = root.resolve("backend/src/main/resources/campus-buildings.json");
    Files.writeString(
        output,
        Json.MAPPER
                .writerWithDefaultPrettyPrinter()
                .writeValueAsString(
                    obj(
                        "source",
                        "OpenStreetMap",
                        "license",
                        "ODbL-1.0",
                        "fetchedAt",
                        LocalDate.now().toString(),
                        "coordinateSystem",
                        "WGS84",
                        "buildings",
                        buildings))
            + "\n");
    System.out.println("已导入建筑轮廓：" + buildings.size() + "；高度由Java解析，缺失高度标记为估算。");
  }
}
