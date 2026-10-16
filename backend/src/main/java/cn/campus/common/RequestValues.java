package cn.campus.common;

import java.util.*;

/** Shared boundary validation. Business services receive explicit Java records. */
public final class RequestValues {
  private RequestValues() {}

  public static void fields(Map<String, Object> body, String... allowed) {
    if (!Set.of(allowed).containsAll(body.keySet())) throw new ApiException("请求包含不支持的字段");
  }

  public static String text(
      Map<String, Object> body, String key, String fallback, int max, boolean required) {
    Object value = body.getOrDefault(key, fallback);
    if (!(value instanceof String text) || text.length() > max || required && text.isBlank())
      throw new ApiException("请检查字段：" + key);
    return text.trim();
  }

  public static long integer(
      Map<String, Object> body, String key, long fallback, long min, long max) {
    Object value = body.getOrDefault(key, fallback);
    if (!Json.whole(value) || Json.integer(value) < min || Json.integer(value) > max)
      throw new ApiException("数字参数无效：" + key);
    return Json.integer(value);
  }

  public static boolean flag(Map<String, Object> body, String key, boolean fallback) {
    Object value = body.getOrDefault(key, fallback);
    if (!(value instanceof Boolean b)) throw new ApiException("开关参数无效：" + key);
    return b;
  }

  public static List<String> texts(Map<String, Object> body, String key, int count, int max) {
    Object value = body.getOrDefault(key, List.of());
    if (!(value instanceof List<?> items) || items.size() > count)
      throw new ApiException("列表参数无效：" + key);
    var result = new ArrayList<String>();
    for (Object item : items) {
      if (!(item instanceof String s)
          || s.isBlank()
          || s.length() > max
          || result.contains(s.trim())) throw new ApiException("列表参数无效：" + key);
      result.add(s.trim());
    }
    return List.copyOf(result);
  }
}
