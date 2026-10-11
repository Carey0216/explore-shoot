package cn.campus.dto;

import cn.campus.ApiException;
import cn.campus.Json;
import java.util.Map;
import java.util.Set;

public record PointSearchRequest(
    String query, String filter, String theme, int page, int pageSize) {
  public static PointSearchRequest from(Map<String, Object> body) {
    if (!Set.of("query", "filter", "theme", "page", "pageSize").containsAll(body.keySet()))
      throw new ApiException("检索参数无效");
    String query = string(body, "query", "", 100);
    String filter = string(body, "filter", "all", 20);
    String theme = string(body, "theme", "全部", 30);
    if (!Set.of("all", "popular", "saved", "visited", "unvisited", "nearby").contains(filter))
      throw new ApiException("检索筛选无效");
    return new PointSearchRequest(
        query, filter, theme, number(body, "page", 1, 100000), number(body, "pageSize", 50, 100));
  }

  private static String string(Map<String, Object> body, String key, String fallback, int max) {
    if (!body.containsKey(key)) return fallback;
    if (!(body.get(key) instanceof String text) || text.length() > max)
      throw new ApiException("检索参数无效");
    return text.trim();
  }

  private static int number(Map<String, Object> body, String key, int fallback, int max) {
    if (!body.containsKey(key)) return fallback;
    if (!Json.whole(body.get(key))) throw new ApiException("检索分页无效");
    long value = Json.integer(body.get(key));
    if (value < 1 || value > max) throw new ApiException("检索分页无效");
    return (int) value;
  }
}
