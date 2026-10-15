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
          store.rows("checkins").stream()
              .filter(x -> eq(x.get("ownerId"), account.get("id")))
              .toList();
      List<Map<String, Object>> sessions =
          store.rows("sessions").stream()
              .filter(x -> eq(x.get("ownerId"), account.get("id")))
              .toList();
      PassportService.records(checkins, sessions).forEach(r -> visited.add(r.get("pointId")));
    }
    List<Object> saved = account == null ? List.of() : list(account.get("bookmarks"));
    String query = normalize(request.query());
    query = ALIASES.getOrDefault(query, query);
    List<Map<String, Object>> results = new ArrayList<>();
    for (var point : store.rows("points")) {
      if (!yes(point.get("published"))) continue;
      Object id = point.get("id");
      var spots =
          store.rows("shootingSpots").stream()
              .filter(
                  s ->
                      eq(s.get("pointId"), id)
                          && ShootingSpotService.published(store, s.get("id")) != null)
              .toList();
      if (!request.condition().isEmpty()
          && spots.stream().noneMatch(s -> list(s.get("conditions")).contains(request.condition())))
        continue;
      if (!request.theme().equals("全部") && !eq(point.get("theme"), request.theme())) continue;
      if (request.filter().equals("saved") && !saved.contains(id)) continue;
      if (request.filter().equals("visited") && !visited.contains(id)) continue;
      if (request.filter().equals("unvisited") && visited.contains(id)) continue;
      StringBuilder text = new StringBuilder();
      for (String field : List.of("name", "description", "theme", "address"))
        text.append(' ').append(str(point.get(field)));
      for (var template : store.rows("templates"))
        if (yes(template.get("approved")) && eq(template.get("pointId"), id))
          text.append(' ').append(str(template.get("title")));
      spots.forEach(
          s ->
              text.append(' ')
                  .append(str(s.get("title")))
                  .append(' ')
                  .append(str(s.get("standDescription"))));
      if (!query.isEmpty() && !normalize(text.toString()).contains(query)) continue;
      results.add(point);
    }
    if (request.filter().equals("popular"))
      results.sort(
          Comparator.comparingLong(
                  (Map<String, Object> p) -> integer(PointService.stats(p).get("popularity")))
              .reversed());
    var disliked = PointReactionService.dislikedIds(store, account);
    results.sort(Comparator.comparing(p -> disliked.contains(str(p.get("id")))));
    int start = (int) Math.min(results.size(), (long) (request.page() - 1) * request.pageSize());
    int end = Math.min(results.size(), start + request.pageSize());
    var views = PointReactionService.publicPoints(store, results.subList(start, end), account);
    for (var p : views)
      p.put(
          "matchingSpots",
          store.rows("shootingSpots").stream()
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
        results.size(),
        "page",
        request.page(),
        "pageSize",
        request.pageSize(),
        "hasMore",
        end < results.size());
  }

  public static String normalize(String text) {
    return Normalizer.normalize(text, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
  }

  public static String normalizedQuery(String value) {
    String query = normalize(value.trim());
    return ALIASES.getOrDefault(query, query);
  }
}
