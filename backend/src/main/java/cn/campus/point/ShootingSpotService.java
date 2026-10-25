package cn.campus.point;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.common.RateLimiter;
import cn.campus.maps.Campus;
import cn.campus.notification.NotificationService;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.file.*;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/** Real shooting positions are separate from legacy advice and place center coordinates. */
@Service
public class ShootingSpotService {
  public static final Set<String> CONDITIONS =
      Set.of("night", "portrait", "architecture", "rain", "solo");
  private final RateLimiter limits;

  public ShootingSpotService(RateLimiter limits) {
    this.limits = limits;
  }

  public static Map<String, Object> published(StoreRepository store, Object id) {
    var spot = find(store.rows("shootingSpots"), "id", id);
    if (spot == null || !eq(spot.get("status"), "published")) return null;
    var point = find(store.rows("points"), "id", spot.get("pointId"));
    return point != null && yes(point.get("published")) ? spot : null;
  }

  public static Map<String, Object> view(Map<String, Object> s) {
    var out = obj();
    for (String k :
        List.of(
            "id",
            "pointId",
            "title",
            "standDescription",
            "lng",
            "lat",
            "heightMeters",
            "heightAdvice",
            "bearing",
            "bestTime",
            "conditions",
            "openingHours",
            "accessNotice",
            "availability",
            "status",
            "revision",
            "compositionTip",
            "verifiedAt",
            "openingWindows")) out.put(k, s.get(k));
    if (str(out.get("compositionTip")).isBlank())
      out.put("compositionTip", CampusGuideService.tip(obj()));
    out.put("tipSource", str(s.get("compositionTip")).isBlank() ? "通用手机练习建议" : "机位编辑建议");
    out.put(
        "verificationNotice",
        str(s.get("verifiedAt")).isBlank() ? "最近实地核验日期待补充" : "最近核验日期由管理员记录，不代表实时通行保证");
    out.put(
        "photo",
        s.get("exampleMediaId") == null ? null : "/api/shooting-spots/" + s.get("id") + "/photo");
    return out;
  }

  public static Map<String, Object> publicView(StoreRepository store, Map<String, Object> spot) {
    var out = view(spot);
    var point = find(store.rows("points"), "id", spot.get("pointId"));
    out.put("pointOpen", point != null && yes(point.get("open")));
    return out;
  }

  public static void photo(ApiContext c, Object mediaId) throws Exception {
    var m = find(c.store.rows("media"), "id", mediaId);
    if (m == null
        || yes(m.get("deleted"))
        || !str(mediaId).matches(cn.campus.storage.MediaReferences.UUID))
      throw new ApiException("照片不存在", 404);
    Path file = c.store.directory.resolve("media/" + mediaId + ".jpg");
    if (!Files.isRegularFile(file)) throw new ApiException("照片不存在", 404);
    if ("thumb".equals(c.request.getParameter("size")))
      file = cn.campus.storage.PhotoVariants.thumbnail(c.store, file);
    cn.campus.storage.ImageDelivery.send(c, file, true);
  }

  public boolean handle(ApiContext c) throws Exception {
    boolean admin = c.audience.equals("admin");
    String base = admin ? "/api/admin/shooting-spots" : "/api/shooting-spots";
    var list = Pattern.compile("^/api/points/([a-z0-9-]+)/shooting-spots$").matcher(c.path);
    if (!admin && list.matches() && c.method.equals("GET")) {
      var point = find(c.store.rows("points"), "id", list.group(1));
      if (point == null || !yes(point.get("published"))) throw new ApiException("地点不存在", 404);
      c.send(
          obj(
              "spots",
              c.store.rows("shootingSpots").stream()
                  .filter(
                      s ->
                          eq(s.get("pointId"), point.get("id"))
                              && published(c.store, s.get("id")) != null)
                  .map(s -> publicView(c.store, s))
                  .toList()));
      return true;
    }
    if (admin && c.route(base, "GET")) {
      c.need();
      c.send(
          obj(
              "spots",
              c.store.rows("shootingSpots").stream()
                  .map(
                      s -> {
                        var out = copy(s);
                        out.put(
                            "photo",
                            s.get("exampleMediaId") == null
                                ? null
                                : base + "/" + s.get("id") + "/photo");
                        return out;
                      })
                  .toList()));
      return true;
    }
    var single = Pattern.compile("^" + base + "/([a-f0-9-]+)(/photo)?$").matcher(c.path);
    if (single.matches() && c.method.equals("GET")) {
      if (admin) c.need();
      var spot =
          admin
              ? find(c.store.rows("shootingSpots"), "id", single.group(1))
              : published(c.store, single.group(1));
      if (spot == null) throw new ApiException("机位不存在或未发布", 404);
      if (single.group(2) != null) photo(c, spot.get("exampleMediaId"));
      else c.send(admin ? view(spot) : publicView(c.store, spot));
      return true;
    }
    boolean create = c.route(base, "POST"),
        edit = single.matches() && single.group(2) == null && c.method.equals("PATCH");
    if (!create && !(admin && edit)) return false;
    c.need();
    if (!admin && !eq(c.account.get("scoutStatus"), "approved"))
      throw new ApiException("新增机位需要校园探索官身份", 403);
    limits.check(c.account.get("id") + ":shooting-spot", 30);
    var b = c.body;
    if (b.keySet().stream()
        .anyMatch(
            k ->
                !List.of(
                        "pointId",
                        "title",
                        "standDescription",
                        "lng",
                        "lat",
                        "heightMeters",
                        "heightAdvice",
                        "bearing",
                        "bestTime",
                        "conditions",
                        "openingHours",
                        "accessNotice",
                        "availability",
                        "exampleMediaId",
                        "status",
                        "revision",
                        "compositionTip",
                        "verifiedAt",
                        "openingWindows")
                    .contains(k))) throw new ApiException("机位字段无效");
    var old = create ? null : find(c.store.rows("shootingSpots"), "id", single.group(1));
    if (edit && old == null) throw new ApiException("机位不存在", 404);
    if (edit
        && (!whole(b.get("revision"))
            || integer(b.get("revision")) != integer(old.get("revision"))))
      throw new ApiException("机位已更新，请刷新后重试", 409);
    var point = find(c.store.rows("points"), "id", b.get("pointId"));
    if (point == null || !admin && !yes(point.get("published")))
      throw new ApiException("地点不存在", 404);
    if (edit && !eq(old.get("pointId"), point.get("id"))) throw new ApiException("机位不能移动至另一个地点");
    String compositionTip = optional(b, old, "compositionTip", 500);
    String verifiedAt = optional(b, old, "verifiedAt", 10);
    if (!admin && b.containsKey("verifiedAt")) throw new ApiException("核验日期由管理员记录", 403);
    if (!verifiedAt.isBlank())
      try {
        if (java.time.LocalDate.parse(verifiedAt)
            .isAfter(java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai"))))
          throw new IllegalArgumentException();
      } catch (RuntimeException e) {
        throw new ApiException("核验日期无效或在未来");
      }
    var openingWindows =
        PlanExecution.windows(
            b.getOrDefault(
                "openingWindows",
                old == null ? List.of() : old.getOrDefault("openingWindows", List.of())));
    String title = required(b, "title", 80),
        stand = required(b, "standDescription", 1000),
        time = required(b, "bestTime", 200);
    var coords = Campus.coordinate(c.store.campus, b.get("lng"), b.get("lat"));
    double bearing = num(b.get("bearing"));
    if (!Double.isFinite(bearing) || bearing < 0 || bearing >= 360)
      throw new ApiException("拍摄朝向为0至小于360度，正北为0度");
    Object height = b.getOrDefault("heightMeters", old == null ? null : old.get("heightMeters"));
    if (height != null
        && (!(height instanceof Number)
            || !Double.isFinite(num(height))
            || num(height) < 0.3
            || num(height) > 3)) throw new ApiException("建议拍摄高度应为0.3至3米，可留空");
    String heightAdvice = optional(b, old, "heightAdvice", 120);
    String status = admin ? str(b.get("status")) : "pending";
    if (!List.of("draft", "pending", "published", "rejected").contains(status))
      throw new ApiException("机位状态无效");
    Object conditions =
        b.getOrDefault(
            "conditions", old == null ? List.of() : old.getOrDefault("conditions", List.of()));
    if (!(conditions instanceof List<?> tags)
        || tags.size() > CONDITIONS.size()
        || new HashSet<>(tags).size() != tags.size()
        || tags.stream().anyMatch(t -> !(t instanceof String) || !CONDITIONS.contains(t)))
      throw new ApiException("拍照条件无效");
    String opening = optional(b, old, "openingHours", 300),
        notice = optional(b, old, "accessNotice", 1000);
    String availability =
        str(
            b.getOrDefault(
                "availability",
                old == null ? "unknown" : old.getOrDefault("availability", "unknown")));
    if (!Set.of("unknown", "open", "limited", "closed").contains(availability))
      throw new ApiException("通行状态无效");
    Object mediaId = b.get("exampleMediaId");
    if (mediaId != null && !(old != null && eq(old.get("exampleMediaId"), mediaId)))
      c.ownedMedia(mediaId);
    var spot =
        old == null
            ? obj(
                "id",
                Security.id(),
                "authorId",
                admin ? null : c.account.get("id"),
                "createdAt",
                StoreRepository.now())
            : copy(old);
    spot.putAll(
        obj(
            "pointId",
            point.get("id"),
            "title",
            title,
            "standDescription",
            stand,
            "bestTime",
            time,
            "bearing",
            bearing,
            "status",
            status,
            "exampleMediaId",
            mediaId,
            "updatedAt",
            StoreRepository.now(),
            "revision",
            old == null ? 1 : integer(old.get("revision")) + 1));
    spot.putAll(
        obj(
            "conditions",
            conditions,
            "openingHours",
            opening,
            "accessNotice",
            notice,
            "availability",
            availability));
    spot.put("compositionTip", compositionTip);
    spot.put("verifiedAt", verifiedAt);
    spot.put("openingWindows", openingWindows);
    spot.put("heightMeters", height);
    spot.put("heightAdvice", heightAdvice);
    spot.putAll(coords);
    if (create) {
      c.store.rows("shootingSpots").add(spot);
      spot = c.store.rows("shootingSpots").getLast();
    } else {
      old.clear();
      old.putAll(spot);
    }
    if (admin
        && (eq(status, "published") || eq(status, "rejected"))
        && (create || !eq(old == null ? null : old.get("notifiedStatus"), status))) {
      NotificationService.add(
          c.store,
          spot.get("authorId"),
          "spot:" + spot.get("id") + ":" + spot.get("revision"),
          "spot",
          "机位审核结果",
          title + "：" + (status.equals("published") ? "审核通过" : "暂未通过"),
          status.equals("published") ? "#spot/" + spot.get("id") : "#me");
      spot.put("notifiedStatus", status);
      if (old != null) old.put("notifiedStatus", status);
    }
    if (admin) c.audit("维护真实机位", spot.get("id"), status);
    c.store.bump();
    c.store.save();
    c.send(admin ? spot : view(spot), create ? 201 : 200);
    return true;
  }

  private static String optional(
      Map<String, Object> b, Map<String, Object> old, String k, int max) {
    Object v = b.getOrDefault(k, old == null ? "" : old.getOrDefault(k, ""));
    if (!(v instanceof String text) || text.length() > max) throw new ApiException("通行信息格式无效");
    return text.trim();
  }

  public static String required(Map<String, Object> body, String field, int max) {
    if (!(body.get(field) instanceof String s) || s.isBlank() || s.length() > max)
      throw new ApiException("请完整填写机位资料，并控制文字长度");
    return s.trim();
  }
}
