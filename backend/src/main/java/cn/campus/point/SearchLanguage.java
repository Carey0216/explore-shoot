package cn.campus.point;

import static cn.campus.common.Json.*;
import java.util.*;

/** Small, deterministic intent hints. Preferences rank results; availability remains mandatory. */
public final class SearchLanguage {
  private static final Map<String, String> HINTS = Map.ofEntries(
      Map.entry("图书管", "图书馆"), Map.entry("图书官", "图书馆"), Map.entry("library", "图书馆"),
      Map.entry("德择", "德泽"), Map.entry("明胡", "明湖"), Map.entry("湖边", "湖"),
      Map.entry("水面", "湖"), Map.entry("花", "自然"), Map.entry("树", "自然"),
      Map.entry("秋叶", "自然"), Map.entry("草坪", "自然"), Map.entry("雪景", "自然"),
      Map.entry("拍楼", "建筑"), Map.entry("建筑", "建筑"), Map.entry("图书馆", "图书馆"), Map.entry("楼宇", "建筑"), Map.entry("architecture", "建筑"),
      Map.entry("操场", "运动"), Map.entry("体育场", "运动"), Map.entry("sports", "运动"),
      Map.entry("portrait", "人像"), Map.entry("lake", "湖"), Map.entry("flowers", "自然"), Map.entry("夜景", "夜景"), Map.entry("晚上", "夜景"),
      Map.entry("日落", "日落"), Map.entry("夕阳", "日落"), Map.entry("sunset", "日落"));

  public static Set<String> terms(String input) {
    String q = PointSearchService.normalize(input == null ? "" : input).trim();
    var terms = new LinkedHashSet<String>();
    if (q.isEmpty()) return terms;
    terms.add(q.replaceAll("\\s+", ""));
    String stripped = q.replaceAll("我想|想要|想找|帮我|推荐|有没有|有什么|适合|可以|一个|一些|附近|的地方|在哪里|在哪儿|哪里|拍一下|拍一拍|拍摄|照片|风景|请问|寻找|看看|找个|找一下|今天|周末|分钟|小时", " ");
    for (String part : stripped.split("[^\\p{IsHan}a-z0-9]+"))
      if (part.length() >= 2 && !part.matches("\\d+")) terms.add(part);
    HINTS.forEach((key, value) -> { if (q.contains(key)) terms.add(value); });
    return terms;
  }

  public static int score(Map<String, Object> value, String input) {
    var terms = terms(input);
    if (terms.isEmpty()) return 0;
    String name = PointSearchService.normalize(str(value.get("name")) + " " + str(value.get("title"))),
        aliases = PointSearchService.normalize(String.join(" ", list(value.get("aliases")).stream().map(Object::toString).toList())),
        context = PointSearchService.normalize(str(value.get("description")) + " " + str(value.get("theme")) + " " + str(value.get("condition")) + " " + str(value.get("compositionTip")));
    int score = 0;
    for (String term : terms) {
      if (name.contains(term)) score += 8;
      else if (aliases.contains(term)) score += 6;
      else if (context.contains(term)) score += 2;
      else if (term.matches("[a-z][a-z0-9]{1,79}") &&
          (PointSearchService.pinyin(name, false).contains(term) || PointSearchService.pinyin(name, true).contains(term))) score += 6;
    }
    return score;
  }
}
