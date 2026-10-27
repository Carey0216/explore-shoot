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
        store.pointPage(
            request,
            saved,
            visited,
            PointReactionService.dislikedIds(store, account),
            store.rows("points").stream()
                .filter(p -> yes(p.get("published")) && friendlyMatch(p, request.query()))
                .map(p -> str(p.get("id")))
                .toList());
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
        result.hasMore(),
        "suggestions",
        result.total() == 0 && request.query().length() >= 2
            ? suggestions(store, request.query())
            : List.of());
  }

  private static final Map<String, String> CAMPUS_ALIASES =
      Map.ofEntries(
          Map.entry("图书管", "图书馆"),
          Map.entry("图书官", "图书馆"),
          Map.entry("图书", "图书馆"),
          Map.entry("德泽", "德泽楼"),
          Map.entry("德择楼", "德泽楼"),
          Map.entry("明湖", "明湖"),
          Map.entry("北民大", "北方民族大学"));

  private static final ThreadLocal<com.ibm.icu.text.Transliterator> PINYIN =
      ThreadLocal.withInitial(
          () -> com.ibm.icu.text.Transliterator.getInstance("Han-Latin; Latin-ASCII; Lower()"));

  public static String pinyin(String value, boolean initials) {
    String latin = PINYIN.get().transliterate(normalize(value));
    if (!initials) return latin.replaceAll("[^a-z0-9]", "");
    var out = new StringBuilder();
    for (String part : latin.split("[^a-z0-9]+")) if (!part.isEmpty()) out.append(part.charAt(0));
    return out.toString();
  }

  public static boolean friendlyMatch(Map<String, Object> point, String query) {
    String q = normalize(query).replaceAll("\\s+", "");
    if (q.isEmpty()) return false;
    String name = normalize(str(point.get("name"))), target = CAMPUS_ALIASES.getOrDefault(q, q);
    if (name.contains(target)) return true;
    for (Object alias : list(point.get("aliases")))
      if (normalize(str(alias)).contains(q)) return true;
    if (q.matches("[a-z][a-z0-9]{1,79}"))
      return pinyin(name, false).contains(q) || pinyin(name, true).contains(q);
    return SearchLanguage.score(point, query) > 0;
  }

  static int edits(String a, String b) {
    int[] row = new int[b.length() + 1];
    for (int j = 0; j < row.length; j++) row[j] = j;
    for (int i = 1; i <= a.length(); i++) {
      int diagonal = row[0];
      row[0] = i;
      for (int j = 1; j <= b.length(); j++) {
        int old = row[j];
        row[j] =
            Math.min(
                Math.min(row[j] + 1, row[j - 1] + 1),
                diagonal + (a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1));
        diagonal = old;
      }
    }
    return row[b.length()];
  }

  static List<Map<String, Object>> suggestions(StoreRepository store, String query) {
    String q = normalize(query);
    return store.rows("points").stream()
        .filter(p -> yes(p.get("published")))
        .map(
            p -> {
              String name = normalize(str(p.get("name")));
              int best = 100;
              for (int i = 0; i < name.length(); i++)
                for (int length = Math.max(2, q.length() - 1);
                    length <= q.length() + 1 && i + length <= name.length();
                    length++) best = Math.min(best, edits(q, name.substring(i, i + length)));
              return obj("id", p.get("id"), "name", p.get("name"), "score", best);
            })
        .filter(p -> integer(p.get("score")) <= 1)
        .sorted(Comparator.comparingLong(p -> integer(p.get("score"))))
        .limit(4)
        .map(p -> obj("id", p.get("id"), "name", p.get("name")))
        .toList();
  }

  public static String normalize(String text) {
    return Normalizer.normalize(text, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
  }

  public static String normalizedQuery(String value) {
    String query = normalize(value.trim());
    return ALIASES.getOrDefault(query, query);
  }
}
