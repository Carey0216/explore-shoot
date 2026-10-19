package cn.campus.point;

import static cn.campus.common.Json.*;

import cn.campus.checkin.PassportService;
import cn.campus.point.dto.PointSearchRequest;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.text.Normalizer;
import java.util.*;
import org.springframework.stereotype.Service;

/** Server-side search and paging. Nearby distance remains on the device; no GPS is submitted. */
@Service
public class PointSearchService {
  private static final Map<String, String> ALIASES =
      Map.ofEntries(
          Map.entry("library", "图书馆"),
          Map.entry("図書館", "图书馆"),
          Map.entry("圖書館", "图书馆"),
          Map.entry("architecture", "建筑"),
          Map.entry("building", "建筑"),
          Map.entry("建築", "建筑"),
          Map.entry("建物", "建筑"),
          Map.entry("nature", "自然"),
          Map.entry("sport", "运动"),
          Map.entry("sports", "运动"),
          Map.entry("スポーツ", "运动"),
          Map.entry("運動", "运动"),
          Map.entry("life", "人文"));

  public boolean handle(ApiContext context) throws Exception {
    if (!context.audience.equals("user") || !context.route("/api/points/search", "POST"))
      return false;
    PointSearchRequest request = PointSearchRequest.from(context.body);
    if (List.of("saved", "visited", "unvisited").contains(request.filter())) context.need();
    context.send(search(context.store, context.account, request));
    return true;
  }

  public Map<String, Object> search(
      StoreRepository store, Map<String, Object> account, PointSearchRequest request) {
    Set<Object> visited = new HashSet<>();
    if (account != null) {
      List<Map<String, Object>> checkins =
          store.indexed("checkins", "ownerId", str(account.get("id"))).stream().toList();
      List<Map<String, Object>> sessions =
          store.indexed("sessions", "ownerId", str(account.get("id"))).stream().toList();
      PassportService.records(checkins, sessions).forEach(r -> visited.add(r.get("pointId")));
    }
    List<Object> saved = account == null ? List.of() : list(account.get("bookmarks"));
    var result =
        store.pointPage(request, saved, visited, PointReactionService.dislikedIds(store, account));
    var views = PointReactionService.publicPoints(store, result.items(), account);
    for (var p : views)
      p.put(
          "matchingSpots",
          store.indexed("shootingSpots", "pointId", str(p.get("id"))).stream()
              .filter(
                  s ->
                      eq(s.get("pointId"), p.get("id"))
                          && ShootingSpotService.published(store, s.get("id")) != null)
              .filter(
                  s ->
                      request.condition().isEmpty()
                          || list(s.get("conditions")).contains(request.condition()))
              .map(ShootingSpotService::view)
              .toList());
    return obj(
        "points",
        views,
        "total",
        result.total(),
        "page",
        request.page(),
        "pageSize",
        request.pageSize(),
        "hasMore",
        result.hasMore());
  }

  public static String normalize(String text) {
    return Normalizer.normalize(text, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
  }

  public static String normalizedQuery(String value) {
    String query = normalize(value.trim());
    return ALIASES.getOrDefault(query, query);
  }
}
