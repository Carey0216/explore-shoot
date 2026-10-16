package cn.campus.ai.knowledge.dto;

import cn.campus.common.*;
import java.util.*;

public record KnowledgeSaveRequest(long revision, Action action, KnowledgeDraft content) {
  public enum Action {
    DRAFT,
    PUBLISH,
    UNPUBLISH
  }

  public static KnowledgeSaveRequest from(Map<String, Object> body) {
    RequestValues.fields(body, "revision", "action", "content");
    Action action;
    try {
      action =
          Action.valueOf(RequestValues.text(body, "action", "", 20, true).toUpperCase(Locale.ROOT));
    } catch (IllegalArgumentException e) {
      throw new ApiException("知识资料操作无效");
    }
    return new KnowledgeSaveRequest(
        RequestValues.integer(body, "revision", 0, 0, 1000000),
        action,
        KnowledgeDraft.from(Json.map(body.get("content"))));
  }
}
