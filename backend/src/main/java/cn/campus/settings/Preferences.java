package cn.campus.settings;

import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import java.util.*;

public final class Preferences {
  private static final Map<String, Object> DEFAULT =
      obj(
          "campusTime",
          "auto",
          "appearance",
          "system",
          "textSize",
          "standard",
          "motion",
          "system",
          "mapFollow",
          true,
          "voiceId",
          "he",
          "assistantAvatar",
          "orbit");
  private static final Map<String, List<String>> CHOICES =
      Map.of(
          "campusTime", List.of("auto", "day", "evening"),
          "appearance",
          List.of("system", "light", "dark"),
          "textSize",
          List.of("standard", "large"),
          "motion",
          List.of("system", "reduce"),
          "assistantAvatar",
          List.of("orbit", "cube", "sprout", "fox", "cloud"),
          "voiceId",
          List.of("he", "qing", "lu", "zhou", "chuan", "yu"));

  private static boolean valid(String k, Object v) {
    return k.equals("mapFollow")
        ? v instanceof Boolean
        : CHOICES.containsKey(k) && CHOICES.get(k).contains(v);
  }

  public static Map<String, Object> normalize(Object input) {
    Map<String, Object> out = copy(DEFAULT);
    map(input)
        .forEach(
            (k, v) -> {
              if (valid(k, v)) out.put(k, v);
            });
    return out;
  }

  public static Map<String, Object> validate(Map<String, Object> input) {
    if (input.isEmpty() || input.keySet().stream().anyMatch(k -> !DEFAULT.containsKey(k)))
      throw new ApiException("设置字段无效");
    if (input.entrySet().stream().anyMatch(e -> !valid(e.getKey(), e.getValue())))
      throw new ApiException("设置选项无效");
    return copy(input);
  }
}
