package cn.campus.admin;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.*;
import cn.campus.notification.NotificationService;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.util.*;

/** All optimistic checks precede any mutation; a batch and its notifications commit once. */
public final class ReviewQueue {
  private static final Map<String, String> GROUPS =
      Map.of(
          "applications",
          "applications",
          "reports",
          "reports",
          "works",
          "works",
          "shooting-spots",
          "shootingSpots",
          "work-reports",
          "workReports");

  public record Choice(String id, String version) {}

  public record Decision(String kind, String action, String note, List<Choice> items) {
    static Decision from(Map<String, Object> body) {
      RequestValues.fields(body, "kind", "action", "note", "items");
      String kind = RequestValues.text(body, "kind", "", 40, true),
          action = RequestValues.text(body, "action", "", 20, true);
      String note = RequestValues.text(body, "note", "", 500, false);
      if (!GROUPS.containsKey(kind) || !Set.of("approve", "reject").contains(action))
        throw new ApiException("审核参数无效");
      if (!(body.get("items") instanceof List<?> values) || values.isEmpty() || values.size() > 12)
        throw new ApiException("每次选择1至12条审核记录");
      var items = new ArrayList<Choice>();
      var ids = new HashSet<String>();
      for (var v : values) {
        if (!(v instanceof Map<?, ?>)) throw new ApiException("审核记录格式无效");
        var item = map(v);
        RequestValues.fields(item, "id", "version");
        String id = RequestValues.text(item, "id", "", 36, true),
            version = RequestValues.text(item, "version", "", 64, true);
        if (!id.matches("[a-f0-9-]{36}") || !version.matches("[a-f0-9]{64}") || !ids.add(id))
          throw new ApiException("审核记录无效或重复");
        items.add(new Choice(id, version));
      }
      return new Decision(kind, action, note, List.copyOf(items));
    }
  }

  private static String version(Map<String, Object> row) {
    return Security.digest(write(row));
  }

  private static void permission(ApiContext c, String kind, boolean write) {
    c.need();
    if (!GROUPS.containsKey(kind)
        || !AdminPermissions.has(c.account, kind + (write ? ".write" : ".read")))
      throw new ApiException("无审核权限", 403);
  }

  public static boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("admin")) return false;
    if (c.route("/api/admin/review-queue", "GET")) {
      String kind = Objects.toString(c.request.getParameter("kind"), "applications");
      permission(c, kind, false);
      String status = Objects.toString(c.request.getParameter("status"), "pending");
      if (!Set.of("pending", "approved", "published", "rejected", "resolved", "all")
          .contains(status)) throw new ApiException("审核状态无效");
      int page = 1;
      try {
        page = Integer.parseInt(Objects.toString(c.request.getParameter("page"), "1"));
      } catch (NumberFormatException e) {
        throw new ApiException("分页参数无效");
      }
      if (page < 1 || page > 100000) throw new ApiException("分页参数无效");
      String query = Objects.toString(c.request.getParameter("query"), "").trim();
      if (query.length() > 100) throw new ApiException("搜索文字过长");
      var result =
          c.store.page(GROUPS.get(kind), status.equals("all") ? "" : status, "", query, page, 12);
      var views = new ArrayList<Map<String, Object>>();
      for (var row : result.items()) {
        var view =
            obj(
                "id",
                row.get("id"),
                "status",
                row.get("status"),
                "version",
                version(row),
                "createdAt",
                row.get("createdAt"));
        for (String key :
            List.of(
                "reason",
                "description",
                "category",
                "caption",
                "title",
                "standDescription",
                "conditions",
                "note",
                "reviewNote")) if (row.containsKey(key)) view.put(key, row.get(key));
        var user =
            find(
                c.store.rows("users"),
                "id",
                row.getOrDefault("userId", row.getOrDefault("ownerId", row.get("authorId"))));
        view.put(
            "requester",
            user == null
                ? obj("nickname", "已删除用户")
                : obj("nickname", user.get("nickname"), "username", user.get("username")));
        if (kind.equals("works")) view.put("photo", "/api/admin/works/" + row.get("id") + "/photo");
        views.add(view);
      }
      c.send(
          obj("items", views, "total", result.total(), "page", page, "hasMore", result.hasMore()));
      return true;
    }
    if (!c.route("/api/admin/review-queue/decide", "POST")) return false;
    var decision = Decision.from(c.body);
    permission(c, decision.kind(), true);
    var records = new ArrayList<Map<String, Object>>();
    for (var item : decision.items()) {
      var row = find(c.store.rows(GROUPS.get(decision.kind())), "id", item.id());
      if (row == null || !eq(row.get("status"), "pending") || !version(row).equals(item.version()))
        throw new ApiException("记录已经变化，未保存任何审核结果；请刷新后重新核对", 409);
      if (decision.action().equals("approve")
          && decision.kind().equals("works")
          && cn.campus.point.ShootingSpotService.published(c.store, row.get("spotId")) == null)
        throw new ApiException("所属机位已下线，未保存任何审核结果", 409);
      if (decision.action().equals("approve") && decision.kind().equals("shooting-spots")) {
        var point = find(c.store.rows("points"), "id", row.get("pointId"));
        if (point == null || !yes(point.get("published")))
          throw new ApiException("所属地点已下线，未保存任何审核结果", 409);
      }
      records.add(row);
    }
    boolean approved = decision.action().equals("approve");
    for (var row : records) {
      String status = approved ? "approved" : "rejected",
          event = "review:" + decision.kind() + ":" + row.get("id");
      Object owner = row.getOrDefault("userId", row.getOrDefault("ownerId", row.get("authorId")));
      switch (decision.kind()) {
        case "applications" -> {
          var user = find(c.store.rows("users"), "id", row.get("userId"));
          if (user != null) user.put("scoutStatus", status);
        }
        case "reports", "work-reports" -> status = approved ? "resolved" : "rejected";
        case "shooting-spots" -> {
          status = approved ? "published" : "rejected";
          row.put("notifiedStatus", status);
          row.put("revision", integer(row.get("revision")) + 1);
        }
        case "works" -> {
          cn.campus.checkin.WorkWallService.decide(c, row, status, decision.note());
        }
      }
      row.putAll(
          obj(
              "status",
              status,
              "note",
              decision.note(),
              "reviewedBy",
              c.account.get("id"),
              "reviewedAt",
              StoreRepository.now()));
      if (!decision.kind().equals("works"))
        NotificationService.add(
            c.store,
            owner,
            event,
            "review",
            "你的提交已有处理结果",
            (approved ? "已通过或处理" : "暂未采纳")
                + (decision.note().isEmpty() ? "" : "：" + decision.note()),
            "#me");
      c.audit("批量审核", row.get("id"), decision.kind() + ":" + status);
    }
    c.store.bump();
    c.store.save();
    c.send(obj("saved", true, "count", records.size(), "savedAt", StoreRepository.now()));
    return true;
  }
}
