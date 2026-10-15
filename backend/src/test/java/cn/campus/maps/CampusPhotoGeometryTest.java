package cn.campus.maps;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.awt.geom.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;

class CampusPhotoGeometryTest {
  private Area area(Object raw) {
    var points = list(raw);
    var path = new Path2D.Double();
    for (int i = 0; i < points.size(); i++) {
      var p = list(points.get(i));
      if (i == 0) path.moveTo(num(p.get(0)), num(p.get(1)));
      else path.lineTo(num(p.get(0)), num(p.get(1)));
    }
    path.closePath();
    return new Area(path);
  }

  @Test
  void roofsAvoidOtherBuildingsLakesTracksAndCourtyards() throws Exception {
    Map<String, Object> data;
    try (var in = getClass().getResourceAsStream("/campus-photo-roofs.json")) {
      data = parse(new String(Objects.requireNonNull(in).readAllBytes(), StandardCharsets.UTF_8));
    }
    var roofs = rows(data.get("buildings"));
    var ids = new HashSet<Object>();
    var shapes = new ArrayList<Area>();
    assertTrue(roofs.size() >= 70);
    for (var roof : roofs) {
      assertTrue(ids.add(roof.get("id")));
      for (var vertex : list(roof.get("outline"))) {
        var p = list(vertex);
        assertTrue(num(p.get(0)) >= 0 && num(p.get(0)) <= 822);
        assertTrue(num(p.get(1)) >= 0 && num(p.get(1)) <= 1657);
      }
      var shape = area(roof.get("outline"));
      assertFalse(shape.isEmpty());
      for (var hole : list(roof.get("holes"))) {
        var outside = area(hole);
        outside.subtract(shape);
        assertTrue(outside.isEmpty(), "Courtyard outside " + roof.get("id"));
        shape.subtract(area(hole));
      }
      for (var exclusion : rows(data.get("exclusions"))) {
        var overlap = new Area(shape);
        overlap.intersect(area(exclusion.get("outline")));
        assertTrue(overlap.isEmpty(), roof.get("id") + " overlaps " + exclusion.get("id"));
      }
      for (int i = 0; i < shapes.size(); i++) {
        var overlap = new Area(shape);
        overlap.intersect(shapes.get(i));
        assertTrue(overlap.isEmpty(), roof.get("id") + " overlaps " + roofs.get(i).get("id"));
      }
      for (var upper : rows(roof.get("sections"))) {
        var outside = area(upper.get("outline"));
        outside.subtract(shape);
        assertTrue(outside.isEmpty(), "Tower outside its own building");
      }
      shapes.add(shape);
    }
  }
}
