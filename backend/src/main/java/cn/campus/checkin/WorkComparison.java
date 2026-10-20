package cn.campus.checkin;

import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.point.*;
import cn.campus.web.ApiContext;
import java.util.*;

public final class WorkComparison {
  public static boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("user") || !c.route("/api/works/compare", "GET")) return false;
    String spot = Objects.toString(c.request.getParameter("spotId"), ""),
        season = Objects.toString(c.request.getParameter("season"), "all"),
        band = Objects.toString(c.request.getParameter("time"), "all");
    if (ShootingSpotService.published(c.store, spot) == null)
      throw new ApiException("机位不存在或已下线", 404);
    if (!Set.of("all", "spring", "summer", "autumn", "winter", "unknown").contains(season)
        || !Set.of("all", "morning", "day", "evening", "night", "unknown").contains(band))
      throw new ApiException("作品筛选参数无效");
    var page =
        c.store
            .journeys()
            .compare(spot, season, band, CampusGuideService.page(c.request.getParameter("page")));
    c.send(
        obj(
            "items",
            page.items().stream()
                .filter(w -> WorkWallService.visible(c.store, w))
                .map(w -> WorkWallService.publicView(c.store, w))
                .toList(),
            "total",
            page.total(),
            "page",
            page.page(),
            "hasMore",
            page.hasMore(),
            "notice",
            "按作者自填拍摄时间归类（北京时间）；没有拍摄时间的作品归入未注明，不用发布时间代替。"));
    return true;
  }
}
