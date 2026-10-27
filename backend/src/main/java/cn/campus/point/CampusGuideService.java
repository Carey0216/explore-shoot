package cn.campus.point;

import static cn.campus.common.Json.*;

import cn.campus.admin.AdminPermissions;
import cn.campus.auth.Security;
import cn.campus.common.*;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.util.*;
import java.util.regex.*;
import org.springframework.stereotype.Service;

/**
 * Editorial guides refer to existing public places; no generated stand or example photo is
 * certified.
 */
@Service
public final class CampusGuideService {
  public static boolean seed(StoreRepository s) throws Exception {
    if (integer(s.db.get("guideSeed720")) == 1) return false;
    try (var input = CampusGuideService.class.getResourceAsStream("/shooting-guides.json")) {
      if (input == null) throw new IllegalStateException("Guide resource missing");
      for (var guide :
          rows(
              parse(new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8))
                  .get("items")))
        if (find(s.rows("shootingGuides"), "id", guide.get("id")) == null)
          s.rows("shootingGuides").add(guide);
    }
    s.db.put("guideSeed720", 1);
    return true;
  }

  public static String tip(Map<String, Object> point) {
    return switch (str(point.get("theme"))) {
      case "建筑" -> "打开九宫格，让竖直建筑线贴近网格线，保持手机竖直，再向侧面挪一步比较画面。";
      case "自然" -> "先选一片叶子或一束花作前景，把远处主体放在另一侧三分线上；拍前轻点主体对焦。";
      case "运动" -> "站在场地边缘允许通行的位置，把手机放低一点，留出人物前进方向的空间。";
      default -> "先找一个明确主体，轻点对焦，把它放在三分线附近，再靠近一步减少杂乱背景。";
    };
  }

  public static int page(String value) {
    try {
      int p = value == null ? 1 : Integer.parseInt(value);
      if (p > 0 && p <= 100000) return p;
    } catch (RuntimeException ignored) {
    }
    throw new ApiException("分页参数无效");
  }

  private static Map<String, Object> view(StoreRepository s, Map<String, Object> guide) {
    var out = copy(guide);
    var points = new ArrayList<Map<String, Object>>();
    for (Object id : list(guide.get("pointIds"))) {
      var p = find(s.rows("points"), "id", id);
      if (p != null && yes(p.get("published"))) {
        var safe = PointService.publicPoint(p);
        safe.put("phoneTip", tip(p));
        points.add(safe);
      }
    }
    out.put("points", points);
    out.put("pointIds", points.stream().map(p -> p.get("id")).toList());
    out.put("notice", "地点顺序为拍摄安排建议，不代表经过实走核验的道路路线；站位、通行与开放信息请查看机位资料并现场确认。");
    return out;
  }

  public static Map<String, Object> preview(StoreRepository s, Map<String, Object> body) {
    RequestValues.fields(body, "question", "budget", "guideId", "spotIds");
    String question = RequestValues.text(body, "question", "", 300, false),
        guideId = RequestValues.text(body, "guideId", "", 100, false);
    int budget = (int) RequestValues.integer(body, "budget", 20, 5, 180);
    var requested = RequestValues.texts(body, "spotIds", 12, 100);
    var guide = guideId.isEmpty() ? null : find(s.rows("shootingGuides"), "id", guideId);
    if (!guideId.isEmpty() && (guide == null || !yes(guide.get("published"))))
      throw new ApiException("指南已下线", 409);
    if (guide != null && !body.containsKey("budget")) budget = (int) integer(guide.get("minutes"));
    var candidates = new ArrayList<Map<String, Object>>();
    if (!requested.isEmpty())
      for (String id : requested) {
        var spot = ShootingSpotService.published(s, id);
        if (spot == null) throw new ApiException("机位已更新，请重新预览", 409);
        candidates.add(spot);
      }
    else if (guide != null)
      for (Object point : list(guide.get("pointIds"))) {
        var match =
            s.page("shootingSpots", "published", "", str(point), 1, 12).items().stream()
                .filter(
                    p ->
                        eq(p.get("pointId"), point)
                            && ShootingSpotService.published(s, p.get("id")) != null)
                .findFirst();
        match.ifPresent(candidates::add);
      }
    else {
      var found = s.rows("shootingSpots").stream()
          .filter(spot -> ShootingSpotService.published(s, spot.get("id")) != null)
          .sorted(Comparator.<Map<String,Object>>comparingInt(spot -> {
            var point = find(s.rows("points"), "id", spot.get("pointId"));
            return SearchLanguage.score(spot, question) + (point == null ? 0 : SearchLanguage.score(point, question));
          }).reversed().thenComparing(spot -> str(spot.get("id"))))
          .limit(240).toList();
      candidates.addAll(found);
    }
    var items = new ArrayList<Map<String, Object>>();
    var points = new ArrayList<Map<String, Object>>();
    Map<String, Object> previous = null;
    var seen = new HashSet<String>();
    double cost = 0;
    for (var spot : candidates) {
      var point = find(s.rows("points"), "id", spot.get("pointId"));
      if (point == null
          || !yes(point.get("published"))
          || !yes(point.get("open"))
          || eq(spot.get("availability"), "closed")
          || !seen.add(str(spot.get("id")))) continue;
      double next =
          cost + 5 + (previous == null ? 0 : Math.ceil(PlanExecution.metres(previous, spot) / 60));
      if (next * 1.2 > budget || items.size() >= 6) continue;
      items.add(
          obj(
              "id",
              Security.id(),
              "spotId",
              spot.get("id"),
              "title",
              spot.get("title"),
              "pointId",
              point.get("id"),
              "composition",
              str(spot.get("compositionTip")).isBlank() ? tip(point) : spot.get("compositionTip"),
              "minutes",
              5,
              "done",
              false));
      points.add(
          obj(
              "id",
              point.get("id"),
              "name",
              point.get("name"),
              "path",
              "#spot/" + spot.get("id"),
              "photo",
              spot.get("exampleMediaId") == null
                  ? null
                  : "/api/shooting-spots/" + spot.get("id") + "/photo"));
      cost = next;
      previous = spot;
    }
    var plan =
        obj(
            "title",
            guide == null ? "我的" + budget + "分钟拍摄计划" : guide.get("title"),
            "items",
            items,
            "departure",
            "",
            "checklist",
            obj());
    return obj(
        "plan",
        plan,
        "places",
        points,
        "budget",
        budget,
        "schedule",
        PlanExecution.evaluate(s, plan),
        "canSave",
        !items.isEmpty(),
        "notice",
        items.isEmpty()
            ? "当前没有符合时长与开放条件的已发布真实机位。可以先浏览地点指南，待机位资料补充后再生成计划。"
            : "已优先安排与你的描述接近的公开机位；偏好不作苛刻筛选，不保证全部条件都符合。每站先拍约5分钟，含步行估算和20%余量。确认后保存清单，再从清单出发、导航和打卡。");
  }

  public boolean handle(ApiContext c) throws Exception {
    if (cn.campus.checkin.WorkComparison.handle(c)) return true;
    if (c.audience.equals("user")) {
      if (c.route("/api/guides", "GET")) {
        c.send(
            obj(
                "items",
                c.store.rows("shootingGuides").stream()
                    .filter(g -> yes(g.get("published")))
                    .map(g -> view(c.store, g))
                    .toList()));
        return true;
      }
      if (c.route("/api/assistant/plan-preview", "POST")) {
        cn.campus.settings.InteractionFeatures.require(c.store, "plans");
        c.send(preview(c.store, c.body));
        return true;
      }
      if (c.route("/api/my/records", "GET")) {
        String owner = str(c.need().get("id"));
        var result = c.store.journeys().records(owner, page(c.request.getParameter("page")), 12);
        c.send(
            obj(
                "items",
                result.items(),
                "total",
                result.total(),
                "page",
                result.page(),
                "hasMore",
                result.hasMore(),
                "summary",
                c.store.journeys().summary(owner)));
        return true;
      }
      if (c.route("/api/my/notes", "GET")) {
        String owner = str(c.need().get("id")),
            query = Objects.toString(c.request.getParameter("query"), "");
        if (query.length() > 100) throw new ApiException("搜索文字过长");
        var result =
            c.store.page("sessions", "", owner, query, page(c.request.getParameter("page")), 12);
        var items =
            result.items().stream()
                .map(
                    r -> {
                      var out = obj();
                      for (String k : List.of("id", "routeName", "createdAt", "status"))
                        out.put(k, r.get(k));
                      out.put(
                          "completedTasks",
                          rows(r.get("tasks")).stream()
                              .filter(t -> eq(t.get("status"), "done"))
                              .count());
                      out.put(
                          "photoCount",
                          rows(r.get("tasks")).stream()
                              .filter(t -> t.get("mediaId") != null)
                              .count());
                      return out;
                    })
                .toList();
        c.send(
            obj(
                "items",
                items,
                "total",
                result.total(),
                "page",
                result.page(),
                "hasMore",
                result.hasMore()));
        return true;
      }
      if (c.route("/api/map/points", "GET")) {
        double[] b = new double[4];
        String[] keys = {"west", "south", "east", "north"};
        for (int i = 0; i < 4; i++)
          try {
            b[i] = Double.parseDouble(c.request.getParameter(keys[i]));
            if (!Double.isFinite(b[i])) throw new NumberFormatException();
          } catch (RuntimeException e) {
            throw new ApiException("地图范围无效");
          }
        if (b[0] < -180 || b[2] > 180 || b[1] < -90 || b[3] > 90 || b[0] >= b[2] || b[1] >= b[3])
          throw new ApiException("地图范围无效");
        var result =
            c.store
                .journeys()
                .map(b[0], b[1], b[2], b[3], page(c.request.getParameter("page")), 60);
        c.send(
            obj(
                "points",
                PointReactionService.publicPoints(c.store, result.items(), c.account),
                "total",
                result.total(),
                "page",
                result.page(),
                "hasMore",
                result.hasMore()));
        return true;
      }
      return false;
    }
    if (!c.path.startsWith("/api/admin/guides")) return false;
    c.need();
    String mode = c.method.equals("GET") ? "read" : "write";
    if (!AdminPermissions.has(c.account, "content." + mode))
      throw new ApiException("没有指南维护权限", 403);
    if (c.route("/api/admin/guides", "GET")) {
      c.send(obj("items", c.store.rows("shootingGuides")));
      return true;
    }
    boolean create = c.route("/api/admin/guides", "POST");
    var match = Pattern.compile("/api/admin/guides/([a-z0-9-]+)").matcher(c.path);
    if (!create && !(match.matches() && c.method.equals("PUT"))) return false;
    var old = create ? null : find(c.store.rows("shootingGuides"), "id", match.group(1));
    if (!create && old == null) throw new ApiException("指南不存在", 404);
    if (!create
        && (!whole(c.body.get("revision"))
            || integer(c.body.get("revision")) != integer(old.get("revision"))))
      throw new ApiException("指南已被更新，请重新载入", 409);
    RequestValues.fields(
        c.body,
        "title",
        "description",
        "scene",
        "minutes",
        "pointIds",
        "steps",
        "published",
        "revision");
    String scene = RequestValues.text(c.body, "scene", "newcomer", 20, true);
    if (!Set.of("newcomer", "break", "evening", "weekend").contains(scene))
      throw new ApiException("指南场景无效");
    var ids = RequestValues.texts(c.body, "pointIds", 8, 100);
    for (String id : ids)
      if (find(c.store.rows("points"), "id", id) == null) throw new ApiException("关联地点不存在");
    var guide =
        obj(
            "id",
            create ? Security.id() : old.get("id"),
            "title",
            RequestValues.text(c.body, "title", "", 80, true),
            "description",
            RequestValues.text(c.body, "description", "", 1000, true),
            "scene",
            scene,
            "minutes",
            RequestValues.integer(c.body, "minutes", 20, 5, 180),
            "pointIds",
            ids,
            "steps",
            RequestValues.texts(c.body, "steps", 8, 500),
            "published",
            RequestValues.flag(c.body, "published", false),
            "revision",
            create ? 1 : integer(old.get("revision")) + 1,
            "updatedAt",
            StoreRepository.now());
    if (create) c.store.rows("shootingGuides").add(guide);
    else {
      old.clear();
      old.putAll(guide);
    }
    c.audit("维护拍摄指南", str(guide.get("id")), str(guide.get("title")));
    c.store.bump();
    c.store.save();
    c.send(guide, create ? 201 : 200);
    return true;
  }
}
