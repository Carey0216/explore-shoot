package cn.campus.exploration;

import static cn.campus.auth.Security.*;
import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.common.TimeSource;
import cn.campus.maps.Campus;
import cn.campus.storage.MediaService;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import org.springframework.stereotype.Service;

@Service
public class ExplorationService {
  private final MediaService media;
  private final RoutePlanningService planner;

  public ExplorationService(MediaService media, RoutePlanningService planner) {
    this.media = media;
    this.planner = planner;
  }

  public boolean handle(ApiContext context) throws Exception {
    if (!context.audience.equals("user")) return false;
    StoreRepository store = context.store;
    Map<String, Object> body = context.body, account = context.account;
    if (planner.handle(context)) return true;
    if (context.route("/api/sessions", "GET")) {
      context.need();
      context.send(
          store.rows("sessions").stream()
              .filter(x -> eq(x.get("ownerId"), account.get("id")))
              .map(x -> SessionViews.view(store, x))
              .toList());
      return true;
    }
    if (context.route("/api/sessions", "POST")) {
      context.need();
      Map<String, Object> p = planner.prefs(body.get("preferences")),
          rt = find(store.rows("routes"), "id", body.get("routeId"));
      if (rt == null) throw new ApiException("路线不存在", 404);
      Map<String, Object> old =
          store.rows("sessions").stream()
              .filter(
                  x ->
                      eq(x.get("ownerId"), account.get("id"))
                          && List.of("active", "paused").contains(x.get("status")))
              .findFirst()
              .orElse(null);
      if (old != null) {
        context.send(SessionViews.view(store, old));
        return true;
      }
      Map<String, Object> result = planner.plan(store, rt, p);
      if (!yes(result.get("available"))) throw new ApiException(str(result.get("reason")), 409);
      List<Map<String, Object>> tasks = new ArrayList<>();
      for (Object pid : list(rt.get("points"))) {
        Map<String, Object> point = find(store.rows("points"), "id", pid),
            t =
                store.rows("templates").stream()
                    .filter(x -> eq(x.get("pointId"), pid) && yes(x.get("approved")))
                    .findFirst()
                    .orElseThrow();
        boolean guide = eq(p.get("mode"), "guide");
        List<Object> steps =
            guide
                ? new ArrayList<>(List.of(point.get("description"), point.get("condition")))
                : new ArrayList<>(list(t.get("steps")));
        if (!guide && integer(p.get("people")) == 2) steps.add(t.get("duo"));
        tasks.add(
            obj(
                "id",
                id(),
                "pointId",
                pid,
                "pointName",
                point.get("name"),
                "title",
                guide ? "观察这处校园空间" : t.get("title"),
                "steps",
                steps,
                "minutes",
                2,
                "condition",
                point.get("condition"),
                "status",
                "pending",
                "reason",
                "",
                "mediaId",
                null));
      }
      Map<String, Object> session =
          obj(
              "id",
              id(),
              "ownerId",
              account.get("id"),
              "routeId",
              rt.get("id"),
              "routeName",
              rt.get("name"),
              "preferences",
              p,
              "plan",
              result,
              "tasks",
              tasks,
              "track",
              new ArrayList<>(),
              "version",
              store.db.get("version"),
              "status",
              "active",
              "elapsed",
              0,
              "lastResume",
              TimeSource.now(),
              "createdAt",
              StoreRepository.now(),
              "feedback",
              "",
              "rating",
              0,
              "generation",
              eq(p.get("mode"), "personal")
                  ? "按偏好匹配审核模板 · 未接入 AI 模型"
                  : eq(p.get("mode"), "guide") ? "普通导览" : "固定拍摄任务");
      store.rows("sessions").add(session);
      store
          .rows("logs")
          .add(
              obj(
                  "id",
                  id(),
                  "at",
                  session.get("createdAt"),
                  "route",
                  rt.get("name"),
                  "status",
                  eq(p.get("mode"), "personal") ? "模板回退" : "校验通过",
                  "total",
                  result.get("total"),
                  "budget",
                  p.get("budget"),
                  "version",
                  store.db.get("version")));
      store.save();
      context.send(SessionViews.view(store, session), 201);
      return true;
    }
    Matcher m =
        Pattern.compile("^/api/sessions/([a-f0-9-]+)(?:/(export|track))?$").matcher(context.path);
    if (!m.matches()) return false;
    context.need();
    Map<String, Object> session =
        store.rows("sessions").stream()
            .filter(x -> eq(x.get("id"), m.group(1)) && eq(x.get("ownerId"), account.get("id")))
            .findFirst()
            .orElse(null);
    if (session == null) throw new ApiException("记录不存在", 404);
    if (context.method.equals("DELETE")) {
      store.rows("sessions").remove(session);
      store.save();
      for (Map<String, Object> t : rows(session.get("tasks"))) media.purge(store, t.get("mediaId"));
      store.save();
      context.send(obj("ok", true));
      return true;
    }
    if ("export".equals(m.group(2)) && context.method.equals("GET")) {
      context.response.setContentType("text/html; charset=utf-8");
      context.response.setHeader(
          "Content-Disposition",
          "attachment; filename=\"nmu-note-" + str(session.get("id")).substring(0, 8) + ".html\"");
      context
          .response
          .getOutputStream()
          .write(export(store, session).getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return true;
    }
    if ("track".equals(m.group(2)) && context.method.equals("POST")) {
      if (!eq(session.get("status"), "active")) throw new ApiException("暂停或结束时不能记录轨迹");
      List<Object> input = list(body.get("points")), track = list(session.get("track"));
      if (!(body.get("points") instanceof List)
          || input.isEmpty()
          || input.size() > 50
          || track.size() + input.size() > 10000) throw new ApiException("轨迹点数量无效");
      List<Map<String, Object>> points = new ArrayList<>();
      for (Object item : input) {
        Map<String, Object> p = map(item),
            coord = Campus.coordinate(store.campus, p.get("lng"), p.get("lat"));
        double at = num(p.get("at")), accuracy = num(p.get("accuracy"));
        if (!Double.isFinite(at)
            || Math.abs(TimeSource.now() - at) > 86400000
            || !Double.isFinite(accuracy)
            || accuracy < 0
            || accuracy > 200) throw new ApiException("定位精度或时间无效");
        coord.putAll(obj("at", p.get("at"), "accuracy", p.get("accuracy")));
        points.add(coord);
      }
      points.sort(Comparator.comparingDouble(p -> num(p.get("at"))));
      double last = track.isEmpty() ? 0 : num(map(track.getLast()).get("at"));
      for (Map<String, Object> p : points)
        if (num(p.get("at")) > last) {
          track.add(p);
          last = num(p.get("at"));
        }
      store.save();
      context.send(obj("count", track.size()));
      return true;
    }
    if (!context.method.equals("PATCH")) return false;
    String action = str(body.get("action")), status = str(session.get("status"));
    if (action.equals("pause") && status.equals("active")) {
      session.put("elapsed", SessionViews.elapsed(session));
      session.put("status", "paused");
    } else if (action.equals("resume") && status.equals("paused")) {
      if (!list(SessionViews.view(store, session).get("blocked")).isEmpty())
        throw new ApiException("点位已经下线，请结束后重新选择", 409);
      session.put("status", "active");
      session.put("lastResume", TimeSource.now());
    } else if (List.of("finish", "exit").contains(action)) {
      if (!List.of("active", "paused").contains(status)) throw new ApiException("探索已经结束");
      if (action.equals("finish")
          && rows(session.get("tasks")).stream().anyMatch(t -> eq(t.get("status"), "pending")))
        throw new ApiException("请先完成或跳过剩余任务");
      session.put("elapsed", SessionViews.elapsed(session));
      session.put("status", action.equals("finish") ? "completed" : "ended");
      session.put("endedAt", StoreRepository.now());
    } else if (action.equals("task")) {
      if (!status.equals("active")) throw new ApiException("请先恢复探索");
      if (!list(SessionViews.view(store, session).get("blocked")).isEmpty())
        throw new ApiException("当前点位或路线已下线，不能继续任务", 409);
      Map<String, Object> t = find(rows(session.get("tasks")), "id", body.get("taskId"));
      if (t == null || !List.of("done", "skipped").contains(body.get("status")))
        throw new ApiException("任务状态无效");
      boolean done = eq(body.get("status"), "done");
      String reason = text(body.get("reason"), 300);
      if (!done && reason.isEmpty()) throw new ApiException("请填写跳过原因");
      t.putAll(
          obj(
              "status",
              body.get("status"),
              "completedAt",
              done ? t.getOrDefault("completedAt", StoreRepository.now()) : null,
              "reason",
              done ? "" : reason));
    } else if (action.equals("photo")) {
      Map<String, Object> t = find(rows(session.get("tasks")), "id", body.get("taskId"));
      if (t == null) throw new ApiException("任务不存在");
      Object previous = t.get("mediaId");
      if (body.get("mediaId") != null) context.ownedMedia(body.get("mediaId"));
      t.put("mediaId", body.get("mediaId"));
      store.save();
      if (!eq(previous, t.get("mediaId"))) media.purge(store, previous);
    } else if (action.equals("feedback")) {
      session.put("feedback", text(body.get("feedback")));
      session.put(
          "rating",
          whole(body.get("rating")) && num(body.get("rating")) >= 0 && num(body.get("rating")) <= 5
              ? body.get("rating")
              : 0);
    } else throw new ApiException("当前状态不支持此操作");
    store.save();
    context.send(SessionViews.view(store, session));
    return true;
  }

  private String export(StoreRepository s, Map<String, Object> session) throws Exception {
    StringBuilder html =
        new StringBuilder(
                "<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"><meta"
                    + " name=\"viewport\" content=\"width=device-width\"><style>body{font:16px/1.9"
                    + " system-ui;max-width:800px;margin:48px"
                    + " auto;padding:24px;color:#222}img{max-width:100%;border-radius:16px}article{border-bottom:1px"
                    + " solid #eee;padding:24px 0}</style><title>")
            .append(escape(session.get("routeName")))
            .append(" · 探索手记</title><h1>")
            .append(escape(session.get("routeName")))
            .append("</h1><p>北方民族大学 · ")
            .append(str(session.get("createdAt")).substring(0, 10))
            .append(" · ")
            .append(map(session.get("preferences")).get("people"))
            .append(" 人探索</p><small>")
            .append(escape(session.get("generation")))
            .append(" · 手动自报完成</small>");
    for (Map<String, Object> t : rows(session.get("tasks"))) {
      html.append("<article><h2>")
          .append(escape(t.get("pointName")))
          .append("</h2><p>")
          .append(escape(t.get("title")))
          .append("</p><p>")
          .append(
              eq(t.get("status"), "done")
                  ? "已完成"
                  : eq(t.get("status"), "skipped") ? "已跳过：" + escape(t.get("reason")) : "未完成")
          .append("</p>");
      Map<String, Object> m = find(s.rows("media"), "id", t.get("mediaId"));
      if (m != null && !yes(m.get("deleted")) && eq(m.get("ownerId"), session.get("ownerId"))) {
        Path file = s.directory.resolve("media/" + m.get("id") + ".jpg");
        if (Files.isRegularFile(file))
          html.append("<img alt=\"")
              .append(escape(t.get("title")))
              .append("\" src=\"data:image/jpeg;base64,")
              .append(Base64.getEncoder().encodeToString(Files.readAllBytes(file)))
              .append("\">");
      }
      html.append("</article>");
    }
    return html.append("<h2>这一刻的感受</h2><p>")
        .append(escape(session.get("feedback")).replace("\n", "<br>"))
        .append("</p><small>已记录 ")
        .append(list(session.get("track")).size())
        .append(" 个轨迹点，导出不包含精确位置。</small></html>")
        .toString();
  }
}
