package cn.campus.ai.knowledge.dto;

import java.util.List;

public record AssistantAnswer(
    String mode, String answer, List<Citation> sources, List<Place> places, List<String> notices) {
  public record Citation(String id, String title, String excerpt, String path, String sourceUrl) {}

  public record Place(
      String id, String name, String theme, String cover, boolean open, List<String> conditions) {}
}
