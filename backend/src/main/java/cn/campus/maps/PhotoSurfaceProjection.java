package cn.campus.maps;

import static cn.campus.common.Json.*;

import java.util.*;

/** Projects an unchanged photograph onto a planar facade; dimensions remain estimates. */
public final class PhotoSurfaceProjection {
  private PhotoSurfaceProjection() {}

  // Corners run top-left, top-right, bottom-right, bottom-left in the original photograph.
  // A single two-triangle quad bends perspective window rows. Small planar cells approximate
  // the projective transform while keeping the actual building's wall perfectly straight.
  public static List<Map<String, Object>> panels(
      List<List<Double>> wall, double[][] photo, int columns, int rows, String material) {
    if (wall.size() != 4
        || photo.length != 4
        || columns < 1
        || columns > 32
        || rows < 1
        || rows > 16) throw new IllegalArgumentException("Invalid photograph projection input");
    for (var p : wall)
      if (p.size() != 3 || p.stream().anyMatch(v -> !Double.isFinite(v)))
        throw new IllegalArgumentException("Invalid wall coordinates");
    for (var p : photo)
      if (p.length != 2 || Arrays.stream(p).anyMatch(v -> !Double.isFinite(v) || v < 0 || v > 1))
        throw new IllegalArgumentException("Invalid photograph corners");
    double dx1 = photo[1][0] - photo[2][0], dx2 = photo[3][0] - photo[2][0];
    double dy1 = photo[1][1] - photo[2][1], dy2 = photo[3][1] - photo[2][1];
    double dx3 = photo[0][0] - photo[1][0] + photo[2][0] - photo[3][0];
    double dy3 = photo[0][1] - photo[1][1] + photo[2][1] - photo[3][1];
    double determinant = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(determinant) < 1e-10)
      throw new IllegalArgumentException("Degenerate photograph quadrilateral");
    double g = (dx3 * dy2 - dx2 * dy3) / determinant;
    double h = (dx1 * dy3 - dx3 * dy1) / determinant;
    double a = photo[1][0] - photo[0][0] + g * photo[1][0];
    double b = photo[3][0] - photo[0][0] + h * photo[3][0];
    double d = photo[1][1] - photo[0][1] + g * photo[1][1];
    double e = photo[3][1] - photo[0][1] + h * photo[3][1];
    var result = new ArrayList<Map<String, Object>>();
    for (int y = 0; y < rows; y++) {
      for (int x = 0; x < columns; x++) {
        var vertices = new ArrayList<List<Double>>();
        var uv = new ArrayList<List<Double>>();
        for (var p : new int[][] {{x, y}, {x + 1, y}, {x + 1, y + 1}, {x, y + 1}}) {
          double u = (double) p[0] / columns, v = (double) p[1] / rows;
          var point = new ArrayList<Double>();
          for (int axis = 0; axis < 3; axis++)
            point.add(
                wall.get(0).get(axis) * (1 - u) * (1 - v)
                    + wall.get(1).get(axis) * u * (1 - v)
                    + wall.get(2).get(axis) * u * v
                    + wall.get(3).get(axis) * (1 - u) * v);
          double q = g * u + h * v + 1;
          if (q <= 0 || !Double.isFinite(q))
            throw new IllegalArgumentException("Photograph projection crosses the horizon");
          vertices.add(point);
          uv.add(List.of((a * u + b * v + photo[0][0]) / q, 1 - (d * u + e * v + photo[0][1]) / q));
        }
        result.add(obj("shape", "surface", "material", material, "vertices", vertices, "uv", uv));
      }
    }
    return result;
  }
}
