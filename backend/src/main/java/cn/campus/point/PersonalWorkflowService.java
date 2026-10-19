package cn.campus.point;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.*;
import cn.campus.notification.NotificationService;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;

/** Private collections, explicitly revocable public plan snapshots and opt-in inbox reminders. */
@Service
public final class PersonalWorkflowService {
  private static String uid(ApiContext c) {
    return str(c.account.get("id"));
  }

  private static void revision(ApiContext c, Map<String, Object> row) {
    if (!whole(c.body.get("revision"))
        || integer(c.body.get("revision")) != integer(row.get("revision")))
      throw new ApiException("内容已更新，请重新载入", 409);
  }

  private static List<Map<String, Object>> shareItems(
      StoreRepository s, Map<String, Object> share) {
    return rows(share.get("items")).stream()
        .filter(i -> ShootingSpotService.published(s, i.get("spotId")) != null)
        .map(
            i -> {
              var spot = ShootingSpotService.published(s, i.get("spotId"));
              return obj(
                  "spotId",
                  spot.get("id"),
                  "pointId",
                  spot.get("pointId"),
                  "title",
                  spot.get("title"),
                  "composition",
                  i.get("composition"));
            })
        .toList();
  }

  public boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("user")) return false;
    if (c.path.matches("/api/plan-shares/[a-f0-9]{64}(/import)?")) {
      cn.campus.settings.InteractionFeatures.require(c.store, "plans");
      String token = c.path.split("/")[3];
      var share = find(c.store.rows("planShares"), "token", token);
      if (share == null
          || yes(share.get("revoked"))
          || Instant.parse(str(share.get("expiresAt"))).toEpochMilli() <= TimeSource.now())
        throw new ApiException("分享已撤销或到期", 404);
      var items = shareItems(c.store, share);
      if (c.route("/api/plan-shares/" + token, "GET")) {
        c.send(
            obj("title", share.get("title"), "items", items, "expiresAt", share.get("expiresAt")));
        return true;
      }
      if (c.route("/api/plan-shares/" + token + "/import", "POST")) {
        c.need();
        String submission = RequestValues.text(c.body, "submissionId", "", 36, true);
        if (!submission.matches("[a-f0-9-]{36}")) throw new ApiException("导入编号无效");
        var existing =
            c.store.rows("photographyPlans").stream()
                .filter(
                    p ->
                        eq(p.get("ownerId"), uid(c))
                            && eq(p.get("importKey"), token + ":" + submission))
                .findFirst();
        if (existing.isPresent()) {
          c.send(existing.get(), 201);
          return true;
        }
        if (c.store.rows("photographyPlans").stream()
                .filter(p -> eq(p.get("ownerId"), uid(c)))
                .count()
            >= 30) throw new ApiException("最多保留30份拍摄清单");
        if (items.isEmpty()) throw new ApiException("分享中的机位已下线，暂无可导入项目", 409);
        var plan =
            obj(
                "id",
                Security.id(),
                "ownerId",
                uid(c),
                "title",
                share.get("title"),
                "items",
                items.stream()
                    .map(
                        i ->
                            obj(
                                "id",
                                Security.id(),
                                "spotId",
                                i.get("spotId"),
                                "pointId",
                                i.get("pointId"),
                                "title",
                                i.get("title"),
                                "composition",
                                i.get("composition"),
                                "done",
                                false))
                    .toList(),
                "revision",
                1,
                "importKey",
                token + ":" + submission,
                "createdAt",
                StoreRepository.now(),
                "updatedAt",
                StoreRepository.now());
        c.store.rows("photographyPlans").add(plan);
        c.store.save();
        c.send(plan, 201);
        return true;
      }
      return false;
    }
    if (c.path.matches("/api/my/plans/[a-f0-9-]{36}/share")) {
      c.need();
      cn.campus.settings.InteractionFeatures.require(c.store, "plans");
      var plan = find(c.store.rows("photographyPlans"), "id", c.path.split("/")[4]);
      if (plan == null || !eq(plan.get("ownerId"), uid(c))) throw new ApiException("清单不存在", 404);
      var shares = c.store.rows("planShares");
      if (c.method.equals("GET")) {
        c.send(
            obj(
                "items",
                shares.stream()
                    .filter(
                        s ->
                            eq(s.get("ownerId"), uid(c))
                                && eq(s.get("planId"), plan.get("id"))
                                && !yes(s.get("revoked")))
                    .map(s -> obj("token", s.get("token"), "expiresAt", s.get("expiresAt")))
                    .toList()));
        return true;
      }
      if (!Set.of("POST", "DELETE").contains(c.method)) return false;
      revision(c, plan);
      for (var s : shares) if (eq(s.get("planId"), plan.get("id"))) s.put("revoked", true);
      if (c.method.equals("DELETE")) {
        c.store.save();
        c.send(obj("ok", true));
        return true;
      }
      boolean notes = RequestValues.flag(c.body, "includeComposition", false);
      var items =
          rows(plan.get("items")).stream()
              .filter(i -> ShootingSpotService.published(c.store, i.get("spotId")) != null)
              .map(
                  i ->
                      obj(
                          "spotId",
                          i.get("spotId"),
                          "composition",
                          notes ? i.get("composition") : ""))
              .toList();
      if (items.isEmpty()) throw new ApiException("请先加入可分享的已发布机位");
      String token = Security.digest(Security.id() + Security.id());
      var s =
          obj(
              "id",
              Security.id(),
              "ownerId",
              uid(c),
              "planId",
              plan.get("id"),
              "token",
              token,
              "title",
              plan.get("title"),
              "items",
              items,
              "revoked",
              false,
              "expiresAt",
              Instant.ofEpochMilli(TimeSource.now() + 7 * 86400000L).toString());
      shares.add(s);
      c.store.save();
      c.send(obj("token", token, "expiresAt", s.get("expiresAt")), 201);
      return true;
    }
    if (c.path.startsWith("/api/my/collections")) {
      c.need();
      cn.campus.settings.InteractionFeatures.require(c.store, "plans");
      var mine = c.store.rows("favoriteCollections");
      if (c.route("/api/my/collections", "GET")) {
        c.send(
            obj(
                "items",
                mine.stream()
                    .filter(p -> eq(p.get("ownerId"), uid(c)))
                    .map(
                        p -> {
                          var out = copy(p);
                          out.remove("ownerId");
                          out.put(
                              "pointIds",
                              list(p.get("pointIds")).stream()
                                  .filter(id -> list(c.account.get("bookmarks")).contains(id))
                                  .toList());
                          return out;
                        })
                    .toList()));
        return true;
      }
      boolean create = c.route("/api/my/collections", "POST");
      if (!create && !c.path.matches("/api/my/collections/[a-f0-9-]{36}")) return false;
      if (!Set.of("POST", "PUT", "DELETE").contains(c.method)) return false;
      var old = create ? null : find(mine, "id", c.path.split("/")[4]);
      if (!create && (old == null || !eq(old.get("ownerId"), uid(c))))
        throw new ApiException("分组不存在", 404);
      if (!create) revision(c, old);
      if (c.method.equals("DELETE")) {
        mine.remove(old);
        c.store.save();
        c.send(obj("ok", true));
        return true;
      }
      if (create && mine.stream().filter(p -> eq(p.get("ownerId"), uid(c))).count() >= 30)
        throw new ApiException("最多30个收藏分组");
      var pointIds = RequestValues.texts(c.body, "pointIds", 200, 100);
      if (!list(c.account.get("bookmarks")).containsAll(pointIds))
        throw new ApiException("只能分组已收藏的地点");
      var row = create ? obj("id", Security.id(), "ownerId", uid(c)) : old;
      row.putAll(
          obj(
              "title",
              RequestValues.text(c.body, "title", "", 80, true),
              "pointIds",
              new ArrayList<>(new LinkedHashSet<>(pointIds)),
              "revision",
              create ? 1 : integer(old.get("revision")) + 1));
      if (create) mine.add(row);
      c.store.save();
      var view = copy(row);
      view.remove("ownerId");
      c.send(view, create ? 201 : 200);
      return true;
    }
    if (c.path.equals("/api/my/topic-reminders")) {
      c.need();
      cn.campus.settings.InteractionFeatures.require(c.store, "topics");
      if (c.method.equals("GET")) {
        c.send(
            obj(
                "topicIds",
                c.store.rows("topicReminders").stream()
                    .filter(r -> eq(r.get("userId"), uid(c)) && yes(r.get("enabled")))
                    .map(r -> r.get("topicId"))
                    .toList()));
        return true;
      }
      if (!c.method.equals("POST")) return false;
      String topicId = RequestValues.text(c.body, "topicId", "", 36, true);
      var topic = find(c.store.rows("seasonTopics"), "id", topicId);
      if (topic == null || !yes(topic.get("published")) || yes(topic.get("deleted")))
        throw new ApiException("活动不存在", 404);
      boolean enabled = RequestValues.flag(c.body, "enabled", true);
      var row =
          c.store.rows("topicReminders").stream()
              .filter(r -> eq(r.get("userId"), uid(c)) && eq(r.get("topicId"), topicId))
              .findFirst()
              .orElse(null);
      if (row == null) {
        row = obj("id", Security.id(), "userId", uid(c), "topicId", topicId);
        c.store.rows("topicReminders").add(row);
        row = c.store.rows("topicReminders").getLast();
      }
      row.put("enabled", enabled);
      c.store.save();
      c.send(obj("enabled", enabled));
      return true;
    }
    return false;
  }

  public static void deliverReminders(ApiContext c) {
    for (var r : c.store.rows("topicReminders")) {
      if (!eq(r.get("userId"), c.account.get("id")) || !yes(r.get("enabled"))) continue;
      var t = find(c.store.rows("seasonTopics"), "id", r.get("topicId"));
      if (t == null || yes(t.get("deleted")) || !yes(t.get("published"))) continue;
      try {
        long start = Instant.parse(str(t.get("startsAt"))).toEpochMilli(),
            end = Instant.parse(str(t.get("endsAt"))).toEpochMilli(),
            now = TimeSource.now();
        if (now >= end || now < start - 86400000L) continue;
        String phase = now < start ? "soon" : "started";
        NotificationService.add(
            c.store,
            c.account.get("id"),
            "subscribed-topic:" + t.get("id") + ":" + start + ":" + phase,
            "activity",
            (phase.equals("soon") ? "活动即将开始 · " : "订阅活动已开始 · ") + t.get("title"),
            "你订阅的活动：" + t.get("description"),
            "#topic/" + t.get("id"));
      } catch (Exception ignored) {
      }
    }
  }
}
