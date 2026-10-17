package cn.campus.point;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.*;
import cn.campus.web.ApiContext;
import java.util.*;
import org.springframework.stereotype.Service;

/** Personal lists: all item changes and reordering commit with one optimistic revision. */
@Service
public final class PhotographyPlanService {
  public boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("user") || !c.path.startsWith("/api/my/plans")) return false;
    c.need();
    cn.campus.settings.InteractionFeatures.require(c.store, "plans");
    if (c.route("/api/my/plans", "GET")) {
      c.send(
          obj(
              "items",
              c.store.rows("photographyPlans").stream()
                  .filter(p -> eq(p.get("ownerId"), c.account.get("id")))
                  .toList()));
      return true;
    }
    boolean create = c.route("/api/my/plans", "POST");
    if (!create && !c.path.matches("/api/my/plans/[a-f0-9-]{36}")) return false;
    var old =
        create
            ? null
            : find(
                c.store.rows("photographyPlans"),
                "id",
                c.path.substring(c.path.lastIndexOf('/') + 1));
    if (!create && (old == null || !eq(old.get("ownerId"), c.account.get("id"))))
      throw new ApiException("拍摄清单不存在", 404);
    if (!Set.of("POST", "PUT", "DELETE").contains(c.method)) return false;
    if (!create
        && (!whole(c.body.get("revision"))
            || integer(c.body.get("revision")) != integer(old.get("revision"))))
      throw new ApiException("清单已在另一设备更新，请重新载入", 409);
    if (c.method.equals("DELETE")) {
      c.store.rows("photographyPlans").remove(old);
      c.store.save();
      c.send(obj("ok", true));
      return true;
    }
    if (create
        && c.store.rows("photographyPlans").stream()
                .filter(p -> eq(p.get("ownerId"), c.account.get("id")))
                .count()
            >= 30) throw new ApiException("最多保留30份拍摄清单");
    String title = RequestValues.text(c.body, "title", "", 80, true);
    if (!(c.body.get("items") instanceof List<?>) || list(c.body.get("items")).size() > 60)
      throw new ApiException("一份清单最多60项");
    var items = new ArrayList<Map<String, Object>>();
    var ids = new HashSet<String>();
    for (Object item : list(c.body.get("items"))) {
      if (!(item instanceof Map<?, ?>)) throw new ApiException("清单项目无效");
      var b = map(item);
      RequestValues.fields(b, "id", "spotId", "composition", "done");
      String id = RequestValues.text(b, "id", Security.id(), 36, true),
          spotId = RequestValues.text(b, "spotId", "", 36, true);
      if (!id.matches("[a-f0-9-]{36}") || !ids.add(id)) throw new ApiException("清单项目重复或编号无效");
      var spot = ShootingSpotService.published(c.store, spotId);
      var previous = old == null ? null : find(rows(old.get("items")), "id", id);
      if (spot == null && (previous == null || !eq(previous.get("spotId"), spotId)))
        throw new ApiException("请选择已发布机位，已下线旧项目可保留或移除", 409);
      items.add(
          obj(
              "id",
              id,
              "spotId",
              spotId,
              "title",
              spot == null ? previous.get("title") : spot.get("title"),
              "pointId",
              spot == null ? previous.get("pointId") : spot.get("pointId"),
              "composition",
              RequestValues.text(b, "composition", "", 500, false),
              "done",
              RequestValues.flag(b, "done", false)));
    }
    var plan =
        create
            ? obj(
                "id",
                Security.id(),
                "ownerId",
                c.account.get("id"),
                "createdAt",
                cn.campus.storage.StoreRepository.now())
            : old;
    plan.putAll(
        obj(
            "title",
            title,
            "items",
            items,
            "revision",
            create ? 1 : integer(old.get("revision")) + 1,
            "updatedAt",
            cn.campus.storage.StoreRepository.now()));
    if (create) c.store.rows("photographyPlans").add(plan);
    c.store.save();
    c.send(plan, create ? 201 : 200);
    return true;
  }
}
