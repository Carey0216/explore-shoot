package cn.campus.maps;

import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.file.Files;
import java.util.*;
import org.springframework.stereotype.Service;

/** Map placements have their own revision and publication; no navigation point is modified. */
@Service
public class CampusMapModelService {
  private static final String ADMIN = "/api/admin/campus-map/map-models";
  private static final String USER = "/api/maps/map-models";
  private static final List<String> FIELDS =
      List.of(
          "lng",
          "lat",
          "heading",
          "scale",
          "altitude",
          "source",
          "confirmed",
          "published",
          "revision");

  private Map<String, Object> draft(StoreRepository store) {
    var saved = find(store.rows("campusMapModels"), "id", "clock");
    return saved == null
        ? obj(
            "id",
            "clock",
            "name",
            "钟楼",
            "lng",
            106.1041968,
            "lat",
            38.4962936,
            "heading",
            0,
            "scale",
            .7,
            "altitude",
            0,
            "source",
            "楼宇图估算；尚未配准实景地图",
            "confirmed",
            false,
            "published",
            false,
            "revision",
            0)
        : copy(saved);
  }

  private Map<String, Object> publicModel(StoreRepository store) {
    var record = draft(store);
    var published = map(record.get("publicPlacement"));
    return yes(published.get("confirmed")) && yes(published.get("published"))
        ? copy(published)
        : null;
  }

  private Map<String, Object> safe(Map<String, Object> p, String prefix) {
    var value = copy(p);
    value.remove("publicPlacement");
    value.put("modelUrl", prefix + "/clock/content.glb");
    value.put("modelUnit", "metre");
    value.put("modelUpAxis", "Y");
    value.put("estimated", true);
    value.put("coordinateSystem", "WGS84");
    value.put("modelWidthMetres", 86.07 * num(p.get("scale")));
    value.put("modelHeightMetres", 80 * num(p.get("scale")));
    return value;
  }

  private double bounded(Object raw, double min, double max) {
    double value = num(raw);
    if (!Double.isFinite(value) || value < min || value > max)
      throw new ApiException("模型尺寸、朝向或高度无效");
    return value;
  }

  private Map<String, Object> position(StoreRepository store, Map<String, Object> input) {
    var p = Campus.coordinate(store.campus, input.get("lng"), input.get("lat"));
    p.put("heading", bounded(input.get("heading"), -360, 360));
    p.put("scale", bounded(input.get("scale"), .1, 2));
    p.put("altitude", bounded(input.get("altitude"), -20, 30));
    return p;
  }

  public boolean handle(ApiContext c) throws Exception {
    boolean admin = c.audience.equals("admin");
    String prefix = admin ? ADMIN : USER;
    if (!(c.path.equals(prefix) || c.path.startsWith(prefix + "/"))) return false;
    if (admin) c.need();
    if (c.route(prefix, "GET")) {
      var published = publicModel(c.store);
      c.send(
          obj(
              "coordinateSystem",
              "WGS84",
              "models",
              admin
                  ? List.of(safe(draft(c.store), prefix))
                  : published == null ? List.of() : List.of(safe(published, prefix))));
      return true;
    }
    if (admin && c.route(prefix + "/clock", "PATCH")) {
      var b = c.body;
      if (!FIELDS.containsAll(b.keySet()) || !b.keySet().containsAll(FIELDS))
        throw new ApiException("模型字段无效");
      var previous = draft(c.store);
      if (!whole(b.get("revision"))
          || integer(b.get("revision")) != integer(previous.get("revision")))
        throw new ApiException("模型已被修改，请刷新后重试", 409);
      var updated = copy(previous);
      updated.putAll(position(c.store, b));
      if (!(b.get("source") instanceof String)
          || str(b.get("source")).trim().isEmpty()
          || str(b.get("source")).length() > 300) throw new ApiException("请填写模型位置的核对依据");
      for (String field : List.of("confirmed", "published"))
        if (!(b.get(field) instanceof Boolean)) throw new ApiException("确认与发布选项无效");
      if (yes(b.get("published")) && !yes(b.get("confirmed")))
        throw new ApiException("请先核对模型位置、比例和朝向，再发布");
      updated.put("source", str(b.get("source")).trim());
      updated.put("confirmed", b.get("confirmed"));
      updated.put("published", b.get("published"));
      updated.put("revision", integer(previous.get("revision")) + 1);
      if (yes(b.get("published"))) {
        var snapshot = copy(updated);
        snapshot.remove("publicPlacement");
        updated.put("publicPlacement", snapshot);
      }
      c.store.rows("campusMapModels").removeIf(p -> eq(p.get("id"), "clock"));
      c.store.rows("campusMapModels").add(updated);
      c.store.bump();
      c.audit("修改地图模型", "clock", yes(b.get("published")) ? "发布配准模型" : "保存配准草稿");
      c.store.save();
      c.send(obj("model", safe(updated, prefix)));
      return true;
    }
    if (admin && c.route(prefix + "/clock/unpublish", "POST")) {
      var record = draft(c.store);
      if (!whole(c.body.get("revision"))
          || integer(c.body.get("revision")) != integer(record.get("revision")))
        throw new ApiException("模型已被修改，请刷新后重试", 409);
      record.remove("publicPlacement");
      record.put("published", false);
      record.put("revision", integer(record.get("revision")) + 1);
      c.store.rows("campusMapModels").removeIf(p -> eq(p.get("id"), "clock"));
      c.store.rows("campusMapModels").add(record);
      c.store.bump();
      c.audit("下架地图模型", "clock", "恢复底图建筑");
      c.store.save();
      c.send(obj("model", safe(record, prefix)));
      return true;
    }
    if (c.route(prefix + "/clock/content.glb", "GET")) {
      if (!admin && publicModel(c.store) == null) throw new ApiException("模型尚未发布", 404);
      // Fixed packaged asset only; never read a caller's path or remote URL.
      byte[] bytes =
          Files.readAllBytes(c.store.root.resolve("dist/shared/campus-assets/models/clock.glb"));
      c.response.setContentType("model/gltf-binary");
      c.response.setHeader("Cache-Control", "no-store");
      c.response.setContentLength(bytes.length);
      c.response.getOutputStream().write(bytes);
      return true;
    }
    return false;
  }
}
