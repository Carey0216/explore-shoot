package cn.campus.ai.knowledge;

import static cn.campus.common.Json.*;

import cn.campus.common.*;
import cn.campus.point.*;
import cn.campus.storage.StoreRepository;
import java.util.*;
import java.util.regex.*;

/** Owner-local conversational drafts. No personal collection is sent to a model provider. */
public final class AssistantPlanDialogue {
  private static final Pattern MINUTES = Pattern.compile("([0-9]{1,3}|[一二两三四五六七八九十百]{1,5}|(?:one hundred(?: and)? |(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[ -])?(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety))\\s*(?:分钟|minutes?|mins?)", Pattern.CASE_INSENSITIVE);
  private static final Pattern STATION = Pattern.compile("第([一二两三四五六123456])站|\\b(first|second|third|fourth|fifth|sixth|[1-6](?:st|nd|rd|th)?)\\s+(?:stop|station)\\b", Pattern.CASE_INSENSITIVE);
  private AssistantPlanDialogue() {}

  public static Map<String, Object> context(Object raw) {
    if (raw == null) return obj();
    if (!(raw instanceof Map<?, ?>)) throw new ApiException("拍摄计划上下文无效");
    var b = map(raw);
    RequestValues.fields(b, "budget", "preference", "spotIds", "favorites", "quiet");
    return obj("budget", RequestValues.integer(b, "budget", 20, 6, 180),
        "preference", RequestValues.text(b, "preference", "", 300, false),
        "spotIds", RequestValues.texts(b, "spotIds", 6, 100),
        "favorites", RequestValues.flag(b, "favorites", false),
        "quiet", RequestValues.flag(b, "quiet", false));
  }

  private static int chineseNumber(String text) {
    try { return Integer.parseInt(text); } catch (NumberFormatException ignored) {}
    if (text.matches("(?i)[a-z -]+")) {
      var words=Map.ofEntries(Map.entry("one",1),Map.entry("two",2),Map.entry("three",3),Map.entry("four",4),Map.entry("five",5),Map.entry("six",6),Map.entry("seven",7),Map.entry("eight",8),Map.entry("nine",9),Map.entry("ten",10),Map.entry("eleven",11),Map.entry("twelve",12),Map.entry("thirteen",13),Map.entry("fourteen",14),Map.entry("fifteen",15),Map.entry("sixteen",16),Map.entry("seventeen",17),Map.entry("eighteen",18),Map.entry("nineteen",19),Map.entry("twenty",20),Map.entry("thirty",30),Map.entry("forty",40),Map.entry("fifty",50),Map.entry("sixty",60),Map.entry("seventy",70),Map.entry("eighty",80),Map.entry("ninety",90));
      int value=0;for(String word:text.toLowerCase(Locale.ROOT).split("[ -]+"))value=word.equals("hundred")?Math.max(1,value)*100:value+words.getOrDefault(word,0);return value;
    }
    String digits = "零一二三四五六七八九";
    int sum = 0, digit = 0;
    for (char c : text.replace('两', '二').toCharArray()) {
      if (c == '十' || c == '百') { sum += Math.max(1, digit) * (c == '十' ? 10 : 100); digit = 0; }
      else digit = Math.max(0, digits.indexOf(c));
    }
    return sum + digit;
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
    var minutes = MINUTES.matcher(question);
    boolean hasMinutes = minutes.find();
    boolean planning = has(question, "安排.*拍|拍摄计划|规划.*拍|拍.*路线|想拍|带我.*拍|拍点|plan.*photo|shoot.*plan|want.*(?:shoot|photograph|capture)|photo.*(?:walk|route)|photography.*plan|plan.*(?:shoot|walk)|take.*photos?") || hasMinutes && has(question,"拍|photo|shoot|capture");
    if (!planning && !(retained && (edit || hasMinutes))) return null;
    cn.campus.settings.InteractionFeatures.require(store, "plans");
    int budget = hasMinutes ? Math.max(6, Math.min(180, chineseNumber(minutes.group(1)))) : retained ? (int) integer(previous.get("budget")) : 20;
    String preference = retained ? str(previous.get("preference")) : question;
    if (planning && !has(question, "继续|安排一次拍摄")) preference = question;
    boolean favorites = retained && yes(previous.get("favorites")) || has(question, "收藏|favorites");
    if (has(question, "不限收藏|不只.*收藏|全校|anywhere")) favorites = false;
    boolean quiet = retained && yes(previous.get("quiet")) || has(question, "安静|清静|人少|quiet");
    var notices = new ArrayList<String>();
    if (hasMinutes && chineseNumber(minutes.group(1)) < 6) notices.add("至少留6分钟，才能包含一站拍摄与余量；已按6分钟预览。");
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
    if (favorites && candidates.isEmpty()) return result(previous, null,
        "你的收藏中暂时没有可安排的已发布、未关闭机位。先收藏一个有真实机位的地点，或说“不限收藏，想拍建筑”。原计划已保留。", List.of());
    var allowed = candidates.stream().map(s -> str(s.get("id"))).collect(java.util.stream.Collectors.toSet());
    boolean removedUnavailable = ids.removeIf(id -> !allowed.contains(id));
    if (removedUnavailable) notices.add("已移除当前未发布、关闭或不在所选收藏范围内的机位。");
    var station = STATION.matcher(question);
    int target = Math.min(1, Math.max(0, ids.size() - 1));
    if(station.find()) target=station.group(1)!=null?chineseNumber(station.group(1))-1:List.of("first","second","third","fourth","fifth","sixth").contains(station.group(2).toLowerCase(Locale.ROOT))?List.of("first","second","third","fourth","fifth","sixth").indexOf(station.group(2).toLowerCase(Locale.ROOT)):Integer.parseInt(station.group(2).substring(0,1))-1;
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
        var before = at > 0 ? ShootingSpotService.published(store, ids.get(at - 1)) : null;
        var after = at + 1 < ids.size() ? ShootingSpotService.published(store, ids.get(at + 1)) : null;
        var original = ShootingSpotService.published(store, ids.get(at));
        boolean nearer = has(question, "太远|近|too far|closer");
        double oldDistance = distance(before, original, after);
        var choice = candidates.stream().filter(s -> !ids.contains(str(s.get("id"))))
            .filter(s -> !nearer || distance(before, s, after) < oldDistance)
            .min(Comparator.<Map<String,Object>>comparingDouble(s ->
                distance(before, s, after) - (nearer ? 0 : relevance(store, s, pref, quietPreferred) * 15.0)));
        if (choice.isPresent()) { ids.set(at, str(choice.get().get("id"))); notices.add("已替换第" + (at + 1) + "站，其余站点顺序保留。" + (nearer ? "替代站与相邻站的直线距离更短，实际道路仍需导航核对。" : "优先参考公开机位描述与你的偏好。")); }
        else notices.add("暂未找到满足这次替换要求的其他公开机位，保留原站；可以删掉这一站或放宽偏好。");
      }
    }
    if (refresh || ids.isEmpty() && !removal) {
      ids.clear();
      for (var s : candidates) { ids.add(str(s.get("id"))); if (ids.size() >= 6) break; }
    }
    Map<String,Object> preview;
    if (ids.isEmpty()) preview = obj("plan", obj("title", "我的" + budget + "分钟拍摄计划", "items", List.of(), "departure", "", "checklist", obj()), "canSave", false,
        "schedule", obj("estimatedMinutes", 0, "warnings", List.of()), "places", List.of());
    else preview = CampusGuideService.preview(store, obj("question", preference, "budget", budget, "spotIds", ids));
    var actual = rows(map(preview.get("plan")).get("items"));
    if (actual.size() < ids.size()) notices.add("为留足拍摄和步行余量，已缩减到时长内能安排的站点。");
    if (quiet) notices.add("已优先匹配提到安静、人少的公开描述；实时人流未核实，不能保证现场安静。");
    notices.add("开放状态依据已发布资料，具体开放时间未填的站点须出发前确认；这里不把建议当作已核验道路。");
    var next = obj("budget", budget, "preference", preference, "spotIds", actual.stream().map(s -> s.get("spotId")).toList(), "favorites", favorites, "quiet", quiet);
    preview.put("basis", (favorites ? "范围：仅你的收藏。" : "范围：当前已发布且未关闭的真实机位。") + "偏好用于排序，步行按直线距离估算，包含20%余量。");
    preview.put("notice", String.join(" ", notices));
    String answer = (actual.isEmpty() ? "当前没有能放入这份计划的机位。" : "这份" + budget + "分钟计划现在有" + actual.size() + "站，预计约" + map(preview.get("schedule")).get("estimatedMinutes") + "分钟。")
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
