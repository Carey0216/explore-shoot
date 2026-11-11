package cn.campus.ai.knowledge;

import static cn.campus.common.Json.*;

import cn.campus.common.*;
import cn.campus.point.*;
import cn.campus.storage.StoreRepository;
import java.util.*;
import java.util.regex.*;

/** Owner-local conversational drafts. No personal collection is sent to a model provider. */
public final class AssistantPlanDialogue {
  private static final Pattern STATION = Pattern.compile("第([一二两三四五六123456])站|\\b(first|second|third|fourth|fifth|sixth|[1-6](?:st|nd|rd|th)?)\\s+(?:stop|station)\\b", Pattern.CASE_INSENSITIVE);
  private static final List<String> ORDINALS = List.of("first", "second", "third", "fourth", "fifth", "sixth");
  private AssistantPlanDialogue() {}

  public static Map<String, Object> context(Object raw) {
    if (raw == null) return obj();
    if (!(raw instanceof Map<?, ?>)) throw new ApiException("拍摄计划上下文无效");
    var b = map(raw);
    // Older clients still send this field. It no longer constrains recommendations.
    RequestValues.fields(b, "preference", "spotIds", "favorites", "quiet", "budget");
    return obj(
        "preference", RequestValues.text(b, "preference", "", 300, false),
        "spotIds", RequestValues.texts(b, "spotIds", 6, 100),
        "favorites", RequestValues.flag(b, "favorites", false),
        "quiet", RequestValues.flag(b, "quiet", false));
  }

  private static int stationIndex(Matcher station) {
    if (station.group(1) != null) {
      char digit = station.group(1).replace('两', '二').charAt(0);
      return Character.isDigit(digit) ? digit - '1' : "一二三四五六".indexOf(digit);
    }
    String ordinal = station.group(2).toLowerCase(Locale.ROOT);
    return Character.isDigit(ordinal.charAt(0)) ? ordinal.charAt(0) - '1' : ORDINALS.indexOf(ordinal);
  }

  private static boolean has(String q, String pattern) { return Pattern.compile(pattern, Pattern.CASE_INSENSITIVE).matcher(q).find(); }
  private static boolean usable(StoreRepository s, Map<String,Object> spot) {
    if (spot == null || ShootingSpotService.published(s, spot.get("id")) == null || eq(spot.get("availability"), "closed")) return false;
    var p = find(s.rows("points"), "id", spot.get("pointId"));
    return p != null && yes(p.get("open"));
  }
  private static int relevance(StoreRepository s, Map<String,Object> spot, String preference, boolean quiet) {
    var point = find(s.rows("points"), "id", spot.get("pointId"));
    int score = SearchLanguage.score(spot, preference) + SearchLanguage.score(point, preference);
    if (quiet && has(str(spot.get("conditions")) + str(spot.get("standDescription")) + str(spot.get("compositionTip")) + str(point.get("desc")), "安静|清静|人少|quiet")) score += 40;
    return score;
  }

  /** Called only under store.readAccess; drafts never modify persistent state. */
  public static Map<String,Object> reply(StoreRepository store, Map<String,Object> account, String question, Object raw) {
    var previous = context(raw);
    boolean retained = !previous.isEmpty();
    boolean edit = has(question, "第二站|第[一二三四五六123456]站|太远|近一点|近点|安静|收藏|删掉|删除|移除|换.*站|换个|换成|继续.*计划|下一站|quieter|too far|favorites|replace|remove");
    boolean planning = has(question, "安排.*拍|拍摄计划|规划.*拍|拍.*路线|想拍|带我.*拍|拍点|plan.*photo|shoot.*plan|want.*(?:shoot|photograph|capture)|photo.*(?:walk|route)|photography.*plan|plan.*(?:shoot|walk)|take.*photos?");
    if (!planning && !(retained && edit)) return null;
    cn.campus.settings.InteractionFeatures.require(store, "plans");
    String preference = retained ? str(previous.get("preference")) : question;
    if (planning && !has(question, "继续|安排一次拍摄")) preference = question;
    boolean favorites = retained && yes(previous.get("favorites")) || has(question, "收藏|favorites");
    if (has(question, "不限收藏|不只.*收藏|全校|anywhere")) favorites = false;
    boolean quiet = retained && yes(previous.get("quiet")) || has(question, "安静|清静|人少|quiet");
    var notices = new ArrayList<String>();
    var ids = new ArrayList<String>();
    for (Object id : list(previous.get("spotIds"))) ids.add(str(id));
    Set<String> bookmarked = new HashSet<>();
    if (account != null) for (Object id : list(account.get("bookmarks"))) bookmarked.add(str(id));
    if (favorites && account == null) {
      return result(previous, null, "先登录同一个账号，再说“从我收藏里挑”。当前讨论的计划会保留；不会读取其他人的收藏。", List.of());
    }
    final String pref = preference;
    final boolean quietPreferred = quiet;
    final boolean favoritesOnly = favorites;
    var candidates = new ArrayList<>(store.rows("shootingSpots").stream()
        .filter(s -> usable(store, s) && (!favoritesOnly || bookmarked.contains(str(s.get("pointId")))))
        .sorted(Comparator.<Map<String,Object>>comparingInt(s -> relevance(store, s, pref, quietPreferred)).reversed().thenComparing(s -> str(s.get("id"))))
        .limit(240).toList());
    if (candidates.isEmpty() || ids.stream().anyMatch(id -> id.startsWith("point:"))) {
      store.rows("points").stream()
          .filter(p -> yes(p.get("published")) && yes(p.get("open")))
          .filter(p -> !favoritesOnly || bookmarked.contains(str(p.get("id"))))
          .sorted(Comparator.<Map<String, Object>>comparingInt(p -> SearchLanguage.score(p, pref))
              .reversed().thenComparing(p -> str(p.get("id"))))
          .limit(240).map(PlanExecution::pointReference).forEach(candidates::add);
    }
    if (favorites && candidates.isEmpty()) return result(previous, null,
        "你的收藏中暂时没有可以前往的公开地点。可以说“不限收藏，想拍建筑”继续调整，当前计划已保留。", List.of());
    var allowed = candidates.stream().map(s -> str(s.get("id"))).collect(java.util.stream.Collectors.toSet());
    boolean removedUnavailable = ids.removeIf(id -> !allowed.contains(id));
    if (removedUnavailable) notices.add("已移除当前未发布、关闭或不在所选收藏范围内的站点。");
    var station = STATION.matcher(question);
    int target = Math.min(1, Math.max(0, ids.size() - 1));
    if (station.find()) target = stationIndex(station);
    boolean removal = has(question, "删掉|删除|移除|remove");
    boolean replacement = has(question, "太远|近一点|近点|换|quieter|too far|replace");
    boolean refresh = !retained || planning && !edit || favorites && !yes(previous.get("favorites"));
    if (removal && !ids.isEmpty()) {
      if (target < ids.size()) { ids.remove(target); notices.add("已移除这一站，其余顺序保留。"); }
      else notices.add("计划里没有这一站，当前安排保持不变。");
    } else if (replacement && !ids.isEmpty()) {
      if (target >= ids.size()) notices.add("计划里没有这一站，当前安排保持不变。");
      else {
        final int at = target;
        var before = at > 0 ? PlanExecution.resolveStop(store, ids.get(at - 1)) : null;
        var after = at + 1 < ids.size() ? PlanExecution.resolveStop(store, ids.get(at + 1)) : null;
        var original = PlanExecution.resolveStop(store, ids.get(at));
        boolean nearer = has(question, "太远|近|too far|closer");
        double oldDistance = distance(before, original, after);
        var choice = candidates.stream().filter(s -> !ids.contains(str(s.get("id"))))
            .filter(s -> !nearer || distance(before, s, after) < oldDistance)
            .min(Comparator.<Map<String,Object>>comparingDouble(s ->
                distance(before, s, after) - (nearer ? 0 : relevance(store, s, pref, quietPreferred) * 15.0)));
        if (choice.isPresent()) { ids.set(at, str(choice.get().get("id"))); notices.add("已替换第" + (at + 1) + "站，其余站点顺序保留。" + (nearer ? "替代站与相邻站的直线距离更短，实际道路仍需导航核对。" : "优先参考公开机位描述与你的偏好。")); }
        else notices.add("暂未找到满足这次替换要求的其他公开站点。可以保留或移除这一站，也可以放宽偏好。");
      }
    }
    if (refresh || ids.isEmpty() && !removal && !removedUnavailable) {
      ids.clear();
      for (var s : candidates) { ids.add(str(s.get("id"))); if (ids.size() >= 3) break; }
    }
    Map<String,Object> preview;
    if (ids.isEmpty()) preview = obj("plan", obj("title", "我的校园拍摄计划", "items", List.of(), "departure", "", "checklist", obj()), "canSave", false,
        "schedule", obj("estimatedMinutes", 0, "warnings", List.of()), "places", List.of());
    else preview = CampusGuideService.preview(store, obj("question", preference, "spotIds", ids));
    var actual = rows(map(preview.get("plan")).get("items"));
    if (quiet) notices.add("已优先匹配提到安静、人少的公开描述；实时人流未核实，不能保证现场安静。");
    notices.add("开放状态依据已发布资料，具体开放时间未填的站点须出发前确认；这里不把建议当作已核验道路。");
    var next = obj( "preference", preference, "spotIds", actual.stream().map(s -> s.get("spotId")).toList(), "favorites", favorites, "quiet", quiet);
    preview.put("basis", (favorites ? "范围为你的收藏。" : "优先安排已发布且未关闭的真实机位。")
        + (actual.stream().anyMatch(s -> str(s.get("spotId")).startsWith("point:"))
            ? "计划含公开地点，到达后请自行取景。" : "")
        + "偏好用于排序，步行按直线距离估算，包含20%余量。");
    preview.put("notice", String.join(" ", notices));
    String answer = (actual.isEmpty() ? "这份计划暂时没有可前往的站点。" : "这份计划现在有" + actual.size() + "站，预计约" + map(preview.get("schedule")).get("estimatedMinutes") + "分钟。")
        + (notices.isEmpty() ? "" : notices.get(0)) + " 可以继续说“第二站太远”“换个安静点的”或“从我收藏里挑”。确认后点击保存，再从清单导航出发；此时还没有自动保存。";
    return result(next, preview, answer, notices);
  }
  private static double distance(Map<String,Object> before, Map<String,Object> spot, Map<String,Object> after) {
    return (before == null ? 0 : PlanExecution.metres(before, spot)) + (after == null ? 0 : PlanExecution.metres(spot, after));
  }
  private static Map<String,Object> result(Map<String,Object> context, Map<String,Object> preview, String answer, List<String> notices) {
    return obj("mode", "plan", "answer", answer, "sources", List.of(), "places", List.of(), "notices", notices, "planContext", context, "planPreview", preview);
  }
}
