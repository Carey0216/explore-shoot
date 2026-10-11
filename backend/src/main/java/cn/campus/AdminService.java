package cn.campus;

import static cn.campus.Json.*;
import static cn.campus.Security.*;

import java.time.Instant;
import java.util.*;
import java.util.regex.*;
import org.springframework.stereotype.Service;

@Service
public class AdminService {
  public static Map<String, Object> auditView(Map<String, Object> e, boolean superAdmin) {
    Map<String, Object> out = copy(e);
    if (eq(e.get("action"), "调整机位热度") && !superAdmin) out.put("detail", "热度详情仅超级管理员可见");
    if (eq(e.get("subject"), "map") && !eq(e.get("action"), "验证地图配置权限")) {
      String detail = str(e.get("detail"));
      int index = detail.indexOf("验证者 ID ");
      out.put("detail", "配置详情已隐藏" + (index >= 0 ? " · " + detail.substring(index) : ""));
    }
    return out;
  }

  public boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("admin")) return false;
    StoreRepository s = c.store;
    Map<String, Object> b = c.body, a = c.account;
    String r = c.path;
    boolean superAdmin = a != null && eq(a.get("role"), "super");
    if (c.route("/api/admin/overview", "GET")) {
      c.need();
      List<Map<String, Object>> sessions =
          s.rows("sessions").stream()
              .map(
                  x -> {
                    Map<String, Object> out = copy(x);
                    out.remove("ownerId");
                    out.remove("track");
                    out.put("userId", x.get("ownerId"));
                    out.put("trackCount", list(x.get("track")).size());
                    out.put(
                        "tasks",
                        rows(x.get("tasks")).stream()
                            .map(
                                t -> {
                                  Map<String, Object> v = copy(t);
                                  v.remove("mediaId");
                                  v.remove("photo");
                                  v.put(
                                      "hasPhoto",
                                      t.get("mediaId") != null || t.get("photo") != null);
                                  return v;
                                })
                            .toList());
                    return out;
                  })
              .toList();
      List<Map<String, Object>> audit = s.rows("audit"), logs = s.rows("logs");
      c.send(
          obj(
              "account",
              ApiContext.safeAccount(a),
              "version",
              s.db.get("version"),
              "points",
              s.rows("points").stream().map(p -> PointService.adminPoint(p, superAdmin)).toList(),
              "routes",
              s.rows("routes"),
              "templates",
              s.rows("templates"),
              "users",
              s.rows("users").stream()
                  .filter(u -> !yes(u.get("deleted")))
                  .map(ApiContext::safeAccount)
                  .toList(),
              "invites",
              s.rows("invites"),
              "applications",
              s.rows("applications"),
              "reports",
              s.rows("reports"),
              "admins",
              superAdmin
                  ? s.rows("admins").stream()
                      .filter(u -> !yes(u.get("deleted")))
                      .map(ApiContext::safeAccount)
                      .toList()
                  : List.of(),
              "sessions",
              sessions,
              "audit",
              audit.subList(Math.max(0, audit.size() - 100), audit.size()).stream()
                  .map(e -> auditView(e, superAdmin))
                  .toList(),
              "logs",
              logs.subList(Math.max(0, logs.size() - 100), logs.size()),
              "settings",
              null,
              "legacyArchive",
              s.db.get("legacyArchive")));
      return true;
    }
    if (c.route("/api/admin/audit", "GET")) {
      c.need();
      int limit = 50;
      try {
        limit =
            (int)
                Math.floor(
                    Double.parseDouble(Objects.toString(c.request.getParameter("limit"), "50")));
      } catch (Exception ignored) {
      }
      limit = Math.max(1, Math.min(100, limit));
      List<Map<String, Object>> events = new ArrayList<>(s.rows("audit"));
      Collections.reverse(events);
      if ("true".equals(c.request.getParameter("deletions")))
        events.removeIf(e -> !eq(e.get("action"), "永久删除内容"));
      String before = c.request.getParameter("before");
      if (before != null && !before.isEmpty()) {
        int index = -1;
        for (int i = 0; i < events.size(); i++) if (eq(events.get(i).get("id"), before)) index = i;
        if (index < 0) throw new ApiException("日志游标无效");
        events = new ArrayList<>(events.subList(index + 1, events.size()));
      }
      c.send(
          obj(
              "events",
              events.subList(0, Math.min(limit, events.size())).stream()
                  .map(e -> auditView(e, superAdmin))
                  .toList(),
              "nextBefore",
              events.size() > limit ? events.get(limit - 1).get("id") : null));
      return true;
    }
    if (c.route("/api/admin/invites", "POST")) {
      c.need();
      double max = number(b.get("maxUses")), days = number(b.get("days"));
      if (max != Math.rint(max)
          || max < 1
          || max > 500
          || days != Math.rint(days)
          || days < 1
          || days > 90) throw new ApiException("名额 1—500，有效期 1—90 天");
      String mode = str(b.getOrDefault("mode", "auto"));
      if (!List.of("auto", "manual").contains(mode)) throw new ApiException("请选择自动生成或手动填写");
      String code;
      if (mode.equals("manual")) {
        code = str(b.get("code")).trim().toUpperCase(Locale.ROOT);
        if (!code.matches("[A-Z0-9]{6,30}")) throw new ApiException("手动邀请码需要 6—30 位字母或数字");
        if (find(s.rows("invites"), "code", code) != null)
          throw new ApiException("这个邀请码已存在，请换一个", 409);
      } else
        do {
          code = token().substring(0, 12).toUpperCase(Locale.ROOT);
        } while (find(s.rows("invites"), "code", code) != null);
      Map<String, Object> invite =
          obj(
              "id",
              id(),
              "code",
              code,
              "generationMode",
              mode,
              "maxUses",
              (long) max,
              "used",
              0,
              "enabled",
              true,
              "expiresAt",
              Instant.ofEpochMilli(TimeSource.now() + (long) days * 86400000).toString(),
              "creatorId",
              a.get("id"),
              "creator",
              a.get("username"),
              "note",
              text(b.get("note"), 100),
              "usage",
              new ArrayList<>(),
              "createdAt",
              StoreRepository.now());
      s.rows("invites").add(invite);
      c.audit(mode.equals("manual") ? "创建手动邀请码" : "自动生成邀请码", invite.get("id"), "");
      s.save();
      c.send(invite, 201);
      return true;
    }
    Matcher im = Pattern.compile("^/api/admin/invites/([a-f0-9-]+)$").matcher(r);
    if (im.matches() && c.method.equals("PATCH")) {
      c.need();
      Map<String, Object> i = find(s.rows("invites"), "id", im.group(1));
      if (i == null) throw new ApiException("邀请码不存在", 404);
      if (b.isEmpty()
          || b.keySet().stream().anyMatch(k -> !List.of("enabled", "maxUses", "note").contains(k)))
        throw new ApiException("可调整邀请码状态、总名额与备注");
      if (b.containsKey("enabled") && !(b.get("enabled") instanceof Boolean))
        throw new ApiException("邀请码状态无效");
      double max = b.containsKey("maxUses") ? number(b.get("maxUses")) : num(i.get("maxUses"));
      if (max != Math.rint(max) || max < 1 || max > 500)
        throw new ApiException("总邀请名额需要为 1—500 的整数");
      if (max < num(i.get("used")))
        throw new ApiException("已经有 " + i.get("used") + " 个用户注册，总名额不能小于已使用人数");
      Object previous = i.get("maxUses");
      if (b.containsKey("enabled")) i.put("enabled", b.get("enabled"));
      i.put("maxUses", (long) max);
      if (b.containsKey("note")) i.put("note", text(b.get("note"), 100));
      c.audit(
          "编辑邀请码",
          i.get("id"),
          "总名额 "
              + previous
              + " → "
              + i.get("maxUses")
              + "；"
              + (yes(i.get("enabled")) ? "启用" : "停用"));
      s.save();
      c.send(i);
      return true;
    }
    Matcher pop = Pattern.compile("^/api/admin/points/([a-z0-9-]+)/popularity$").matcher(r);
    if (pop.matches() && c.method.equals("PATCH")) {
      c.superOnly();
      Map<String, Object> p = find(s.rows("points"), "id", pop.group(1));
      if (p == null) throw new ApiException("点位不存在", 404);
      if (b.keySet().stream().anyMatch(k -> !List.of("popularity", "useActual").contains(k)))
        throw new ApiException("热度参数无效");
      boolean actual = b.size() == 1 && yes(b.get("useActual"));
      if (!actual
          && (b.size() != 1
              || !whole(b.get("popularity"))
              || num(b.get("popularity")) < 0
              || num(b.get("popularity")) > 1000000000))
        throw new ApiException("热度需为 0—1000000000 的整数");
      Map<String, Object> before = PointService.stats(p);
      p.put(
          "popularityOffset",
          actual ? 0 : integer(b.get("popularity")) - integer(before.get("viewCount")));
      s.bump();
      c.audit(
          "调整机位热度",
          p.get("id"),
          "排序热度 "
              + before.get("popularity")
              + " → "
              + PointService.stats(p).get("popularity")
              + "；实际详情浏览 "
              + before.get("viewCount")
              + (actual ? "；恢复实际浏览排序" : ""));
      s.save();
      c.send(PointService.stats(p));
      return true;
    }
    if (c.route("/api/admin/admins", "POST")) {
      c.superOnly();
      String name = username(b.get("username"));
      if (!List.of("super", "normal").contains(b.get("role"))) throw new ApiException("管理员角色无效");
      if (s.rows("admins").stream()
          .anyMatch(x -> eq(x.get("username"), name) && !yes(x.get("deleted"))))
        throw new ApiException("管理员账号已存在");
      Map<String, Object> x =
          obj(
              "id",
              id(),
              "username",
              name,
              "name",
              text(b.get("name"), 30).isEmpty() ? name : text(b.get("name"), 30),
              "role",
              b.get("role"),
              "enabled",
              true,
              "passwordHash",
              hashPassword(password(b.get("password"))),
              "createdBy",
              a.get("id"),
              "createdAt",
              StoreRepository.now());
      s.rows("admins").add(x);
      c.audit("创建管理员", x.get("id"), str(x.get("role")));
      s.save();
      c.send(ApiContext.safeAccount(x), 201);
      return true;
    }
    Matcher am = Pattern.compile("^/api/admin/admins/([a-f0-9-]+)$").matcher(r);
    if (am.matches() && List.of("PATCH", "DELETE").contains(c.method)) {
      c.superOnly();
      Map<String, Object> x = find(s.rows("admins"), "id", am.group(1));
      if (x == null || yes(x.get("deleted"))) throw new ApiException("管理员不存在", 404);
      boolean deletion = c.method.equals("DELETE"),
          self = eq(x.get("id"), a.get("id")),
          demoting =
              deletion || Boolean.FALSE.equals(b.get("enabled")) || eq(b.get("role"), "normal");
      if (self && demoting) throw new ApiException("不能删除、停用或降低当前自己的权限");
      if (self && !str(b.get("password")).isEmpty()) throw new ApiException("修改自己的密码请验证当前密码后操作");
      if (eq(x.get("role"), "super")
          && yes(x.get("enabled"))
          && demoting
          && s.rows("admins").stream()
                  .filter(
                      v ->
                          eq(v.get("role"), "super")
                              && yes(v.get("enabled"))
                              && !yes(v.get("deleted")))
                  .count()
              <= 1) throw new ApiException("必须保留至少一个可用超级管理员");
      Map<String, Object> update = obj();
      if (deletion) update.putAll(obj("deleted", true, "enabled", false));
      else {
        if (b.containsKey("enabled")) update.put("enabled", yes(b.get("enabled")));
        if (b.containsKey("role")) {
          if (!List.of("super", "normal").contains(b.get("role"))) throw new ApiException("角色无效");
          update.put("role", b.get("role"));
        }
        if (!str(b.get("password")).isEmpty())
          update.put("passwordHash", hashPassword(password(b.get("password"))));
        if (!str(b.get("name")).isEmpty()) update.put("name", text(b.get("name"), 30));
      }
      x.putAll(update);
      if (!self) s.rows("auth").removeIf(t -> eq(t.get("accountId"), x.get("id")));
      c.audit("管理管理员账号", x.get("id"), "");
      s.save();
      c.send(ApiContext.safeAccount(x));
      return true;
    }
    Matcher um = Pattern.compile("^/api/admin/users/([a-f0-9-]+)$").matcher(r);
    if (um.matches() && List.of("PATCH", "DELETE").contains(c.method)) {
      c.need();
      Map<String, Object> u = find(s.rows("users"), "id", um.group(1));
      if (u == null || yes(u.get("deleted"))) throw new ApiException("用户不存在", 404);
      Map<String, Object> update = obj();
      if (c.method.equals("DELETE")) update.putAll(obj("deleted", true, "enabled", false));
      else {
        if (b.containsKey("enabled")) update.put("enabled", yes(b.get("enabled")));
        if (!str(b.get("password")).isEmpty())
          update.put("passwordHash", hashPassword(password(b.get("password"))));
        if (b.containsKey("scoutStatus")) {
          if (!List.of("none", "approved").contains(b.get("scoutStatus")))
            throw new ApiException("探索官状态无效");
          update.put("scoutStatus", b.get("scoutStatus"));
        }
      }
      u.putAll(update);
      s.rows("auth").removeIf(t -> eq(t.get("accountId"), u.get("id")));
      c.audit("管理用户账号", u.get("id"), "");
      s.save();
      c.send(ApiContext.safeAccount(u));
      return true;
    }
    Matcher ap = Pattern.compile("^/api/admin/applications/([a-f0-9-]+)$").matcher(r);
    if (ap.matches() && c.method.equals("PATCH")) {
      c.need();
      Map<String, Object> x = find(s.rows("applications"), "id", ap.group(1));
      if (x == null || !eq(x.get("status"), "pending")) throw new ApiException("申请不存在或已经处理");
      if (!List.of("approved", "rejected").contains(b.get("status")))
        throw new ApiException("审核状态无效");
      x.putAll(
          obj(
              "status",
              b.get("status"),
              "note",
              text(b.get("note"), 500),
              "reviewedBy",
              a.get("id"),
              "reviewedAt",
              StoreRepository.now()));
      Map<String, Object> u = find(s.rows("users"), "id", x.get("userId"));
      if (u != null) u.put("scoutStatus", b.get("status"));
      c.audit("审核探索官", x.get("id"), str(b.get("status")));
      s.save();
      c.send(x);
      return true;
    }
    Matcher pm = Pattern.compile("^/api/admin/points/([a-z0-9-]+)$").matcher(r);
    if (pm.matches() && c.method.equals("PATCH")) {
      c.need();
      Map<String, Object> p = find(s.rows("points"), "id", pm.group(1));
      if (p == null) throw new ApiException("点位不存在", 404);
      Map<String, Object> update = obj();
      if (b.containsKey("lng") || b.containsKey("lat"))
        update.putAll(
            Campus.coordinate(
                s.campus,
                b.getOrDefault("lng", p.get("lng")),
                b.getOrDefault("lat", p.get("lat"))));
      for (String k : List.of("name", "description", "condition", "source", "allowed"))
        if (b.containsKey(k)) {
          if (text(b.get(k)).isEmpty()) throw new ApiException("点位资料不能为空");
          update.put(k, text(b.get(k)));
        }
      if (b.containsKey("theme") && !str(b.get("theme")).isEmpty()) {
        if (!List.of("建筑", "自然", "人文", "运动").contains(b.get("theme")))
          throw new ApiException("分类无效");
        update.put("theme", b.get("theme"));
      }
      for (String k : List.of("open", "published"))
        if (b.containsKey(k)) update.put(k, yes(b.get(k)));
      if (yes(b.get("certify")))
        update.putAll(
            obj(
                "trust",
                "certified",
                "verifiedAt",
                StoreRepository.now().substring(0, 10),
                "certifiedBy",
                a.get("id")));
      p.putAll(update);
      p.put("version", integer(p.get("version")) + 1);
      s.bump();
      c.audit("维护点位", p.get("id"), yes(b.get("certify")) ? "认证通过" : "资料或上下线更新");
      s.save();
      c.send(PointService.adminPoint(p, superAdmin));
      return true;
    }
    Matcher rm = Pattern.compile("^/api/admin/reports/([a-f0-9-]+)$").matcher(r);
    if (rm.matches() && c.method.equals("PATCH")) {
      c.need();
      Map<String, Object> x = find(s.rows("reports"), "id", rm.group(1));
      if (x == null || !eq(x.get("status"), "pending")) throw new ApiException("反馈不存在或已处理");
      String action = str(b.get("action"));
      if (!List.of("resolve", "reject", "offline", "online").contains(action))
        throw new ApiException("处理方式无效");
      Map<String, Object> p = find(s.rows("points"), "id", x.get("pointId"));
      if (p != null && List.of("offline", "online").contains(action)) {
        p.putAll(
            obj(
                "published",
                action.equals("online"),
                "open",
                action.equals("online"),
                "version",
                integer(p.get("version")) + 1));
        s.bump();
      }
      x.putAll(
          obj(
              "status",
              action.equals("reject") ? "rejected" : "resolved",
              "note",
              text(b.get("note"), 1000),
              "reviewedBy",
              a.get("id"),
              "reviewedAt",
              StoreRepository.now()));
      c.audit("处理点位反馈", x.get("id"), action);
      s.save();
      c.send(x);
      return true;
    }
    Matcher cm = Pattern.compile("^/api/admin/(routes|templates)/([a-z0-9]+)$").matcher(r);
    if (cm.matches() && c.method.equals("PATCH")) {
      c.need();
      Map<String, Object> x = find(s.rows(cm.group(1)), "id", cm.group(2));
      if (x == null) throw new ApiException("内容不存在", 404);
      if (cm.group(1).equals("routes")) {
        if (yes(b.get("active")) && list(x.get("points")).isEmpty())
          throw new ApiException("路线已没有点位，不能重新启用", 409);
        if (b.containsKey("active")) x.put("active", yes(b.get("active")));
        if (b.containsKey("walk")) {
          double n = num(b.get("walk"));
          if (!Double.isFinite(n) || n < 1 || n > 60) throw new ApiException("步行时间为 1—60 分钟");
          x.put("walk", b.get("walk"));
        }
        if (b.containsKey("timing")) {
          double n = num(b.get("timing"));
          if (!Double.isFinite(n) || n < 1 || n > 60) throw new ApiException("实走时间为 1—60 分钟");
          list(x.get("timings")).add(obj("minutes", b.get("timing"), "at", StoreRepository.now()));
          x.put("measured", list(x.get("timings")).size() >= 3);
        }
      } else {
        if (b.containsKey("title")) {
          if (text(b.get("title")).isEmpty()) throw new ApiException("标题不能为空");
          x.put("title", text(b.get("title"), 100));
        }
        if (b.containsKey("steps")) {
          List<Object> steps = list(b.get("steps"));
          if (!(b.get("steps") instanceof List)
              || steps.isEmpty()
              || steps.stream().anyMatch(t -> text(t).isEmpty())) throw new ApiException("步骤不能为空");
          x.put("steps", steps.stream().map(t -> text(t, 500)).toList());
        }
        if (b.containsKey("approved")) x.put("approved", yes(b.get("approved")));
      }
      x.put("version", integer(x.get("version")) + 1);
      s.bump();
      c.audit("更新" + cm.group(1), x.get("id"), "");
      s.save();
      c.send(x);
      return true;
    }
    return false;
  }

  private double number(Object input) {
    if (input instanceof Number) return num(input);
    try {
      return Double.parseDouble(str(input));
    } catch (Exception e) {
      return Double.NaN;
    }
  }
}
