package cn.campus.point;

import java.time.ZonedDateTime;

/** NOAA general solar equations; azimuth clockwise from true north, geometric elevation. */
public final class SolarPosition {
  public record Position(double azimuth, double elevation) {}

  public static Position at(ZonedDateTime time, double latitude, double longitude) {
    double hour = time.getHour() + time.getMinute() / 60d + time.getSecond() / 3600d;
    double g =
        2
            * Math.PI
            / time.toLocalDate().lengthOfYear()
            * (time.getDayOfYear() - 1 + (hour - 12) / 24d);
    double equation =
        229.18
            * (.000075
                + .001868 * Math.cos(g)
                - .032077 * Math.sin(g)
                - .014615 * Math.cos(2 * g)
                - .040849 * Math.sin(2 * g));
    double declination =
        .006918
            - .399912 * Math.cos(g)
            + .070257 * Math.sin(g)
            - .006758 * Math.cos(2 * g)
            + .000907 * Math.sin(2 * g)
            - .002697 * Math.cos(3 * g)
            + .00148 * Math.sin(3 * g);
    double minutes =
        hour * 60 + equation + 4 * longitude - time.getOffset().getTotalSeconds() / 60d;
    double angle = Math.toRadians(((minutes % 1440 + 1440) % 1440) / 4 - 180),
        lat = Math.toRadians(latitude);
    double elevation =
        Math.asin(
            Math.max(
                -1,
                Math.min(
                    1,
                    Math.sin(lat) * Math.sin(declination)
                        + Math.cos(lat) * Math.cos(declination) * Math.cos(angle))));
    double azimuth =
        Math.toDegrees(
                Math.atan2(
                    Math.sin(angle),
                    Math.cos(angle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat)))
            + 180;
    return new Position((azimuth + 360) % 360, Math.toDegrees(elevation));
  }

  public static String lighting(double bearing, double azimuth, double cloud) {
    if (cloud >= 80) return "diffuse";
    if (!Double.isFinite(bearing)) return "unknown";
    double difference = Math.abs(((azimuth - bearing + 540) % 360) - 180);
    return difference <= 40 ? "silhouette" : difference >= 140 ? "front" : "side";
  }

  private SolarPosition() {}
}
