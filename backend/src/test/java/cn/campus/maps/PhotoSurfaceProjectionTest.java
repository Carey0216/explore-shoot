package cn.campus.maps;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;

class PhotoSurfaceProjectionTest {
  private final List<List<Double>> wall =
      List.of(
          List.of(0., 12., 3.), List.of(100., 12., 3.), List.of(100., 0., 3.), List.of(0., 0., 3.));

  @Test
  void perspectivePhotoKeepsOriginalCornersStraightWallsAndContinuousCellSeams() {
    double[][] photo = {{.1, .2}, {.8, .3}, {.7, .7}, {.2, .6}};
    var panels = PhotoSurfaceProjection.panels(wall, photo, 12, 4, "original-photo");
    assertEquals(48, panels.size());
    var first = panels.getFirst();
    var last = panels.getLast();
    assertEquals(List.of(.1, .8), list(first.get("uv")).getFirst());
    var end = list(list(last.get("uv")).get(2));
    assertEquals(.7, num(end.get(0)), 1e-10);
    assertEquals(.3, num(end.get(1)), 1e-10);
    for (int i = 0; i < panels.size(); i++) {
      var vertices = list(panels.get(i).get("vertices"));
      for (var p : vertices) assertEquals(3, num(list(p).get(2)), 1e-10);
      if (i % 12 != 11) {
        var here = list(panels.get(i).get("uv"));
        var next = list(panels.get(i + 1).get("uv"));
        assertEquals(here.get(1), next.get(0));
        assertEquals(here.get(2), next.get(3));
      }
    }
    // Corresponding points along a photo scan row remain collinear after projection.
    var uv = panels.stream().limit(12).map(p -> list(list(p.get("uv")).get(0))).toList();
    double ax = num(uv.get(0).get(0)), ay = num(uv.get(0).get(1));
    double bx = num(uv.get(11).get(0)), by = num(uv.get(11).get(1));
    for (var p : uv)
      assertEquals(0, (num(p.get(0)) - ax) * (by - ay) - (num(p.get(1)) - ay) * (bx - ax), 1e-10);
  }

  @Test
  void rejectsDegenerateAndOutOfImageProjectionInputs() {
    assertThrows(
        IllegalArgumentException.class,
        () ->
            PhotoSurfaceProjection.panels(
                wall, new double[][] {{0, 0}, {0, 0}, {0, 0}, {0, 0}}, 12, 4, "p"));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            PhotoSurfaceProjection.panels(
                wall, new double[][] {{-1, 0}, {1, 0}, {1, 1}, {0, 1}}, 12, 4, "p"));
  }
}
