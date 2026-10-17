package cn.campus.admin;

import static cn.campus.auth.Security.*;
import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.common.TimeSource;
import cn.campus.maps.Campus;
import cn.campus.point.PointService;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
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

  public boolean handle(ApiContext context) throws Exception {
    if (!context.audience.equals("admin")) return false;
    StoreRepository store = context.store;
    Map<String, Object> body = context.body, account = context.account;
    String r = context.path;
    boolean superAdmin = AdminPermissions.has(account, "statistics.read");
    if (context.route("/api/admin/overview", "GET")) {
      context.need();
      List<Map<String, Object>> sessions =
          store.rows("sessions").stream()
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
      List<Map<String, Object>> audit = store.rows("audit"), logs = store.rows("logs");
      context.send(
          obj(
              "account",
              ApiContext.safeAccount(account),
              "summary",
              AdminDashboard.summarize(store),
              "version",
              store.db.get("version"),
              "points",
              cn.campus.point.PointReactionService.adminPoints(store, superAdmin),
              "shootingSpots",
              store.rows("shootingSpots").stream()
                  .map(
                      spot -> {
                        var out = copy(spot);
                        out.put(
                            "photo",
                            spot.get("exampleMediaId") == null
                                ? null
                                : "/api/admin/shooting-spots/" + spot.get("id") + "/photo");
                        return out;
                      })
                  .toList(),
              "works",
              store.rows("works").stream()
                  .map(w -> cn.campus.checkin.WorkWallService.adminView(store, w))
                  .toList(),
              "workReports",
              store.rows("workReports"),
              "routes",
              store.rows("routes"),
              "templates",
              store.rows("templates"),
              "users",
              store.rows("users").stream()
                  .filter(u -> !yes(u.get("deleted")))
                  .map(ApiContext::safeAccount)
                  .toList(),
              "invites",
              store.rows("invites"),
              "applications",
              store.rows("applications"),
              "reports",
              store.rows("reports"),
              "admins",
              superAdmin
                  ? store.rows("admins").stream()
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
              store.db.get("legacyArchive")));
      return true;
    }
    if (context.route("/api/admin/audit", "GET") || context.route("/api/admin/records", "GET")) {
      context.send(RecordSearch.search(context, context.path.equals("/api/admin/audit")));
      return true;
    }
    if (context.route("/api/admin/invites", "POST")) {
      context.need();
      double max = number(body.get("maxUses")), days = number(body.get("days"));
      if (max != Math.rint(max)
          || max < 1
          || max > 500
          || days != Math.rint(days)
          || days < 1
          || days > 90) throw new ApiException("名额 1—500，有效期 1—90 天");
      String mode = str(body.getOrDefault("mode", "auto"));
      if (!List.of("auto", "manual").contains(mode)) throw new ApiException("请选择自动生成或手动填写");
      String code;
      if (mode.equals("manual")) {
        code = str(body.get("code")).trim().toUpperCase(Locale.ROOT);
        if (!code.matches("[A-Z0-9]{6,30}")) throw new ApiException("手动邀请码需要 6—30 位字母或数字");
        if (find(store.rows("invites"), "code", code) != null)
          throw new ApiException("这个邀请码已存在，请换一个", 409);
      } else
        do {
          code = token().substring(0, 12).toUpperCase(Locale.ROOT);
        } while (find(store.rows("invites"), "code", code) != null);
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
              account.get("id"),
              "creator",
              account.get("username"),
              "note",
              text(body.get("note"), 100),
              "usage",
              new ArrayList<>(),
              "createdAt",
              StoreRepository.now());
      store.rows("invites").add(invite);
      context.audit(mode.equals("manual") ? "创建手动邀请码" : "自动生成邀请码", invite.get("id"), "");
      store.save();
      context.send(invite, 201);
      return true;
    }
    Matcher im = Pattern.compile("^/api/admin/invites/([a-f0-9-]+)$").matcher(r);
    if (im.matches() && context.method.equals("PATCH")) {
      context.need();
      Map<String, Object> i = find(store.rows("invites"), "id", im.group(1));
      if (i == null) throw new ApiException("邀请码不存在", 404);
      if (body.isEmpty()
          || body.keySet().stream()
              .anyMatch(k -> !List.of("enabled", "maxUses", "note").contains(k)))
        throw new ApiException("可调整邀请码状态、总名额与备注");
      if (body.containsKey("enabled") && !(body.get("enabled") instanceof Boolean))
        throw new ApiException("邀请码状态无效");
      double max =
          body.containsKey("maxUses") ? number(body.get("maxUses")) : num(i.get("maxUses"));
      if (max != Math.rint(max) || max < 1 || max > 500)
        throw new ApiException("总邀请名额需要为 1—500 的整数");
      if (max < num(i.get("used")))
        throw new ApiException("已经有 " + i.get("used") + " 个用户注册，总名额不能小于已使用人数");
      Object previous = i.get("maxUses");
      if (body.containsKey("enabled")) i.put("enabled", body.get("enabled"));
      i.put("maxUses", (long) max);
      if (body.containsKey("note")) i.put("note", text(body.get("note"), 100));
      context.audit(
          "编辑邀请码",
          i.get("id"),
          "总名额 "
              + previous
              + " → "
              + i.get("maxUses")
              + "；"
              + (yes(i.get("enabled")) ? "启用" : "停用"));
      store.save();
      context.send(i);
      return true;
    }
    Matcher pop = Pattern.compile("^/api/admin/points/([a-z0-9-]+)/popularity$").matcher(r);
    if (pop.matches() && context.method.equals("PATCH")) {
      context.superOnly();
      Map<String, Object> p = find(store.rows("points"), "id", pop.group(1));
      if (p == null) throw new ApiException("点位不存在", 404);
      if (body.keySet().stream().anyMatch(k -> !List.of("popularity", "useActual").contains(k)))
        throw new ApiException("热度参数无效");
      boolean actual = body.size() == 1 && yes(body.get("useActual"));
      if (!actual
          && (body.size() != 1
              || !whole(body.get("popularity"))
              || num(body.get("popularity")) < 0
              || num(body.get("popularity")) > 1000000000))
        throw new ApiException("热度需为 0—1000000000 的整数");
      Map<String, Object> before = PointService.stats(p);
      p.put(
          "popularityOffset",
          actual ? 0 : integer(body.get("popularity")) - integer(before.get("viewCount")));
      store.bump();
      context.audit(
          "调整机位热度",
          p.get("id"),
          "排序热度 "
              + before.get("popularity")
              + " → "
              + PointService.stats(p).get("popularity")
              + "；实际详情浏览 "
              + before.get("viewCount")
              + (actual ? "；恢复实际浏览排序" : ""));
      store.save();
      context.send(PointService.stats(p));
      return true;
    }
    if (context.route("/api/admin/admins", "POST")) {
      context.superOnly();
      String name = username(body.get("username"));
      if (!List.of("super", "normal").contains(body.get("role"))) throw new ApiException("管理员角色无效");
      if (store.rows("admins").stream()
          .anyMatch(x -> eq(x.get("username"), name) && !yes(x.get("deleted"))))
        throw new ApiException("管理员账号已存在");
      Map<String, Object> x =
          obj(
              "id",
              id(),
              "username",
              name,
              "name",
              text(body.get("name"), 30).isEmpty() ? name : text(body.get("name"), 30),
              "role",
              body.get("role"),
              "enabled",
              true,
              "passwordHash",
              hashPassword(password(body.get("password"))),
              "createdBy",
              account.get("id"),
              "createdAt",
              StoreRepository.now());
      store.rows("admins").add(x);
      context.audit("创建管理员", x.get("id"), str(x.get("role")));
      store.save();
      context.send(ApiContext.safeAccount(x), 201);
      return true;
    }
    Matcher am = Pattern.compile("^/api/admin/admins/([a-f0-9-]+)$").matcher(r);
    if (am.matches() && List.of("PATCH", "DELETE").contains(context.method)) {
      context.superOnly();
      Map<String, Object> x = find(store.rows("admins"), "id", am.group(1));
      if (x == null || yes(x.get("deleted"))) throw new ApiException("管理员不存在", 404);
      if (AdminPermissions.owner(x))
        throw new ApiException("唯一顶级管理员只能本人验证密码后修改账号资料，不能删除、停用或降权", 403);
      boolean deletion = context.method.equals("DELETE"),
          self = eq(x.get("id"), account.get("id")),
          demoting =
              deletion
                  || Boolean.FALSE.equals(body.get("enabled"))
                  || eq(body.get("role"), "normal");
      if (self && demoting) throw new ApiException("不能删除、停用或降低当前自己的权限");
      if (self && !str(body.get("password")).isEmpty()) throw new ApiException("修改自己的密码请验证当前密码后操作");
      if (!AdminPermissions.ownerExists(store)
          && eq(x.get("role"), "super")
          && yes(x.get("enabled"))
          && demoting
          && store.rows("admins").stream()
                  .filter(
                      v ->
                          eq(v.get("role"), "super")
                              && yes(v.get("enabled"))
                              && !yes(v.get("deleted")))
                  .count()
              <= 1) throw new ApiException("必须保留至少一个可用超级管理员");
      Map<String, Object> update = obj();
      if (body.containsKey("permissionOverrides")) {
        AdminPermissions.ownerOnly(context);
        if (!whole(body.get("permissionRevision"))
            || integer(body.get("permissionRevision")) != integer(x.get("permissionRevision")))
          throw new ApiException("管理员权限已更新，请刷新", 409);
        update.put(
            "permissionOverrides", AdminPermissions.overrides(body.get("permissionOverrides")));
        update.put("permissionRevision", integer(x.get("permissionRevision")) + 1);
      }
      if (deletion) update.putAll(obj("deleted", true, "enabled", false));
      else {
        if (body.containsKey("enabled")) update.put("enabled", yes(body.get("enabled")));
        if (body.containsKey("role")) {
          if (!List.of("super", "normal").contains(body.get("role")))
            throw new ApiException("角色无效");
          update.put("role", body.get("role"));
        }
        if (!str(body.get("password")).isEmpty())
          update.put("passwordHash", hashPassword(password(body.get("password"))));
        if (!str(body.get("name")).isEmpty()) update.put("name", text(body.get("name"), 30));
      }
      x.putAll(update);
      if (!self) store.rows("auth").removeIf(t -> eq(t.get("accountId"), x.get("id")));
      context.audit("管理管理员账号", x.get("id"), "");
      store.save();
      context.send(ApiContext.safeAccount(x));
      return true;
    }
    Matcher um = Pattern.compile("^/api/admin/users/([a-f0-9-]+)$").matcher(r);
    if (um.matches() && List.of("PATCH", "DELETE").contains(context.method)) {
      context.need();
      Map<String, Object> u = find(store.rows("users"), "id", um.group(1));
      if (u == null || yes(u.get("deleted"))) throw new ApiException("用户不存在", 404);
      Map<String, Object> update = obj();
      if (context.method.equals("DELETE")) update.putAll(obj("deleted", true, "enabled", false));
      else {
        if (body.containsKey("enabled")) update.put("enabled", yes(body.get("enabled")));
        if (!str(body.get("password")).isEmpty())
          update.put("passwordHash", hashPassword(password(body.get("password"))));
        if (body.containsKey("scoutStatus")) {
          if (!List.of("none", "approved").contains(body.get("scoutStatus")))
            throw new ApiException("探索官状态无效");
          update.put("scoutStatus", body.get("scoutStatus"));
        }
      }
      u.putAll(update);
      if (context.method.equals("DELETE"))
        store.rows("pointReactions").removeIf(x -> eq(x.get("userId"), u.get("id")));
      if (context.method.equals("DELETE"))
        store.rows("wechatBindings").removeIf(x -> eq(x.get("userId"), u.get("id")));
      store.rows("auth").removeIf(t -> eq(t.get("accountId"), u.get("id")));
      context.audit("管理用户账号", u.get("id"), "");
      store.save();
      context.send(ApiContext.safeAccount(u));
      return true;
    }
    Matcher ap = Pattern.compile("^/api/admin/applications/([a-f0-9-]+)$").matcher(r);
    if (ap.matches() && context.method.equals("PATCH")) {
      context.need();
      Map<String, Object> x = find(store.rows("applications"), "id", ap.group(1));
      if (x == null || !eq(x.get("status"), "pending")) throw new ApiException("申请不存在或已经处理");
      if (!List.of("approved", "rejected").contains(body.get("status")))
        throw new ApiException("审核状态无效");
      x.putAll(
          obj(
              "status",
              body.get("status"),
              "note",
              text(body.get("note"), 500),
              "reviewedBy",
              account.get("id"),
              "reviewedAt",
              StoreRepository.now()));
      Map<String, Object> u = find(store.rows("users"), "id", x.get("userId"));
      if (u != null) u.put("scoutStatus", body.get("status"));
      cn.campus.notification.NotificationService.add(
          store,
          x.get("userId"),
          "application:" + x.get("id"),
          "application",
          "探索官申请结果",
          (eq(body.get("status"), "approved") ? "你的校园探索官申请已通过" : "你的校园探索官申请暂未通过")
              + (str(x.get("note")).isEmpty() ? "" : "：" + x.get("note")),
          "#me");
      context.audit("审核探索官", x.get("id"), str(body.get("status")));
      store.save();
      context.send(x);
      return true;
    }
    Matcher pm = Pattern.compile("^/api/admin/points/([a-z0-9-]+)$").matcher(r);
    if (pm.matches() && context.method.equals("PATCH")) {
      context.need();
      Map<String, Object> p = find(store.rows("points"), "id", pm.group(1));
      if (p == null) throw new ApiException("点位不存在", 404);
      Map<String, Object> update = obj();
      if (body.containsKey("lng") || body.containsKey("lat"))
        update.putAll(
            Campus.coordinate(
                store.campus,
                body.getOrDefault("lng", p.get("lng")),
                body.getOrDefault("lat", p.get("lat"))));
      for (String k : List.of("name", "description", "condition", "source", "allowed"))
        if (body.containsKey(k)) {
          if (text(body.get(k)).isEmpty()) throw new ApiException("点位资料不能为空");
          update.put(k, text(body.get(k)));
        }
      if (body.containsKey("theme") && !str(body.get("theme")).isEmpty()) {
        if (!List.of("建筑", "自然", "人文", "运动").contains(body.get("theme")))
          throw new ApiException("分类无效");
        update.put("theme", body.get("theme"));
      }
      for (String k : List.of("open", "published"))
        if (body.containsKey(k)) update.put(k, yes(body.get(k)));
      if (yes(body.get("certify")))
        update.putAll(
            obj(
                "trust",
                "certified",
                "verifiedAt",
                StoreRepository.now().substring(0, 10),
                "certifiedBy",
                account.get("id")));
      boolean approved =
          yes(body.get("certify")) && !eq(p.get("trust"), "certified")
              || yes(update.get("published")) && !yes(p.get("published"));
      p.putAll(update);
      if (approved && yes(p.get("published")))
        cn.campus.notification.NotificationService.add(
            store,
            p.get("authorId"),
            "point:" + p.get("id") + ":" + p.get("version"),
            "point",
            "点位审核通过",
            str(p.get("name")) + " 已通过审核并可展示。",
            "#place/" + p.get("id"));
      p.put("version", integer(p.get("version")) + 1);
      store.bump();
      context.audit("维护点位", p.get("id"), yes(body.get("certify")) ? "认证通过" : "资料或上下线更新");
      store.save();
      context.send(PointService.adminPoint(p, superAdmin));
      return true;
    }
    Matcher rm = Pattern.compile("^/api/admin/reports/([a-f0-9-]+)$").matcher(r);
    if (rm.matches() && context.method.equals("PATCH")) {
      context.need();
      Map<String, Object> x = find(store.rows("reports"), "id", rm.group(1));
      if (x == null || !eq(x.get("status"), "pending")) throw new ApiException("反馈不存在或已处理");
      String action = str(body.get("action"));
      if (!List.of("resolve", "reject", "offline", "online").contains(action))
        throw new ApiException("处理方式无效");
      Map<String, Object> p = find(store.rows("points"), "id", x.get("pointId"));
      if (p != null && List.of("offline", "online").contains(action)) {
        p.putAll(
            obj(
                "published",
                action.equals("online"),
                "open",
                action.equals("online"),
                "version",
                integer(p.get("version")) + 1));
        store.bump();
      }
      x.putAll(
          obj(
              "status",
              action.equals("reject") ? "rejected" : "resolved",
              "note",
              text(body.get("note"), 1000),
              "reviewedBy",
              account.get("id"),
              "reviewedAt",
              StoreRepository.now()));
      cn.campus.notification.NotificationService.add(
          store,
          x.get("userId"),
          "report:" + x.get("id"),
          "report",
          "点位反馈处理结果",
          (action.equals("reject") ? "本次点位反馈暂未采纳" : "你的点位反馈已处理")
              + (str(x.get("note")).isEmpty() ? "" : "：" + x.get("note")),
          "#me");
      context.audit("处理点位反馈", x.get("id"), action);
      store.save();
      context.send(x);
      return true;
    }
    Matcher cm = Pattern.compile("^/api/admin/(routes|templates)/([a-z0-9]+)$").matcher(r);
    if (cm.matches() && context.method.equals("PATCH")) {
      context.need();
      Map<String, Object> x = find(store.rows(cm.group(1)), "id", cm.group(2));
      if (x == null) throw new ApiException("内容不存在", 404);
      if (cm.group(1).equals("routes")) {
        if (yes(body.get("active")) && list(x.get("points")).isEmpty())
          throw new ApiException("路线已没有点位，不能重新启用", 409);
        if (body.containsKey("active")) x.put("active", yes(body.get("active")));
        if (body.containsKey("walk")) {
          double n = num(body.get("walk"));
          if (!Double.isFinite(n) || n < 1 || n > 60) throw new ApiException("步行时间为 1—60 分钟");
          x.put("walk", body.get("walk"));
        }
        if (body.containsKey("timing")) {
          double n = num(body.get("timing"));
          if (!Double.isFinite(n) || n < 1 || n > 60) throw new ApiException("实走时间为 1—60 分钟");
          list(x.get("timings"))
              .add(obj("minutes", body.get("timing"), "at", StoreRepository.now()));
          x.put("measured", list(x.get("timings")).size() >= 3);
        }
      } else {
        if (body.containsKey("title")) {
          if (text(body.get("title")).isEmpty()) throw new ApiException("标题不能为空");
          x.put("title", text(body.get("title"), 100));
        }
        if (body.containsKey("steps")) {
          List<Object> steps = list(body.get("steps"));
          if (!(body.get("steps") instanceof List)
              || steps.isEmpty()
              || steps.stream().anyMatch(t -> text(t).isEmpty())) throw new ApiException("步骤不能为空");
          x.put("steps", steps.stream().map(t -> text(t, 500)).toList());
        }
        if (body.containsKey("approved")) x.put("approved", yes(body.get("approved")));
      }
      x.put("version", integer(x.get("version")) + 1);
      store.bump();
      context.audit("更新" + cm.group(1), x.get("id"), "");
      store.save();
      context.send(x);
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
