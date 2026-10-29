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
    return recordsFor(c, owner);
  }
  static List<Map<String,Object>> recordsFor(ApiContext c,Object owner) {
    return PassportService.records(
        c.store.indexed("checkins","ownerId",str(owner)).stream().toList(),
        c.store.indexed("sessions","ownerId",str(owner)).stream()
            .map(r -> SessionViews.view(c.store, r))
            .toList()).stream().filter(r->{
              var reset=find(c.store.rows("passportCheckinResets"),"id",owner+":"+r.get("pointId"));
              if(reset==null || str(reset.get("cutoff")).isEmpty())return true;
              try{return Instant.parse(str(r.get("createdAt"))).isAfter(Instant.parse(str(reset.get("cutoff"))));}
              catch(Exception ignored){return false;}
            }).toList();
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
    var currentAtlas=atlas(c,newPoints);
    var publicPoints = new HashSet<Object>();
    c.store.rows("points").stream().filter(p -> yes(p.get("published"))).forEach(p -> publicPoints.add(p.get("id")));
    var oldMilestones = CollectionGrowth.milestones(before, currentAtlas, c.store.rows("seasonTopics"), publicPoints);
    var milestones = CollectionGrowth.milestones(after, currentAtlas, c.store.rows("seasonTopics"), publicPoints)
        .stream().filter(m -> yes(m.get("earned")) && !yes(find(oldMilestones, "id", m.get("id")).get("earned"))).toList();
    var priorIds=new HashSet<Object>();before.forEach(r->priorIds.add(r.get("id")));
    var visitedNow=new HashSet<Object>();after.stream().filter(r->!priorIds.contains(r.get("id"))).forEach(r->visitedNow.add(r.get("pointId")));
    var revisited=rows(currentAtlas.get("buildings")).stream()
        .filter(b->yes(b.get("collected")) && list(b.get("pointIds")).stream().anyMatch(visitedNow::contains))
        .filter(b->eq(b.get("frame"),"photo"))
        .map(b->obj("id",b.get("id"),"title",b.get("name"))).toList();
    return obj("achievements", badges, "buildings", buildings, "places", places, "milestones", milestones,
        "atlas", buildings.isEmpty() ? null : currentAtlas,
        "revisit",buildings.isEmpty()&&!revisited.isEmpty()?obj("atlas",currentAtlas,"buildings",revisited):null,
        "recorded",!visitedNow.isEmpty());
  }

  /** An interrupted submit may retry an already committed receipt; replay it without new unlocks. */
  public Map<String,Object> savedReceipt(ApiContext c,Map<String,Object> record){
    if(!cn.campus.settings.InteractionFeatures.enabled(c.store,"passport"))return obj();
    var points=new HashSet<Object>();ownedRecords(c).forEach(r->points.add(r.get("pointId")));
    var atlas=atlas(c,points);
    var buildings=rows(atlas.get("buildings")).stream().filter(b->eq(b.get("frame"),"photo")&&yes(b.get("collected"))&&list(b.get("pointIds")).contains(record.get("pointId")))
       .map(b->obj("id",b.get("id"),"title",b.get("name"))).toList();
    return obj("achievements",List.of(),"buildings",List.of(),"places",List.of(),"recorded",true,
       "revisit",buildings.isEmpty()?null:obj("atlas",atlas,"buildings",buildings));
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
      b.put("growthUnavailable", publicIds.size() != ids.size());
      b.put("name", binding == null ? b.get("name") : binding.get("name"));
      b.put("area", binding == null ? "" : binding.getOrDefault("area", ""));
      b.put("collected", publicIds.stream().anyMatch(visited::contains));
      b.put("revision", binding == null ? 0 : binding.get("revision"));
      if (binding != null && binding.containsKey("outline")) {
        b.put("outline", binding.get("outline"));
        b.put("holes", binding.getOrDefault("holes", List.of()));
      }
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
    if (PrivatePlaceTimeline.handle(c)) return true;
    if (c.audience.equals("user") && c.route("/api/my/passport", "GET")) {
      String owner = str(c.need().get("id"));
      var adjusted=c.store.rows("passportCheckinResets").stream().anyMatch(r->eq(r.get("ownerId"),owner));
      var own=adjusted?ownedRecords(c):List.<Map<String,Object>>of();
      var summary = adjusted?PassportService.summary(own,c.store.rows("points").stream().filter(p->yes(p.get("published"))).toList()):c.store.journeys().summary(owner);
      Set<Object> visited = new HashSet<>(list(summary.get("ids")));
      var growthAtlas = atlas(c, visited);
      var publicPoints = new HashSet<Object>();
      c.store.rows("points").stream().filter(p -> yes(p.get("published"))).forEach(p -> publicPoints.add(p.get("id")));
      c.send(
          obj(
              "milestones", CollectionGrowth.milestones(adjusted ? own : ownedRecords(c), growthAtlas, c.store.rows("seasonTopics"), publicPoints),
              "achievements",
              c.store.rows("passportThemes").stream()
                  .filter(r -> yes(r.get("published")))
                  .map(r -> adjusted?achievement(r,own):c.store.journeys().achievement(owner, r))
                  .toList(),
              "atlas",
              growthAtlas,
              "summary",
              summary));
      return true;
    }
    if (c.audience.equals("user") && c.route("/api/my/passport/scene", "GET")) {
      Set<Object> visited = new HashSet<>();ownedRecords(c).forEach(r->visited.add(r.get("pointId")));
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
    if (AtlasHistory.handle(c)) return true;
    if (AtlasCheckinAdmin.handle(c)) return true;
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
      boolean restoring=c.body.containsKey("restoreFrom");
      AtlasHistory.prepareRestore(c);
      if (!Set.of("id", "name", "area", "pointIds", "revision", "outline", "holes").containsAll(c.body.keySet()))
        throw new ApiException("楼宇关联字段无效");
      var id = c.body.get("id");
      if (find(geometry(), "id", id) == null) throw new ApiException("楼宇轮廓不存在", 404);
      var old = find(c.store.rows("passportBuildings"), "id", id);
      String area = str(c.body.getOrDefault("area", old == null ? "" : old.getOrDefault("area", ""))).strip();
      if (area.length() > 40) throw new ApiException("片区名称不能超过40字");
      if (c.body.containsKey("area") && !eq(area, old == null ? "" : old.getOrDefault("area", ""))
          && !cn.campus.admin.AdminPermissions.owner(c.account)) throw new ApiException("仅顶级管理员可以维护片区归属", 403);
      if (old == null) {
        if (!whole(c.body.get("revision")) || integer(c.body.get("revision")) != 0)
          throw new ApiException("关联已更新，请刷新", 409);
      } else revision(c.body, old);
      boolean redraw = c.body.containsKey("outline") || c.body.containsKey("holes");
      Map<String,Object> shape = null;
      if (redraw) {
        if (!cn.campus.admin.AdminPermissions.owner(c.account)) throw new ApiException("仅顶级管理员可以重画楼宇轮廓", 403);
        if (!c.body.containsKey("outline") || !c.body.containsKey("holes")) throw new ApiException("请完整提交轮廓和内院");
        if (c.body.get("outline") != null) {
          boolean overhead = str(id).startsWith("photo:");
          shape = AtlasGeometry.validate(c.body.get("outline"), c.body.get("holes"),
              overhead ? ((Number)photo.get("imageWidth")).doubleValue() : 1280,
              overhead ? ((Number)photo.get("imageHeight")).doubleValue() : 854);
        } else if (!list(c.body.get("holes")).isEmpty()) throw new ApiException("恢复原轮廓时不可附带内院");
      }
      var item =
          obj(
              "id",
              id,
              "name",
              required(c.body, "name", 80),
              "area", area,
              "pointIds",
              pointIds(c, c.body.get("pointIds")),
              "revision",
              old == null ? 1 : integer(old.get("revision")) + 1);
      if (!redraw && old != null && old.containsKey("outline")) {
        item.put("outline", old.get("outline"));
        item.put("holes", old.getOrDefault("holes", List.of()));
      }
      if (shape != null) item.putAll(shape);
      // Every edit, including point bindings and names, gets a verified private pre-change snapshot.
      {
        var dir = c.store.directory.resolve("maintenance-backups/passport-atlas");
        java.nio.file.Files.createDirectories(dir);
        var before = copy(find(geometry(), "id", id));
        if (old != null) before.putAll(old);
        String snapshot = write(obj("id", id, "before", before,
            "after", item, "savedAt", StoreRepository.now(), "actorId", c.account.get("id"), "actorName", c.account.get("name")));
        var file = dir.resolve(Security.id() + ".json");
        java.nio.file.Files.writeString(file, snapshot, StandardCharsets.UTF_8, java.nio.file.StandardOpenOption.CREATE_NEW);
        if (!java.nio.file.Files.readString(file, StandardCharsets.UTF_8).equals(snapshot)) throw new IllegalStateException("楼宇轮廓备份校验失败");
        java.nio.file.Files.writeString(dir.resolve(file.getFileName().toString().replace(".json", ".sha256")), Security.digest(snapshot), StandardCharsets.UTF_8, java.nio.file.StandardOpenOption.CREATE_NEW);
        try { java.nio.file.Files.setPosixFilePermissions(file, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------")); }
        catch (UnsupportedOperationException ignored) { /* Windows inherits private data directory ACL. */ }
      }
      if (old == null) c.store.rows("passportBuildings").add(item);
      else {
        old.clear();
        old.putAll(item);
      }
      c.audit(restoring?"恢复楼宇历史":redraw ? "重画护照楼宇轮廓" : "维护护照楼宇关联", id, str(item.get("name")));
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
