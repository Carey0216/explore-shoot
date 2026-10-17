package cn.campus.ai.knowledge.dto;

import cn.campus.common.RequestValues;
import java.util.Map;

public record AssistantQuestion(String question, boolean generate) {
  public static AssistantQuestion from(Map<String, Object> body) {
    RequestValues.fields(body, "question", "generate", "purpose");
    return new AssistantQuestion(
        RequestValues.text(body, "question", "", 300, true),
        RequestValues.flag(body, "generate", false));
  }
}
