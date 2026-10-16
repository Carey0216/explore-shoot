package cn.campus.ai.knowledge;

import java.text.Normalizer;
import java.util.*;
import java.util.regex.*;

/** Explainable local BM25 retrieval. This class does not impersonate a generative model. */
public final class CampusRetriever {
  public record Intent(Set<String> conditions, String theme) {}

  public record Hit(KnowledgeService.Document document, double score) {}

  public static Intent intent(String question) {
    var ids = new HashSet<String>();
    if (question.matches(".*(夜景|夜晚|晚上|晚间).*")) ids.add("night");
    if (question.matches(".*(下雨|雨天|雨景).*")) ids.add("rain");
    if (question.matches(".*(独自|一个人|单人|独自拍).*")) ids.add("solo");
    if (question.matches(".*(人像|拍人|人物).*")) ids.add("portrait");
    if (question.matches(".*(建筑|拍楼|楼宇).*")) ids.add("architecture");
    return new Intent(Set.copyOf(ids), ids.contains("architecture") ? "建筑" : "");
  }

  public static List<String> tokens(String input) {
    String text =
        Normalizer.normalize(input, Normalizer.Form.NFKC)
            .toLowerCase(Locale.ROOT)
            .replace("下雨", "雨天")
            .replace("一个人", "独自")
            .replace("晚上", "夜景");
    var words = new ArrayList<String>();
    var matcher = Pattern.compile("[a-z0-9]+|[\\p{IsHan}]+").matcher(text);
    while (matcher.find()) {
      String word = matcher.group();
      if (word.matches("[a-z0-9]+") || word.length() == 1) words.add(word);
      else for (int i = 0; i < word.length() - 1; i++) words.add(word.substring(i, i + 2));
    }
    words.removeIf(
        Set.of("哪里", "在哪", "怎么", "可以", "什么", "适合", "推荐", "拍摄", "照片", "我想", "帮我", "校园", "地方")
            ::contains);
    return words;
  }

  public static List<Hit> search(KnowledgeService.Snapshot snapshot, String question) {
    var query = new HashSet<>(tokens(question));
    var docs = snapshot.documents();
    var frequencies = new ArrayList<Map<String, Integer>>();
    var df = new HashMap<String, Integer>();
    double length = 0;
    for (var doc : docs) {
      var counts = new HashMap<String, Integer>();
      for (String token :
          tokens(
              doc.title()
                  + " "
                  + doc.title()
                  + " "
                  + String.join(" ", doc.tags())
                  + " "
                  + doc.text())) counts.merge(token, 1, Integer::sum);
      frequencies.add(counts);
      length += counts.values().stream().mapToInt(i -> i).sum();
      counts.keySet().forEach(t -> df.merge(t, 1, Integer::sum));
    }
    double average = Math.max(1, length / Math.max(1, docs.size()));
    var out = new ArrayList<Hit>();
    for (int n = 0; n < docs.size(); n++) {
      var counts = frequencies.get(n);
      double score = 0, documentLength = counts.values().stream().mapToInt(i -> i).sum();
      for (String token : query) {
        int tf = counts.getOrDefault(token, 0);
        if (tf == 0) continue;
        double idf = Math.log(1 + (docs.size() - df.get(token) + 0.5) / (df.get(token) + 0.5));
        score += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * documentLength / average));
      }
      if (score > 0) out.add(new Hit(docs.get(n), score));
    }
    out.sort(
        Comparator.comparingDouble(Hit::score).reversed().thenComparing(h -> h.document().id()));
    return out.stream().limit(6).toList();
  }
}
