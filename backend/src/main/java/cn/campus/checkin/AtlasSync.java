package cn.campus.checkin;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** A verifiable, owner-only source export. Never uploads source data over live annotations. */
public final class AtlasSync {
  private AtlasSync() {}

  static boolean handle(ApiContext c, List<Map<String,Object>> geometry,
      Map<String,Object> photo, Map<String,Object> plan) throws Exception {
    if (!c.route("/api/admin/passport/export", "GET")) return false;
    AtlasHistory.owner(c);
    var buildings = new ArrayList<Map<String,Object>>();
    for (var shape : geometry) {
      var binding = find(c.store.rows("passportBuildings"), "id", shape.get("id"));
      var b = copy(shape);
      b.putAll(obj("pointIds", List.of(), "area", "", "revision", 0));
      if (binding != null) b.putAll(binding);
      // Deliberately exclude actor data, check-ins, personal media and any future internal fields.
      var out = obj();
      for (String key : List.of("id", "name", "area", "pointIds", "revision", "outline", "holes"))
        out.put(key, b.get(key));
      buildings.add(out);
    }
    String base = write(obj("photo", photo, "plan", plan));
    String content = write(obj("geometryChecksum", Security.digest(base), "buildings", buildings));
    String payload = write(obj("exportedAt", StoreRepository.now(), "geometry", base,
        "geometryChecksum", Security.digest(base), "buildings", buildings,
        "content", content, "contentChecksum", Security.digest(content)));
    c.response.setHeader("Cache-Control", "no-store");
    c.send(obj("schema", "jingyu-atlas/1", "payload", payload, "checksum", Security.digest(payload)));
    return true;
  }

  /** Only fill absent building IDs; editing/deleting existing bindings is always an explicit action. */
  public static boolean seed(StoreRepository store) throws Exception {
    try (var input = AtlasSync.class.getResourceAsStream("/passport-atlas-snapshot.json")) {
      if (input == null) return false; // User has not approved a completed cloud export yet.
      var envelope = parse(new String(input.readAllBytes(), StandardCharsets.UTF_8));
      var payload = verified(envelope);
      return mergeMissing(store.rows("passportBuildings"), rows(payload.get("buildings")));
    }
  }

  static boolean mergeMissing(List<Map<String,Object>> live, List<Map<String,Object>> snapshot) {
    boolean changed = false;
    for (var b : snapshot) {
      if (find(live, "id", b.get("id")) != null) continue;
      live.add(copy(b));
      changed = true;
    }
    return changed;
  }

  static Map<String,Object> verified(Map<String,Object> envelope) {
    String payload = str(envelope.get("payload"));
    if (!eq(envelope.get("schema"), "jingyu-atlas/1") ||
        !eq(Security.digest(payload), envelope.get("checksum")))
      throw new ApiException("楼宇源码快照校验失败，拒绝加载", 409);
    var result = parse(payload);
    if (rows(result.get("buildings")).isEmpty() ||
        !eq(Security.digest(str(result.get("geometry"))), result.get("geometryChecksum")) ||
        !eq(Security.digest(str(result.get("content"))), result.get("contentChecksum")))
      throw new ApiException("楼宇源码快照不完整", 409);
    var content = parse(str(result.get("content")));
    if (!eq(content.get("buildings"), result.get("buildings")) ||
        !eq(content.get("geometryChecksum"), result.get("geometryChecksum")))
      throw new ApiException("楼宇源码快照内容版本不一致", 409);
    var ids = new HashSet<Object>();
    var geometry = parse(str(result.get("geometry")));
    for (var b : rows(result.get("buildings"))) {
      String id = str(b.get("id"));
      if (!id.matches("(photo|plan):[a-zA-Z0-9_-]+") || !ids.add(id) ||
          str(b.get("name")).isBlank() || str(b.get("name")).length() > 80 ||
          !(b.get("pointIds") instanceof List<?>) ||
          list(b.get("pointIds")).stream().anyMatch(p -> !(p instanceof String)) ||
          !(b.get("revision") instanceof Number) || integer(b.get("revision")) < 0)
        throw new ApiException("楼宇源码快照字段无效", 409);
      if (b.get("outline") != null) {
        var photo = map(geometry.get("photo"));
        boolean overhead = id.startsWith("photo:");
        AtlasGeometry.validate(b.get("outline"), b.getOrDefault("holes", List.of()),
            overhead ? ((Number) photo.get("imageWidth")).doubleValue() : 1280,
            overhead ? ((Number) photo.get("imageHeight")).doubleValue() : 854);
      }
    }
    return result;
  }
}
