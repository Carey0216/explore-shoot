package cn.campus.content;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.checkin.*;
import cn.campus.common.*;
import cn.campus.web.ApiContext;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;

/** Scheduled topics link to existing, administrator-maintained passport rules. */
@Service
public final class SeasonTopicService {
  public boolean handle(ApiContext c) throws Exception {
    boolean admin = c.audience.equals("admin");
    String base = admin ? "/api/admin/topics" : "/api/topics";
    if (!c.path.startsWith(base)) return false;
    if (!admin) {
      cn.campus.settings.InteractionFeatures.require(c.store, "topics");
      if (c.route(base, "GET")) {
        c.send(
            obj(
                "items",
                c.store.rows("seasonTopics").stream()
                    .filter(t -> !yes(t.get("deleted")) && yes(t.get("published")))
                    .map(t -> view(c, t))
                    .toList()));
        return true;
      }
      return false;
    }
    c.need();
    if (c.route(base, "GET")) {
      c.send(
          obj(
              "items",
              c.store.rows("seasonTopics").stream().filter(t -> !yes(t.get("deleted"))).toList(),
              "rules",
              c.store.rows("passportThemes")));
      return true;
    }
    boolean create = c.route(base, "POST");
    if (!create && !c.path.matches(base + "/[a-f0-9-]{36}")) return false;
    if (!Set.of("POST", "PUT", "DELETE").contains(c.method)) return false;
    var old =
        create
            ? null
            : find(
                c.store.rows("seasonTopics"), "id", c.path.substring(c.path.lastIndexOf('/') + 1));
    if (!create && (old == null || yes(old.get("deleted")))) throw new ApiException("专题不存在", 404);
    if (!create
        && (!whole(c.body.get("revision"))
            || integer(c.body.get("revision")) != integer(old.get("revision"))))
      throw new ApiException("专题已更新，请重新载入", 409);
    if (c.method.equals("DELETE")) {
      old.put("deleted", true);
      old.put("published", false);
      c.audit("删除季节专题", old.get("id"), "");
      c.store.save();
      c.send(obj("ok", true));
      return true;
    }
    var b = c.body;
    String title = RequestValues.text(b, "title", "", 80, true),
        description = RequestValues.text(b, "description", "", 2000, false);
    String start = RequestValues.text(b, "startsAt", "", 40, true),
        end = RequestValues.text(b, "endsAt", "", 40, true);
    try {
      if (!Instant.parse(end).isAfter(Instant.parse(start))) throw new IllegalArgumentException();
    } catch (Exception e) {
      throw new ApiException("专题须填写有效起止时间，结束晚于开始");
    }
    var pointIds = RequestValues.texts(b, "pointIds", 60, 100);
    var ruleIds = RequestValues.texts(b, "ruleIds", 20, 36);
    if (new HashSet<>(pointIds).size() != pointIds.size()
        || new HashSet<>(ruleIds).size() != ruleIds.size()) throw new ApiException("专题关联不能重复");
    for (String id : pointIds)
      if (find(c.store.rows("points"), "id", id) == null) throw new ApiException("关联地点不存在");
    for (String id : ruleIds)
      if (find(c.store.rows("passportThemes"), "id", id) == null) throw new ApiException("关联印章不存在");
    String theme = RequestValues.text(b, "theme", "other", 30, true);
    if (!Set.of("spring", "graduation", "autumn", "night", "other").contains(theme))
      throw new ApiException("专题类型无效");
    var row =
        create
            ? obj("id", Security.id(), "createdAt", cn.campus.storage.StoreRepository.now())
            : old;
    row.putAll(
        obj(
            "title",
            title,
            "description",
            description,
            "theme",
            theme,
            "startsAt",
            Instant.parse(start).toString(),
            "endsAt",
            Instant.parse(end).toString(),
            "pointIds",
            pointIds,
            "ruleIds",
            ruleIds,
            "published",
            RequestValues.flag(b, "published", false),
            "revision",
            create ? 1 : integer(old.get("revision")) + 1));
    if (create) {
      if (c.store.rows("seasonTopics").size() >= 200) throw new ApiException("专题数量已达上限");
      c.store.rows("seasonTopics").add(row);
    }
    c.audit("维护季节专题", row.get("id"), yes(row.get("published")) ? "发布" : "草稿");
    c.store.bump();
    c.store.save();
    c.send(row, create ? 201 : 200);
    return true;
  }

  private Map<String, Object> view(ApiContext c, Map<String, Object> topic) {
    var out = copy(topic);
    out.remove("deleted");
    out.remove("createdBy");
    long now = TimeSource.now(),
        start = Instant.parse(str(topic.get("startsAt"))).toEpochMilli(),
        end = Instant.parse(str(topic.get("endsAt"))).toEpochMilli();
    out.put("phase", now < start ? "upcoming" : now >= end ? "ended" : "active");
    out.put(
        "points",
        c.store.rows("points").stream()
            .filter(
                p -> yes(p.get("published")) && list(topic.get("pointIds")).contains(p.get("id")))
            .map(p -> obj("id", p.get("id"), "name", p.get("name")))
            .toList());
    var records =
        c.account == null
            ? List.<Map<String, Object>>of()
            : PassportService.records(
                c.store.rows("checkins").stream()
                    .filter(r -> eq(r.get("ownerId"), c.account.get("id")))
                    .toList(),
                c.store.rows("sessions").stream()
                    .filter(r -> eq(r.get("ownerId"), c.account.get("id")))
                    .map(r -> cn.campus.exploration.SessionViews.view(c.store, r))
                    .toList());
    var eligible =
        records.stream()
            .filter(
                r -> {
                  try {
                    long at = Instant.parse(str(r.get("createdAt"))).toEpochMilli();
                    return at >= start
                        && at < end
                        && (list(topic.get("pointIds")).isEmpty()
                            || list(topic.get("pointIds")).contains(r.get("pointId")));
                  } catch (Exception e) {
                    return false;
                  }
                })
            .toList();
    out.put("visited", eligible.stream().map(r -> r.get("pointId")).distinct().count());
    // Progress is derived only from the current account's real, in-period records.
    out.put("visitedPointIds", eligible.stream().map(r -> r.get("pointId")).distinct().toList());
    out.put(
        "stamps",
        c.store.rows("passportThemes").stream()
            .filter(
                r -> yes(r.get("published")) && list(topic.get("ruleIds")).contains(r.get("id")))
            .map(r -> PassportProgressService.achievement(r, eligible))
            .toList());
    out.put("pointIds", rows(out.get("points")).stream().map(p -> p.get("id")).toList());
    out.put("ruleIds", rows(out.get("stamps")).stream().map(p -> p.get("id")).toList());
    return out;
  }
}
