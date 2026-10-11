package cn.campus;

import static cn.campus.Json.*;

import java.util.*;

public final class Campus {
  public static Map<String, Object> coordinate(Map<String, Object> campus, Object lng, Object lat) {
    double x = num(lng), y = num(lat);
    boolean inside = false, near = false;
    List<Object> polygon = list(campus.get("boundary"));
    if (!Double.isFinite(x) || !Double.isFinite(y)) throw new ApiException("请选择北方民族大学校区范围内的点位");
    for (int i = 0, j = polygon.size() - 1; i < polygon.size(); j = i++) {
      List<Object> a = list(polygon.get(i)), b = list(polygon.get(j));
      double ax = num(a.get(0)), ay = num(a.get(1)), bx = num(b.get(0)), by = num(b.get(1));
      if ((ay > y) != (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
      double t =
          Math.max(
              0,
              Math.min(
                  1,
                  ((x - ax) * (bx - ax) + (y - ay) * (by - ay))
                      / (Math.pow(bx - ax, 2) + Math.pow(by - ay, 2))));
      if (Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)) <= .00025) near = true;
    }
    if (!inside && !near) throw new ApiException("请选择北方民族大学校区范围内的点位");
    return obj("lng", lng, "lat", lat);
  }

  public static double distance(Map<String, Object> a, Map<String, Object> b) {
    double rad = Math.PI / 180,
        lat = (num(b.get("lat")) - num(a.get("lat"))) * rad,
        lng = (num(b.get("lng")) - num(a.get("lng"))) * rad;
    return 6371000
        * 2
        * Math.asin(
            Math.min(
                1,
                Math.sqrt(
                    Math.pow(Math.sin(lat / 2), 2)
                        + Math.cos(num(a.get("lat")) * rad)
                            * Math.cos(num(b.get("lat")) * rad)
                            * Math.pow(Math.sin(lng / 2), 2))));
  }
}
