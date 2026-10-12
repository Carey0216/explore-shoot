package cn.campus.exploration.dto;

import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import java.util.*;

/** 页面探索选项的类型和范围，保持旧接口的偏好字段兼容。 */
public record ExplorationPreferencesRequest(
    long budget, long people, String intensity, String theme, String mode) {
  public static ExplorationPreferencesRequest from(Object raw) {
    var p = map(raw);
    if (!whole(p.get("budget"))
        || !whole(p.get("people"))
        || !List.of(15L, 20L, 30L).contains(integer(p.get("budget")))
        || !List.of(1L, 2L).contains(integer(p.get("people")))
        || !List.of("轻松", "适中").contains(p.get("intensity"))
        || !List.of("全部", "建筑", "自然", "人文", "运动").contains(p.get("theme"))
        || !List.of("guide", "fixed", "personal").contains(p.get("mode")))
      throw new ApiException("探索偏好无效");
    return new ExplorationPreferencesRequest(
        integer(p.get("budget")),
        integer(p.get("people")),
        str(p.get("intensity")),
        str(p.get("theme")),
        str(p.get("mode")));
  }

  public Map<String, Object> asMap() {
    return obj(
        "budget", budget, "people", people, "intensity", intensity, "theme", theme, "mode", mode);
  }
}
