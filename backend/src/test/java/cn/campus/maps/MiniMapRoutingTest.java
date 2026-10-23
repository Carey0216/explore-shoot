package cn.campus.maps;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.common.ApiException;
import java.util.*;
import org.junit.jupiter.api.Test;

class MiniMapRoutingTest {
  @Test
  void vendorRoutesNormalizeToGcj02AndMinutesWithoutInventingRoads() {
    var t =
        MiniMapRouting.normalize(
            "tencent",
            obj(
                "status",
                0,
                "result",
                obj(
                    "routes",
                    List.of(
                        obj(
                            "distance",
                            120,
                            "duration",
                            2,
                            "polyline",
                            List.of(38.5, 106.1, 100, 200),
                            "steps",
                            List.of(obj("instruction", "向前走", "polyline_idx", List.of(0, 2))))))));
    assertEquals(List.of(106.1, 38.5), list(t.get("path")).getFirst());
    assertEquals(2.0, t.get("duration"));
    var a =
        MiniMapRouting.normalize(
            "amap",
            obj(
                "status",
                "1",
                "route",
                obj(
                    "paths",
                    List.of(
                        obj(
                            "distance",
                            "120",
                            "duration",
                            "120",
                            "steps",
                            List.of(
                                obj(
                                    "polyline",
                                    "106.1,38.5;106.1002,38.5001",
                                    "instruction",
                                    "<b>向前</b>走")))))));
    var b =
        MiniMapRouting.normalize(
            "baidu",
            obj(
                "status",
                0,
                "result",
                obj(
                    "routes",
                    List.of(
                        obj(
                            "distance",
                            120,
                            "duration",
                            120,
                            "steps",
                            List.of(
                                obj(
                                    "path",
                                    "106.1,38.5;106.1002,38.5001",
                                    "instruction",
                                    "向前走")))))));
    for (var r : List.of(a, b)) {
      assertEquals("GCJ02", r.get("coordinateSystem"));
      assertEquals(2.0, r.get("duration"));
      assertEquals(2, list(r.get("path")).size());
      assertEquals("向前走", rows(r.get("steps")).getFirst().get("instruction"));
    }
    assertThrows(ApiException.class, () -> MiniMapRouting.normalize("amap", obj("status", "0")));
    assertThrows(
        ApiException.class,
        () ->
            MiniMapRouting.normalize(
                "baidu", obj("status", 0, "result", obj("routes", List.of()))));
    assertThrows(
        ApiException.class,
        () ->
            MiniMapRouting.normalize(
                "tencent",
                obj(
                    "status",
                    0,
                    "result",
                    obj(
                        "routes",
                        List.of(obj("polyline", List.of(38.5, 106.1, Double.NaN, 100)))))));
  }

  @Test
  void secretsStayPrivateAndVendorHostsAndCoordinateContractsAreFixed() {
    var settings =
        obj(
            "miniMapProvider",
            "amap",
            "miniAmapKey",
            "private-key",
            "tencentKey",
            "public-web-key");
    assertEquals("amap", MiniMapRouting.config(settings).get("provider"));
    assertFalse(write(MiniMapRouting.config(settings)).contains("private-key"));
    assertEquals("public-web-key", MiniMapRouting.key(settings, "tencent"));
    for (String provider : List.of("tencent", "amap", "baidu")) {
      var uri =
          MiniMapRouting.endpoint(
              provider, "private &key", List.of(106.1, 38.5), List.of(106.2, 38.6));
      assertEquals("https", uri.getScheme());
      assertTrue(
          Set.of("apis.map.qq.com", "restapi.amap.com", "api.map.baidu.com")
              .contains(uri.getHost()));
      assertFalse(uri.toString().contains("private &key"));
    }
    assertThrows(
        ApiException.class, () -> MiniMapRouting.coordinate(obj("lng", Double.NaN, "lat", 38.5)));
    assertThrows(
        ApiException.class,
        () ->
            MiniMapRouting.coordinate(
                obj("lng", 106.1, "lat", 38.5, "url", "https://example.com")));
  }
}
