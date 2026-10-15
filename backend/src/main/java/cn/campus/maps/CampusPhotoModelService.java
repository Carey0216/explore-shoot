package cn.campus.maps;

import static cn.campus.common.Json.*;

import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.stereotype.Service;

/** Roofs and background share one image frame. No image coordinate is a GPS fix. */
@Service
public final class CampusPhotoModelService {
  private final Map<String, Object> source;
  private final CampusAppearanceService appearance;
  private final double width, height, scale;

  public CampusPhotoModelService(CampusAppearanceService appearance) throws java.io.IOException {
    this.appearance = appearance;
    try (var in =
        Objects.requireNonNull(getClass().getResourceAsStream("/campus-photo-roofs.json"))) {
      source = parse(new String(in.readAllBytes(), StandardCharsets.UTF_8));
    }
    width = num(source.get("imageWidth"));
    height = num(source.get("imageHeight"));
    scale = num(source.get("metresPerPixel"));
    if (width <= 0 || height <= 0 || scale <= 0 || scale > 10)
      throw new IllegalArgumentException("Invalid aerial image dimensions");
  }

  private List<Double> point(Object raw) {
    var p = list(raw);
    if (p.size() != 2
        || !Double.isFinite(num(p.get(0)))
        || !Double.isFinite(num(p.get(1)))
        || num(p.get(0)) < 0
        || num(p.get(0)) > width
        || num(p.get(1)) < 0
        || num(p.get(1)) > height)
      throw new IllegalArgumentException("Roof leaves the source photograph");
    // Rotate the portrait photograph in the viewing frame without editing the original JPEG.
    return List.of((num(p.get(1)) - height / 2) * scale, (width / 2 - num(p.get(0))) * scale);
  }

  private List<List<Double>> ring(Object raw) {
    var result = list(raw).stream().map(this::point).toList();
    if (result.size() < 3) throw new IllegalArgumentException("Incomplete roof outline");
    return result;
  }

  public Map<String, Object> scene() {
    var asset =
        rows(appearance.assets().get("textures")).stream()
            .filter(t -> eq(t.get("id"), "overhead"))
            .findFirst()
            .orElseThrow();
    if (!eq(asset.get("originalSHA256"), source.get("sourceSHA256"))
        || num(asset.get("width")) != width
        || num(asset.get("height")) != height)
      throw new IllegalStateException("Roof outlines do not match the supplied photograph");
    var models = new ArrayList<Map<String, Object>>();
    for (var b : rows(source.get("buildings"))) {
      var outline = ring(b.get("outline"));
      var holes = list(b.get("holes")).stream().map(this::ring).toList();
      double h = num(b.get("height"));
      if (h < 3 || h > 80) throw new IllegalArgumentException("Invalid estimated roof height");
      double minX = outline.stream().mapToDouble(p -> p.get(0)).min().orElseThrow();
      double maxX = outline.stream().mapToDouble(p -> p.get(0)).max().orElseThrow();
      double minZ = outline.stream().mapToDouble(p -> p.get(1)).min().orElseThrow();
      double maxZ = outline.stream().mapToDouble(p -> p.get(1)).max().orElseThrow();
      var parts = new ArrayList<Map<String, Object>>();
      addRoof(parts, outline, holes, h);
      for (var section : rows(b.get("sections"))) {
        double upper = num(section.get("height"));
        if (upper <= h || upper > 80)
          throw new IllegalArgumentException("Invalid upper roof height");
        addRoof(parts, ring(section.get("outline")), List.of(), upper);
        h = Math.max(h, upper);
      }
      String zone = str(b.get("id")).startsWith("west-") ? "west" : "east";
      models.add(
          obj(
              "id",
              b.get("id"),
              "name",
              b.get("name"),
              "nameConfirmed",
              false,
              "position",
              List.of((minX + maxX) / 2, 0, (minZ + maxZ) / 2),
              "extent",
              List.of(maxX - minX, h + .05, maxZ - minZ),
              "height",
              h + .05,
              "style",
              "image-roof",
              "parts",
              parts,
              "appearance",
              obj("zone", zone),
              "heightEstimated",
              true,
              "appearanceEstimated",
              true,
              "positionEstimated",
              true,
              "photoSource",
              "supplied-overhead-image",
              "constructionMode",
              "image-roof-projection+estimated-walls"));
    }
    var materials = appearance.materials();
    materials.put(
        "photoImage",
        obj("url", asset.get("url"), "region", List.of(0, 0, 1, 1), "photographic", true));
    var ground =
        List.of(
            point(List.of(0, 0)),
            point(List.of(width, 0)),
            point(List.of(width, height)),
            point(List.of(0, height)));
    return obj(
        "version",
        1,
        "coordinateSystem",
        "local-metres",
        "layoutBasis",
        "supplied-overhead-image",
        "displayOnly",
        true,
        "georeferenced",
        false,
        "scaleEstimated",
        true,
        "imageMapping",
        obj("width", width, "height", height, "metresPerPixel", scale),
        "imageGround",
        obj("ring", ground, "base", -.08, "material", "photoImage"),
        "models",
        models,
        "landscape",
        List.of(),
        "roads",
        List.of(),
        "fields",
        List.of(),
        "facilities",
        List.of(),
        "materials",
        materials,
        "assets",
        appearance.assets(),
        "coverage",
        obj("buildingCount", models.size()),
        "notice",
        "屋顶与地面来自同一张用户提供的俯瞰照片；墙面、楼高及比例为估算，尚未配准导航地图。拍摄时间和测绘参数未知。");
  }

  private void addRoof(
      List<Map<String, Object>> parts,
      List<List<Double>> outline,
      List<List<List<Double>>> holes,
      double h) {
    parts.add(
        obj(
            "shape",
            "prism",
            "ring",
            outline,
            "holes",
            holes,
            "height",
            h,
            "base",
            0,
            "material",
            "ivory"));
    // Visible side walls have plausible window spacing; they are explicitly not measured
    // photographs.
    appearance.addSurfaces(
        parts,
        obj("facade", "ivoryWindow", "floors", Math.max(1, Math.round(h / 3.5)), "roof", "flat"),
        outline,
        holes,
        h);
    parts.add(
        obj(
            "shape",
            "imageRoof",
            "ring",
            outline,
            "holes",
            holes,
            "base",
            h + .03,
            "material",
            "photoImage"));
  }
}
