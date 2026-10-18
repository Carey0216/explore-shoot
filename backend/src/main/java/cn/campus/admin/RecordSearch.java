package cn.campus.admin;

import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.web.ApiContext;
import java.text.Normalizer;
import java.time.*;
import java.util.*;

/** Filtering runs on redacted views so search cannot reveal hidden statistics or SDK secrets. */
public final class RecordSearch {
  private RecordSearch() {}

  public static String category(Map<String, Object> e) {
    String a = str(e.get("action"));
    if (a.contains("题库") || a.contains("答题")) return "quiz";
    if (a.contains("专题")) return "activity";
    if (a.contains("印章") || a.contains("护照")) return "passport";
    if (a.contains("模型") || a.contains("AI")) return "ai";
    if (a.contains("删除")) return "deletion";
    if (a.contains("密码") || a.contains("验证")) return "security";
    if (a.contains("设置") || a.contains("配置")) return "settings";
    if (a.contains("邀请码")
        || a.contains("账号")
        || a.contains("管理员")
        || a.contains("注册")
        || a.contains("资料")) return "account";
    if (a.contains("探索官") || a.contains("反馈") || a.contains("社区")) return "community";
    if (a.contains("点位")
        || a.contains("热度")
        || a.contains("机位")
        || a.contains("作品")
        || a.contains("护照")
        || a.contains("印章")
        || a.contains("routes")
        || a.contains("templates")) return "content";
    return "other";
  }

  private static String norm(Object x) {
    return Normalizer.normalize(str(x), Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
  }

  private static String parameter(ApiContext c, String key, String fallback) {
    return Objects.toString(c.request.getParameter(key), fallback).trim();
  }

  private static Instant day(String value, boolean end) {
    if (value.isEmpty()) return null;
    try {
      LocalDate date = LocalDate.parse(value);
      return (end ? date.plusDays(1) : date).atStartOfDay(ZoneId.of("Asia/Shanghai")).toInstant();
    } catch (Exception e) {
      throw new ApiException("日期格式无效");
    }
  }

  public static Map<String, Object> search(ApiContext c, boolean legacy) {
    c.need();
    boolean superAdmin = AdminPermissions.has(c.account, "statistics.read");
    String kind = legacy ? "audit" : parameter(c, "kind", "audit"),
        cat = parameter(c, "category", "all"),
        role = parameter(c, "role", "all"),
        query = parameter(c, "q", "");
    if (!Set.of("audit", "planning").contains(kind)) throw new ApiException("记录类型无效");
    if (!Set.of(
            "all",
            "deletion",
            "security",
            "settings",
            "account",
            "community",
            "content",
            "other",
            "quiz",
            "activity",
            "passport",
            "ai")
        .contains(cat)) throw new ApiException("记录分类无效");
    if (!Set.of("all", "owner", "super", "normal", "user").contains(role))
      throw new ApiException("操作者类型无效");
    if (query.codePointCount(0, query.length()) > 100) throw new ApiException("搜索词不能超过 100 个字");
    Instant from = day(parameter(c, "from", ""), false), to = day(parameter(c, "to", ""), true);
    if (from != null && to != null && !from.isBefore(to)) throw new ApiException("结束日期不能早于开始日期");
    int limit = 50;
    try {
      limit = (int) Math.floor(Double.parseDouble(parameter(c, "limit", "50")));
    } catch (Exception ignored) {
    }
    limit = Math.max(1, Math.min(100, limit));
    List<Map<String, Object>> events = new ArrayList<>();
    for (Map<String, Object> raw : c.store.rows(kind.equals("audit") ? "audit" : "logs")) {
      if (yes(raw.get("hidden"))) continue;
      Map<String, Object> v =
          kind.equals("audit") ? AdminService.auditView(raw, superAdmin) : obj();
      if (kind.equals("planning"))
        for (String key : List.of("id", "at", "route", "status", "total", "budget", "version"))
          v.put(key, raw.get(key));
      v.put("category", kind.equals("audit") ? category(v) : "planning");
      events.add(v);
    }
    Collections.reverse(events);
    // Resolve cursor on the complete ordered source, then filter; a newly inserted row cannot
    // duplicate a page.
    String before = parameter(c, "before", "");
    if (!before.isEmpty()) {
      int index = -1;
      for (int i = 0; i < events.size(); i++) if (eq(events.get(i).get("id"), before)) index = i;
      if (index < 0) throw new ApiException("日志游标无效");
      events = new ArrayList<>(events.subList(index + 1, events.size()));
    }
    String q = norm(query);
    events.removeIf(
        e -> {
          if ("true".equals(c.request.getParameter("deletions")) && !eq(e.get("action"), "永久删除内容"))
            return true;
          if (!cat.equals("all") && !eq(e.get("category"), cat)) return true;
          if (!role.equals("all") && !eq(e.get("actorRole"), role)) return true;
          if (from != null || to != null)
            try {
              Instant at = Instant.parse(str(e.get("at")));
              if (from != null && at.isBefore(from) || to != null && !at.isBefore(to)) return true;
            } catch (Exception x) {
              return true;
            }
          return !q.isEmpty()
              && List.of(
                      "action",
                      "actor",
                      "actorName",
                      "actorId",
                      "subject",
                      "detail",
                      "contentType",
                      "ip",
                      "route",
                      "status")
                  .stream()
                  .noneMatch(key -> norm(e.get(key)).contains(q));
        });
    return obj(
        "events",
        events.subList(0, Math.min(limit, events.size())),
        "nextBefore",
        events.size() > limit ? events.get(limit - 1).get("id") : null,
        "total",
        events.size(),
        "kind",
        kind);
  }
}
