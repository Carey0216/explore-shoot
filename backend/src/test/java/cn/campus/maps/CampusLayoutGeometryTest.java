package cn.campus.maps;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.awt.BasicStroke;
import java.awt.geom.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;

/** Exclusion checks in the original drawing frame, independent of the display conversion. */
class CampusLayoutGeometryTest {
  private Map<String, Object> source() throws Exception {
    try (var in = getClass().getResourceAsStream("/campus-model.json")) {
      return parse(new String(Objects.requireNonNull(in).readAllBytes(), StandardCharsets.UTF_8));
    }
  }

  private Path2D.Double path(Object points, boolean closed) {
    var result = new Path2D.Double();
    var vertices = list(points);
    for (int i = 0; i < vertices.size(); i++) {
      var p = list(vertices.get(i));
      if (i == 0) result.moveTo(num(p.get(0)), num(p.get(1)));
      else result.lineTo(num(p.get(0)), num(p.get(1)));
    }
    if (closed) result.closePath();
    return result;
  }

  private Area ground(Map<String, Object> object) {
    var result = new Area(path(object.get("outline"), true));
    for (var hole : list(object.get("holes"))) result.subtract(new Area(path(hole, true)));
    return result;
  }

  private void separate(Area a, Area b, String label) {
    var overlap = new Area(a);
    overlap.intersect(b);
    assertTrue(overlap.isEmpty(), label + " must not overlap: " + overlap.getBounds2D());
  }

  @Test
  void buildingsCannotOverlapEachOtherLakesOrRunningTracks() throws Exception {
    var d = source();
    var buildings = rows(d.get("buildings"));
    for (int i = 0; i < buildings.size(); i++) {
      var b = buildings.get(i);
      var shape = ground(b);
      for (int j = i + 1; j < buildings.size(); j++)
        separate(shape, ground(buildings.get(j)), b.get("id") + " / " + buildings.get(j).get("id"));
      for (var water : rows(d.get("landscape")))
        if (eq(water.get("kind"), "water")) separate(shape, ground(water), b.get("id") + " / lake");
      for (var field : rows(d.get("fields"))) {
        var c = list(field.get("center"));
        double w = num(field.get("width")), h = num(field.get("depth"));
        var track =
            new Area(
                new RoundRectangle2D.Double(
                    num(c.get(0)) - w / 2, num(c.get(1)) - h / 2, w, h, w, w));
        separate(shape, track, b.get("id") + " / " + field.get("id"));
      }
      for (var road : rows(d.get("roads"))) {
        // Road width is in scene metres; the drawing scale is at least 1.63 m/pixel.
        var corridor =
            new Area(
                new BasicStroke(
                        (float) (num(road.get("width")) / 1.63),
                        BasicStroke.CAP_BUTT,
                        BasicStroke.JOIN_ROUND)
                    .createStrokedShape(path(road.get("points"), false)));
        separate(shape, corridor, b.get("id") + " / road");
      }
    }
    for (var water : rows(d.get("landscape"))) {
      for (var h : list(water.get("holes"))) {
        var outside = new Area(path(h, true));
        outside.subtract(new Area(path(water.get("outline"), true)));
        assertTrue(outside.isEmpty(), "Lake island must stay inside its shoreline");
      }
    }
  }

  @Test
  void numberedLandmarksRetainTheirVisuallyCheckedDrawingPositions() throws Exception {
    var d = source();
    // Control points read against the supplied 1280×854 numbered drawing.
    for (var expected :
        List.of(
            obj("id", "library", "center", List.of(717, 466)),
            obj("id", "residence-15", "center", List.of(457, 510)),
            obj("id", "building-22", "center", List.of(915, 258)),
            obj("id", "west-gym", "center", List.of(232, 508)))) {
      assertEquals(
          write(expected.get("center")),
          write(find(rows(d.get("buildings")), "id", expected.get("id")).get("planCenter")));
    }
    assertEquals(
        "[662,175]", write(find(rows(d.get("fields")), "id", "north-track").get("center")));
  }

  @Test
  void displayUsesOneFrameWithoutReplacingSurveyedMapGeometry() throws Exception {
    var d = source();
    var scene = new CampusModelService(new CampusAppearanceService()).scene();
    assertTrue(yes(scene.get("displayOnly")));
    assertEquals("supplied-numbering-plan", scene.get("layoutBasis"));
    var models = rows(scene.get("models"));
    assertEquals(rows(d.get("buildings")).size(), models.size());
    assertEquals(
        2,
        rows(scene.get("landscape")).stream().filter(p -> !list(p.get("holes")).isEmpty()).count());
    for (var m : models) {
      assertFalse(
          str(m.get("id")).startsWith("osm-way-"),
          "Raw WGS84 footprints cannot be mixed into a drawing-frame model");
      assertTrue(yes(m.get("positionEstimated")));
      assertEquals(m.get("id"), m.get("planId"));
      assertEquals(
          write(find(rows(d.get("buildings")), "id", m.get("id")).get("planCenter")),
          write(m.get("planCenter")));
    }
  }
}
