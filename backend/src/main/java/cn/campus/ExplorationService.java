package cn.campus;

import static cn.campus.Json.*;
import static cn.campus.Security.*;

import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import org.springframework.stereotype.Service;

@Service
public class ExplorationService {
  private final MediaService media;

  public ExplorationService(MediaService media) {
    this.media = media;
  }

  private Map<String, Object> prefs(Object input) {
    Map<String, Object> p = map(input);
    if (!whole(p.get("budget"))
        || !whole(p.get("people"))
        || !List.of(15L, 20L, 30L).contains(integer(p.get("budget")))
        || !List.of(1L, 2L).contains(integer(p.get("people")))
        || !List.of("轻松", "适中").contains(p.get("intensity"))
        || !List.of("全部", "建筑", "自然", "人文", "运动").contains(p.get("theme"))
        || !List.of("guide", "fixed", "personal").contains(p.get("mode")))
      throw new ApiException("探索偏好无效");
    return obj(
        "budget",
        p.get("budget"),
        "people",
        p.get("people"),
        "intensity",
        p.get("intensity"),
        "theme",
        p.get("theme"),
        "mode",
        p.get("mode"));
  }

  private boolean visible(Map<String, Object> p) {
    return yes(p.get("published")) && yes(p.get("open"));
  }

  private Map<String, Object> plan(
      StoreRepository s, Map<String, Object> r, Map<String, Object> p) {
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
    return out;
  }

  private Map<String, Object> view(StoreRepository s, Map<String, Object> session) {
    List<Object> blocked = new ArrayList<>();
    for (Map<String, Object> t : rows(session.get("tasks")))
      if (eq(t.get("status"), "pending")
          && s.rows("points").stream()
              .noneMatch(p -> eq(p.get("id"), t.get("pointId")) && visible(p)))
        blocked.add(t.get("pointName"));
    if (s.rows("routes").stream()
            .noneMatch(r -> eq(r.get("id"), session.get("routeId")) && yes(r.get("active")))
        && rows(session.get("tasks")).stream().anyMatch(t -> eq(t.get("status"), "pending")))
      blocked.add("路线已停用");
    Map<String, Object> out = copy(session);
    out.put("blocked", blocked);
    return out;
  }

  private long elapsed(Map<String, Object> s) {
    return integer(s.get("elapsed"))
        + (eq(s.get("status"), "active") ? TimeSource.now() - integer(s.get("lastResume")) : 0);
  }

  public boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("user")) return false;
    StoreRepository s = c.store;
    Map<String, Object> b = c.body, a = c.account;
    if (c.route("/api/plan", "POST")) {
      Map<String, Object> p = prefs(b);
      c.send(
          s.rows("routes").stream()
              .filter(r -> yes(r.get("active")))
              .map(r -> plan(s, r, p))
              .sorted(
                  Comparator.comparing((Map<String, Object> r) -> yes(r.get("match"))).reversed())
              .toList());
      return true;
    }
    if (c.route("/api/sessions", "GET")) {
      c.need();
      c.send(
          s.rows("sessions").stream()
              .filter(x -> eq(x.get("ownerId"), a.get("id")))
              .map(x -> view(s, x))
              .toList());
      return true;
    }
    if (c.route("/api/sessions", "POST")) {
      c.need();
      Map<String, Object> p = prefs(b.get("preferences")),
          rt = find(s.rows("routes"), "id", b.get("routeId"));
      if (rt == null) throw new ApiException("路线不存在", 404);
      Map<String, Object> old =
          s.rows("sessions").stream()
              .filter(
                  x ->
                      eq(x.get("ownerId"), a.get("id"))
                          && List.of("active", "paused").contains(x.get("status")))
              .findFirst()
              .orElse(null);
      if (old != null) {
        c.send(view(s, old));
        return true;
      }
      Map<String, Object> result = plan(s, rt, p);
      if (!yes(result.get("available"))) throw new ApiException(str(result.get("reason")), 409);
      List<Map<String, Object>> tasks = new ArrayList<>();
      for (Object pid : list(rt.get("points"))) {
        Map<String, Object> point = find(s.rows("points"), "id", pid),
            t =
                s.rows("templates").stream()
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
              a.get("id"),
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
              s.db.get("version"),
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
      s.rows("sessions").add(session);
      s.rows("logs")
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
                  s.db.get("version")));
      s.save();
      c.send(view(s, session), 201);
      return true;
    }
    Matcher m = Pattern.compile("^/api/sessions/([a-f0-9-]+)(?:/(export|track))?$").matcher(c.path);
    if (!m.matches()) return false;
    c.need();
    Map<String, Object> session =
        s.rows("sessions").stream()
            .filter(x -> eq(x.get("id"), m.group(1)) && eq(x.get("ownerId"), a.get("id")))
            .findFirst()
            .orElse(null);
    if (session == null) throw new ApiException("记录不存在", 404);
    if (c.method.equals("DELETE")) {
      s.rows("sessions").remove(session);
      s.save();
      for (Map<String, Object> t : rows(session.get("tasks"))) media.purge(s, t.get("mediaId"));
      s.save();
      c.send(obj("ok", true));
      return true;
    }
    if ("export".equals(m.group(2)) && c.method.equals("GET")) {
      c.response.setContentType("text/html; charset=utf-8");
      c.response.setHeader(
          "Content-Disposition",
          "attachment; filename=\"nmu-note-" + str(session.get("id")).substring(0, 8) + ".html\"");
      c.response
          .getOutputStream()
          .write(export(s, session).getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return true;
    }
    if ("track".equals(m.group(2)) && c.method.equals("POST")) {
      if (!eq(session.get("status"), "active")) throw new ApiException("暂停或结束时不能记录轨迹");
      List<Object> input = list(b.get("points")), track = list(session.get("track"));
      if (!(b.get("points") instanceof List)
          || input.isEmpty()
          || input.size() > 50
          || track.size() + input.size() > 10000) throw new ApiException("轨迹点数量无效");
      List<Map<String, Object>> points = new ArrayList<>();
      for (Object item : input) {
        Map<String, Object> p = map(item),
            coord = Campus.coordinate(s.campus, p.get("lng"), p.get("lat"));
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
      s.save();
      c.send(obj("count", track.size()));
      return true;
    }
    if (!c.method.equals("PATCH")) return false;
    String action = str(b.get("action")), status = str(session.get("status"));
    if (action.equals("pause") && status.equals("active")) {
      session.put("elapsed", elapsed(session));
      session.put("status", "paused");
    } else if (action.equals("resume") && status.equals("paused")) {
      if (!list(view(s, session).get("blocked")).isEmpty())
        throw new ApiException("点位已经下线，请结束后重新选择", 409);
      session.put("status", "active");
      session.put("lastResume", TimeSource.now());
    } else if (List.of("finish", "exit").contains(action)) {
      if (!List.of("active", "paused").contains(status)) throw new ApiException("探索已经结束");
      if (action.equals("finish")
          && rows(session.get("tasks")).stream().anyMatch(t -> eq(t.get("status"), "pending")))
        throw new ApiException("请先完成或跳过剩余任务");
      session.put("elapsed", elapsed(session));
      session.put("status", action.equals("finish") ? "completed" : "ended");
      session.put("endedAt", StoreRepository.now());
    } else if (action.equals("task")) {
      if (!status.equals("active")) throw new ApiException("请先恢复探索");
      if (!list(view(s, session).get("blocked")).isEmpty())
        throw new ApiException("当前点位或路线已下线，不能继续任务", 409);
      Map<String, Object> t = find(rows(session.get("tasks")), "id", b.get("taskId"));
      if (t == null || !List.of("done", "skipped").contains(b.get("status")))
        throw new ApiException("任务状态无效");
      boolean done = eq(b.get("status"), "done");
      String reason = text(b.get("reason"), 300);
      if (!done && reason.isEmpty()) throw new ApiException("请填写跳过原因");
      t.putAll(
          obj(
              "status",
              b.get("status"),
              "completedAt",
              done ? t.getOrDefault("completedAt", StoreRepository.now()) : null,
              "reason",
              done ? "" : reason));
    } else if (action.equals("photo")) {
      Map<String, Object> t = find(rows(session.get("tasks")), "id", b.get("taskId"));
      if (t == null) throw new ApiException("任务不存在");
      Object previous = t.get("mediaId");
      if (b.get("mediaId") != null) c.ownedMedia(b.get("mediaId"));
      t.put("mediaId", b.get("mediaId"));
      s.save();
      if (!eq(previous, t.get("mediaId"))) media.purge(s, previous);
    } else if (action.equals("feedback")) {
      session.put("feedback", text(b.get("feedback")));
      session.put(
          "rating",
          whole(b.get("rating")) && num(b.get("rating")) >= 0 && num(b.get("rating")) <= 5
              ? b.get("rating")
              : 0);
    } else throw new ApiException("当前状态不支持此操作");
    s.save();
    c.send(view(s, session));
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
