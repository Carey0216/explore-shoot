package cn.campus.point;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class PhotoWeatherTest {
  @Test
  void solarCoordinatesAndFacingProduceDifferentAdvice() {
    var noon = SolarPosition.at(ZonedDateTime.parse("2026-03-20T12:00:00Z"), 0, 0);
    assertTrue(noon.elevation() > 85);
    assertEquals("silhouette", SolarPosition.lighting(270, 270, 20));
    assertEquals("front", SolarPosition.lighting(90, 270, 20));
    assertEquals("side", SolarPosition.lighting(0, 270, 20));
    assertEquals("unknown", SolarPosition.lighting(Double.NaN, 270, 20));
    assertEquals("diffuse", SolarPosition.lighting(270, 270, 90));
    var morning =
        SolarPosition.at(ZonedDateTime.parse("2026-10-25T09:00:00+08:00"), 38.496, 106.136);
    var evening =
        SolarPosition.at(ZonedDateTime.parse("2026-10-25T17:00:00+08:00"), 38.496, 106.136);
    assertTrue(morning.azimuth() < 180);
    assertTrue(evening.azimuth() > 180);
  }

  @Test
  void incompleteForecastIsRejectedAndClosedRainyOrPastWindowsAreExcluded() {
    var now = Instant.parse("2026-10-25T00:00:00Z");
    var config = obj("label", "银川 · 西夏区", "latitude", 38.496, "longitude", 106.136);
    var raw =
        obj(
            "current",
            obj("time", "2026-10-25T08:00", "temperature_2m", 10, "weather_code", 1),
            "daily",
            obj(
                "time",
                List.of("2026-10-25"),
                "temperature_2m_max",
                List.of(14),
                "temperature_2m_min",
                List.of(5)),
            "hourly",
            obj(
                "time",
                List.of("2026-10-25T10:00", "2026-10-25T16:00"),
                "temperature_2m",
                List.of(10, 12),
                "cloud_cover",
                List.of(10, 10),
                "precipitation_probability",
                List.of(0, 0),
                "wind_speed_10m",
                List.of(4, 4),
                "weather_code",
                List.of(1, 1)));
    var weather = CampusWeatherService.normalize(raw, config, now);
    assertEquals(10, num(weather.get("temperature")));
    var spot =
        obj(
            "id",
            "test",
            "pointId",
            "nmu1",
            "pointOpen",
            true,
            "lat",
            38.496,
            "lng",
            106.136,
            "bearing",
            270,
            "openingWindows",
            List.of());
    assertFalse(rows(CampusWeatherService.recommend(weather, spot, now).get("windows")).isEmpty());
    spot.put("pointOpen", false);
    assertTrue(rows(CampusWeatherService.recommend(weather, spot, now).get("windows")).isEmpty());
    spot.put("pointOpen", true);
    rows(weather.get("hours")).forEach(h -> h.put("rain", 90));
    assertTrue(rows(CampusWeatherService.recommend(weather, spot, now).get("windows")).isEmpty());
    map(raw.get("current")).put("temperature_2m", null);
    assertThrows(
        IllegalArgumentException.class, () -> CampusWeatherService.normalize(raw, config, now));
    map(raw.get("current")).put("temperature_2m", 10);
    map(raw.get("current")).put("time", "2026-10-24T08:00");
    assertThrows(
        IllegalArgumentException.class, () -> CampusWeatherService.normalize(raw, config, now));
  }
}
