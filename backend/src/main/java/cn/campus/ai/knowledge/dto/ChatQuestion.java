package cn.campus.ai.knowledge.dto;

import static cn.campus.common.Json.*;

import cn.campus.common.*;
import java.util.*;

public record ChatQuestion(String question, List<Turn> history, boolean further) {
  public record Turn(String role, String content) {}

  public static ChatQuestion from(Map<String, Object> body) {
    RequestValues.fields(body, "question", "history", "purpose", "generate", "further");
    if (!"support".equals(str(body.get("purpose")))) throw new ApiException("对话用途无效");
    String question = RequestValues.text(body, "question", "", 300, true);
    if (body.containsKey("history") && !(body.get("history") instanceof List<?>))
      throw new ApiException("对话格式无效");
    var history = new ArrayList<Turn>();
    var turns = list(body.get("history"));
    if (turns.size() > 8) throw new ApiException("最多携带8条对话");
    for (var value : turns) {
      if (!(value instanceof Map<?, ?>)) throw new ApiException("对话格式无效");
      var turn = map(value);
      RequestValues.fields(turn, "role", "content");
      String role = str(turn.get("role"));
      if (!Set.of("user", "assistant").contains(role)) throw new ApiException("对话角色无效");
      history.add(new Turn(role, RequestValues.text(turn, "content", "", 2000, true)));
    }
    RequestValues.flag(body, "generate", true);
    return new ChatQuestion(
        question, List.copyOf(history), RequestValues.flag(body, "further", false));
  }
}
