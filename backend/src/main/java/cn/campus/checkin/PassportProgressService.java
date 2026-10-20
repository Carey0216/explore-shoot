package cn.campus.checkin;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.exploration.SessionViews;
import cn.campus.maps.CampusPhotoModelService;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/** Owner-only, recomputed achievements: no client-supplied unlocks or public travel history. */
@Service
public class PassportProgressService {
  private final CampusPhotoModelService photoModel;
  private final Map<String, Object> photo, plan;
  private static final Set<String> KINDS = Set.of("collection", "night", "photos", "visits");
  private static final Set<String> SYMBOLS =
      Set.of("building", "moon", "camera", "leaf", "star", "walk");

  public PassportProgressService(CampusPhotoModelService photoModel) throws Exception {
    this.photoModel = photoModel;
    photo = resource("/campus-photo-roofs.json");
    plan = resource("/campus-model.json");
  }

  private Map<String, Object> resource(String path) throws Exception {
    try (var in = Objects.requireNonNull(getClass().getResourceAsStream(path))) {
      return parse(new String(in.readAllBytes(), StandardCharsets.UTF_8));
    }
  }

  public static List<Map<String, Object>> ownedRecords(ApiContext c) {
    Object owner = c.need().get("id");
    return PassportService.records(
        c.store.rows("checkins").stream().filter(r -> eq(r.get("ownerId"), owner)).toList(),
        c.store.rows("sessions").stream()
            .filter(r -> eq(r.get("ownerId"), owner))
            .map(r -> SessionViews.view(c.store, r))
            .toList());
  }

  public static Map<String, Object> achievement(
      Map<String, Object> rule, List<Map<String, Object>> records) {
    String kind = str(rule.get("kind"));
    var ids = list(rule.get("pointIds"));
    var matched =
        records.stream()
            .filter(r -> ids.isEmpty() || ids.contains(r.get("pointId")))
            .filter(
                r -> !kind.equals("photos") && !kind.equals("night") || r.get("mediaId") != null)
            .filter(r -> !kind.equals("night") || night(r))
            .toList();
    long progress =
        kind.equals("collection")
            ? matched.stream().map(r -> r.get("pointId")).distinct().count()
            : matched.size();
    long target = integer(rule.get("target"));
    return obj(
        "id",
        rule.get("id"),
        "title",
        rule.get("title"),
        "description",
        rule.get("description"),
        "symbol",
        rule.get("symbol"),
        "badgePreset",
        rule.getOrDefault("badgePreset", "badge-01"),
        "kind",
        kind,
        "target",
        target,
        "progress",
        Math.min(progress, target),
        "earned",
        progress >= target);
  }

  public Map<String, Object> rewards(ApiContext c, List<Map<String, Object>> before) {
    if (!cn.campus.settings.InteractionFeatures.enabled(c.store, "passport")) return obj();
    var after = ownedRecords(c);
    var badges =
        c.store.rows("passportThemes").stream()
            .filter(r -> yes(r.get("published")))
            .filter(r -> !yes(achievement(r, before).get("earned")))
            .map(r -> achievement(r, after))
            .filter(r -> yes(r.get("earned")))
            .toList();
    Set<Object> oldPoints = new HashSet<>(), newPoints = new HashSet<>();
    before.forEach(r -> oldPoints.add(r.get("pointId")));
    after.forEach(r -> newPoints.add(r.get("pointId")));
    var oldAtlas = rows(atlas(c, oldPoints).get("buildings"));
    var buildings =
        rows(atlas(c, newPoints).get("buildings")).stream()
            .filter(
                b ->
                    yes(b.get("collected"))
                        && !yes(find(oldAtlas, "id", b.get("id")).get("collected")))
            .map(
                b ->
                    obj(
                        "id",
                        b.get("id"),
                        "title",
                        b.get("name"),
                        "description",
                        "这栋校园建筑已被你的足迹点亮",
                        "badgePreset",
                        "badge-03"))
            .toList();
    var places =
        c.store.rows("points").stream()
            .filter(
                p ->
                    yes(p.get("published"))
                        && newPoints.contains(p.get("id"))
                        && !oldPoints.contains(p.get("id")))
            .map(
                p ->
                    obj(
                        "id",
                        p.get("id"),
                        "title",
                        p.get("name"),
                        "description",
                        "校园又一处被你点亮了",
                        "badgePreset",
                        "badge-02"))
            .toList();
    return obj("achievements", badges, "buildings", buildings, "places", places);
  }

  private static boolean night(Map<String, Object> r) {
    if (yes(r.get("legacyTime"))) return false;
    try {
      int h = Instant.parse(str(r.get("createdAt"))).atZone(ZoneId.of("Asia/Shanghai")).getHour();
      return h >= 18 || h < 6;
    } catch (Exception e) {
      return false;
    }
  }

  private List<Map<String, Object>> geometry() {
    var all = new ArrayList<Map<String, Object>>();
    for (String frame : List.of("photo", "plan"))
      for (var b : rows((frame.equals("photo") ? photo : plan).get("buildings"))) {
        var out =
            obj(
                "id",
                frame + ":" + b.get("id"),
                "frame",
                frame,
                "name",
                b.get("name"),
                "outline",
                b.get("outline"),
                "holes",
                b.getOrDefault("holes", List.of()));
        all.add(out);
      }
    return all;
  }

  private Map<String, Object> atlas(ApiContext c, Set<Object> visited) {
    var buildings = geometry();
    for (var b : buildings) {
      var binding = find(c.store.rows("passportBuildings"), "id", b.get("id"));
      var ids = binding == null ? List.of() : list(binding.get("pointIds"));
      // Never expose unpublished point IDs, even when an old binding still references them.
      var publicIds =
          ids.stream()
              .filter(
                  id -> {
                    var p = find(c.store.rows("points"), "id", id);
                    return p != null && (c.audience.equals("admin") || yes(p.get("published")));
                  })
              .toList();
      b.put("pointIds", publicIds);
      b.put("name", binding == null ? b.get("name") : binding.get("name"));
      b.put("collected", publicIds.stream().anyMatch(visited::contains));
      b.put("revision", binding == null ? 0 : binding.get("revision"));
    }
    return obj(
        "buildings",
        buildings,
        "photoWidth",
        photo.get("imageWidth"),
        "photoHeight",
        photo.get("imageHeight"),
        "photoURL",
        "/shared/campus-assets/textures/overhead.jpg",
        "planWidth",
        1280,
        "planHeight",
        854,
        "planURL",
        "/shared/campus-plan.jpg");
  }

  public boolean handle(ApiContext c) throws Exception {
    if (c.audience.equals("user") && c.route("/api/my/passport", "GET")) {
      String owner = str(c.need().get("id"));
      var summary = c.store.journeys().summary(owner);
      Set<Object> visited = new HashSet<>(list(summary.get("ids")));
      c.send(
          obj(
              "achievements",
              c.store.rows("passportThemes").stream()
                  .filter(r -> yes(r.get("published")))
                  .map(r -> c.store.journeys().achievement(owner, r))
                  .toList(),
              "atlas",
              atlas(c, visited),
              "summary",
              summary));
      return true;
    }
    if (c.audience.equals("user") && c.route("/api/my/passport/scene", "GET")) {
      Set<Object> visited =
          new HashSet<>(list(c.store.journeys().summary(str(c.need().get("id"))).get("ids")));
      var scene = photoModel.scene();
      var byId = rows(atlas(c, visited).get("buildings"));
      for (var model : rows(scene.get("models"))) {
        var b = find(byId, "id", "photo:" + model.get("id"));
        model.put("collected", b != null && yes(b.get("collected")));
        if (b != null) model.put("name", b.get("name"));
      }
      scene.put("passport", true);
      scene.put("notice", "个人打卡点亮图；楼高和比例为估算，未关联点位的楼宇保持灰色。仅作收集展示，不用于导航。");
      c.send(scene);
      return true;
    }
    if (!c.audience.equals("admin")) return false;
    if (c.route("/api/admin/passport", "GET")) {
      c.need();
      c.send(obj("themes", c.store.rows("passportThemes"), "atlas", atlas(c, Set.of())));
      return true;
    }
    var rulePath =
        Pattern.compile("^/api/admin/passport/themes(?:/([a-f0-9-]+))?$").matcher(c.path);
    if (rulePath.matches() && (c.method.equals("POST") || c.method.equals("PATCH"))) {
      c.need();
      boolean create = rulePath.group(1) == null && c.method.equals("POST");
      if (!create && (rulePath.group(1) == null || !c.method.equals("PATCH"))) return false;
      if (create && !cn.campus.admin.AdminPermissions.privileged(c.account))
        throw new ApiException("仅超级管理员可以创建主题印章", 403);
      var old = create ? null : find(c.store.rows("passportThemes"), "id", rulePath.group(1));
      if (!create && old == null) throw new ApiException("主题印章不存在", 404);
      if (!create) revision(c.body, old);
      if (!Set.of(
              "title",
              "description",
              "symbol",
              "badgePreset",
              "kind",
              "pointIds",
              "target",
              "published",
              "revision")
          .containsAll(c.body.keySet())) throw new ApiException("护照字段无效");
      String title = required(c.body, "title", 60),
          description = required(c.body, "description", 500),
          kind = str(c.body.get("kind")),
          symbol = str(c.body.get("symbol"));
      if (!KINDS.contains(kind) || !SYMBOLS.contains(symbol)) throw new ApiException("印章规则或图案无效");
      String badge =
          str(
              c.body.getOrDefault(
                  "badgePreset",
                  old == null ? "badge-01" : old.getOrDefault("badgePreset", "badge-01")));
      if (!badge.matches("badge-(0[1-9]|[1-4][0-9]|50)")) throw new ApiException("勋章预设无效");
      var ids = pointIds(c, c.body.get("pointIds"));
      if (!whole(c.body.get("target"))
          || integer(c.body.get("target")) < 1
          || integer(c.body.get("target")) > 10000) throw new ApiException("达成数量无效");
      if (kind.equals("collection")
          && (ids.isEmpty() || integer(c.body.get("target")) > ids.size()))
        throw new ApiException("地点收集需选择地点，目标不能超过地点数");
      if (!(c.body.get("published") instanceof Boolean)) throw new ApiException("展示状态无效");
      var rule =
          old == null ? obj("id", Security.id(), "createdAt", StoreRepository.now()) : copy(old);
      rule.putAll(
          obj(
              "title",
              title,
              "description",
              description,
              "badgePreset",
              badge,
              "kind",
              kind,
              "symbol",
              symbol,
              "target",
              c.body.get("target"),
              "pointIds",
              ids,
              "published",
              c.body.get("published"),
              "revision",
              old == null ? 1 : integer(old.get("revision")) + 1,
              "updatedAt",
              StoreRepository.now()));
      if (old == null) c.store.rows("passportThemes").add(rule);
      else {
        old.clear();
        old.putAll(rule);
      }
      c.audit(create ? "创建护照印章" : "维护护照印章", rule.get("id"), title);
      c.store.save();
      c.send(rule, create ? 201 : 200);
      return true;
    }
    if (c.route("/api/admin/passport/buildings", "PUT")) {
      c.need();
      if (!Set.of("id", "name", "pointIds", "revision").containsAll(c.body.keySet()))
        throw new ApiException("楼宇关联字段无效");
      var id = c.body.get("id");
      if (find(geometry(), "id", id) == null) throw new ApiException("楼宇轮廓不存在", 404);
      var old = find(c.store.rows("passportBuildings"), "id", id);
      if (old == null) {
        if (!whole(c.body.get("revision")) || integer(c.body.get("revision")) != 0)
          throw new ApiException("关联已更新，请刷新", 409);
      } else revision(c.body, old);
      var item =
          obj(
              "id",
              id,
              "name",
              required(c.body, "name", 80),
              "pointIds",
              pointIds(c, c.body.get("pointIds")),
              "revision",
              old == null ? 1 : integer(old.get("revision")) + 1);
      if (old == null) c.store.rows("passportBuildings").add(item);
      else {
        old.clear();
        old.putAll(item);
      }
      c.audit("维护护照楼宇关联", id, str(item.get("name")));
      c.store.save();
      c.send(item);
      return true;
    }
    return false;
  }

  private static List<Object> pointIds(ApiContext c, Object raw) {
    if (!(raw instanceof List<?> ids)
        || ids.size() > 200
        || new HashSet<>(ids).size() != ids.size()) throw new ApiException("请选择有效地点");
    for (var id : ids)
      if (!(id instanceof String) || find(c.store.rows("points"), "id", id) == null)
        throw new ApiException("地点不存在");
    return new ArrayList<>(ids);
  }

  private static void revision(Map<String, Object> body, Map<String, Object> old) {
    if (!whole(body.get("revision"))
        || integer(body.get("revision")) != integer(old.get("revision")))
      throw new ApiException("内容已更新，请刷新后重试", 409);
  }

  private static String required(Map<String, Object> body, String key, int length) {
    return cn.campus.point.ShootingSpotService.required(body, key, length);
  }
}
