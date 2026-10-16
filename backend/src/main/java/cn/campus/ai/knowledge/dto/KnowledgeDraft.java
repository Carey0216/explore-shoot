package cn.campus.ai.knowledge.dto;

import static cn.campus.common.Json.*;

import cn.campus.common.*;
import java.net.URI;
import java.util.*;

public record KnowledgeDraft(
    String title, String body, List<String> tags, List<String> pointIds, String sourceUrl) {
  public static KnowledgeDraft from(Map<String, Object> input) {
    RequestValues.fields(input, "title", "body", "tags", "pointIds", "sourceUrl");
    String source = RequestValues.text(input, "sourceUrl", "", 500, false);
    if (!source.isEmpty())
      try {
        URI u = URI.create(source);
        if (!"https".equals(u.getScheme()) || u.getHost() == null || u.getUserInfo() != null)
          throw new IllegalArgumentException();
      } catch (Exception e) {
        throw new ApiException("资料来源须为有效HTTPS链接");
      }
    return new KnowledgeDraft(
        RequestValues.text(input, "title", "", 80, true),
        RequestValues.text(input, "body", "", 6000, true),
        RequestValues.texts(input, "tags", 8, 20),
        RequestValues.texts(input, "pointIds", 20, 100),
        source);
  }

  public Map<String, Object> toMap() {
    return obj(
        "title", title, "body", body, "tags", tags, "pointIds", pointIds, "sourceUrl", sourceUrl);
  }
}
