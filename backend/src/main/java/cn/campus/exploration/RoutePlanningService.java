package cn.campus.exploration;

import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.point.PointSearchService;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.util.*;
import org.springframework.stereotype.Service;

/** 探索预算、路线可用性和路线/途经点位检索统一在 Java 执行。 */
@Service
public class RoutePlanningService {
  public Map<String, Object> prefs(Object input) {
    return cn.campus.exploration.dto.ExplorationPreferencesRequest.from(input).asMap();
  }

  private boolean visible(Map<String, Object> p) {
    return yes(p.get("published")) && yes(p.get("open"));
  }

  public Map<String, Object> plan(StoreRepository s, Map<String, Object> r, Map<String, Object> p) {
    List<Object> ids = list(r.get("points"));
    long stay = ids.size() * 2L,
        buffer = (long) Math.ceil(num(p.get("budget")) * .2),
        total = integer(r.get("walk")) + stay + buffer;
    String reason =
        !yes(r.get("active"))
            ? "路线已停用"
            : ids.stream()
                    .anyMatch(
                        id ->
                            s.rows("points").stream()
                                .noneMatch(x -> eq(x.get("id"), id) && visible(x)))
                ? "部分点位已下线或关闭"
                : ids.stream()
                        .anyMatch(
                            id ->
                                s.rows("templates").stream()
                                    .noneMatch(
                                        x -> eq(x.get("pointId"), id) && yes(x.get("approved"))))
                    ? "拍摄任务等待审核"
                    : eq(p.get("intensity"), "轻松") && !eq(r.get("intensity"), "轻松")
                        ? "请切换为适中步行"
                        : total > num(p.get("budget")) ? "预计 " + total + " 分钟，请增加预算" : "";
    Map<String, Object> out = copy(r);
    out.putAll(
        obj(
            "stay",
            stay,
            "buffer",
            buffer,
            "total",
            total,
            "available",
            reason.isEmpty(),
            "reason",
            reason,
            "match",
            eq(p.get("theme"), "全部") || eq(p.get("theme"), r.get("theme"))));
    out.put(
        "stops",
        ids.stream()
            .map(
                id ->
                    s.rows("points").stream()
                        .filter(point -> eq(point.get("id"), id) && yes(point.get("published")))
                        .findFirst()
                        .map(point -> obj("id", id, "name", point.get("name")))
                        .orElseGet(() -> obj("id", id, "name", "已下线点位")))
            .toList());
    return out;
  }

  public boolean handle(ApiContext context) throws Exception {
    if (!context.audience.equals("user") || !context.route("/api/plan", "POST")) return false;
    var preferences = prefs(context.body);
    Object raw = context.body.get("query");
    if (raw != null && (!(raw instanceof String) || str(raw).length() > 100))
      throw new ApiException("路线搜索关键词无效");
    String query = PointSearchService.normalizedQuery(str(raw));
    context.send(
        context.store.rows("routes").stream()
            .filter(r -> yes(r.get("active")))
            .map(r -> plan(context.store, r, preferences))
            .filter(
                r ->
                    query.isEmpty()
                        || PointSearchService.normalize(
                                str(r.get("name"))
                                    + " "
                                    + str(r.get("theme"))
                                    + " "
                                    + rows(r.get("stops")).stream()
                                        .map(p -> str(p.get("name")))
                                        .reduce("", (a, b) -> a + " " + b))
                            .contains(query))
            .sorted(Comparator.comparing((Map<String, Object> r) -> yes(r.get("match"))).reversed())
            .toList());
    return true;
  }
}
