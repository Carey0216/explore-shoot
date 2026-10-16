package cn.campus.ai.knowledge;

import static cn.campus.common.Json.*;

import cn.campus.ai.knowledge.dto.*;
import cn.campus.auth.Security;
import cn.campus.common.*;
import cn.campus.point.*;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.util.*;
import org.springframework.stereotype.Service;

/** Only published, explicitly public facts enter the retrieval corpus. */
@Service
public final class KnowledgeService {
  public record Document(
      String id,
      String title,
      String text,
      List<String> tags,
      List<String> pointIds,
      String path,
      String sourceUrl) {}

  public record PublicPlace(
      String id,
      String name,
      String theme,
      String cover,
      boolean open,
      Set<String> conditions,
      List<Set<String>> conditionSets) {}

  public record Snapshot(long revision, List<Document> documents, List<PublicPlace> places) {}

  private final StoreRepository store;
  private Snapshot cached;

  public KnowledgeService(StoreRepository store) {
    this.store = store;
  }

  public boolean handleAdmin(ApiContext c) throws Exception {
    if (!c.audience.equals("admin") || !c.path.startsWith("/api/admin/knowledge")) return false;
    c.need();
    if (c.route("/api/admin/knowledge", "GET")) {
      c.send(obj("items", store.rows("knowledgeDocuments")));
      return true;
    }
    boolean create = c.route("/api/admin/knowledge", "POST");
    if (!create
        && !(c.method.equals("PUT") && c.path.matches("/api/admin/knowledge/[a-f0-9-]{36}")))
      return false;
    var input = KnowledgeSaveRequest.from(c.body);
    var article =
        create
            ? obj("id", Security.id(), "revision", 0L, "createdAt", StoreRepository.now())
            : find(
                store.rows("knowledgeDocuments"),
                "id",
                c.path.substring(c.path.lastIndexOf('/') + 1));
    if (article == null) throw new ApiException("知识资料不存在", 404);
    if (integer(article.get("revision")) != input.revision())
      throw new ApiException("资料已被其他管理员修改，请重新载入", 409);
    for (String id : input.content().pointIds())
      if (find(store.rows("points"), "id", id) == null) throw new ApiException("关联地点不存在");
    if (create && store.rows("knowledgeDocuments").size() >= 1000)
      throw new ApiException("知识资料已达上限，请维护现有资料");
    article.put("draft", input.content().toMap());
    article.put("revision", input.revision() + 1);
    article.put("updatedAt", StoreRepository.now());
    switch (input.action()) {
      case PUBLISH -> {
        article.put("published", input.content().toMap());
        article.put("publishedAt", StoreRepository.now());
      }
      case UNPUBLISH -> {
        article.remove("published");
        article.remove("publishedAt");
      }
      default -> {}
    }
    if (create) store.rows("knowledgeDocuments").add(article);
    c.audit("维护校园知识", article.get("id"), input.action().name());
    store.bump();
    store.save();
    c.send(obj("id", article.get("id"), "revision", article.get("revision")));
    return true;
  }

  public synchronized Snapshot snapshot() {
    if (cached != null && cached.revision() == store.writes) return cached;
    var docs = new ArrayList<Document>();
    var places = new ArrayList<PublicPlace>();
    var ids = new HashSet<String>();
    for (var point : store.rows("points")) {
      if (!yes(point.get("published"))) continue;
      String id = str(point.get("id")), name = str(point.get("name"));
      ids.add(id);
      var text = new StringBuilder(name);
      for (String field : List.of("description", "fact", "allowed", "condition"))
        append(text, str(point.get(field)));
      append(text, yes(point.get("open")) ? "地点允许打卡，现场开放情况以实际为准。" : "地点暂时关闭，不可新增打卡。");
      var conditions = new HashSet<String>();
      var conditionSets = new ArrayList<Set<String>>();
      for (var spot : store.rows("shootingSpots"))
        if (eq(spot.get("pointId"), id)
            && ShootingSpotService.published(store, spot.get("id")) != null) {
          for (String field :
              List.of(
                  "title",
                  "standDescription",
                  "bestTime",
                  "openingHours",
                  "accessNotice",
                  "availability")) append(text, str(spot.get(field)));
          if (!eq(spot.get("availability"), "closed")) {
            var one = new HashSet<String>();
            for (Object condition : list(spot.get("conditions"))) one.add(str(condition));
            conditions.addAll(one);
            conditionSets.add(Set.copyOf(one));
          }
        }
      for (var template : store.rows("templates"))
        if (eq(template.get("pointId"), id) && yes(template.get("approved"))) {
          append(text, str(template.get("title")));
          for (Object step : list(template.get("steps"))) append(text, str(step));
        }
      String cover = str(point.get("cover"));
      places.add(
          new PublicPlace(
              id,
              name,
              str(point.get("theme")),
              cover,
              yes(point.get("open")),
              Set.copyOf(conditions),
              List.copyOf(conditionSets)));
      docs.add(
          new Document(
              "point:" + id,
              name,
              text.toString()
                  .lines()
                  .map(String::trim)
                  .filter(line -> !line.isBlank() && !line.equals(name))
                  .distinct()
                  .collect(java.util.stream.Collectors.joining("\n")),
              List.of(str(point.get("theme"))),
              List.of(id),
              "#place/" + id,
              ""));
    }
    for (var row : store.rows("knowledgeDocuments")) {
      var published = map(row.get("published"));
      if (published.isEmpty()) continue;
      var related =
          list(published.get("pointIds")).stream().map(Json::str).filter(ids::contains).toList();
      if (!list(published.get("pointIds")).isEmpty() && related.isEmpty()) continue;
      docs.add(
          new Document(
              "knowledge:" + row.get("id"),
              str(published.get("title")),
              str(published.get("body")),
              list(published.get("tags")).stream().map(Json::str).toList(),
              related,
              related.isEmpty() ? "" : ("#place/" + related.getFirst()),
              str(published.get("sourceUrl"))));
    }
    cached = new Snapshot(store.writes, List.copyOf(docs), List.copyOf(places));
    return cached;
  }

  private static void append(StringBuilder text, String value) {
    if (!value.isBlank() && text.length() < 10000)
      text.append('\n').append(value, 0, Math.min(value.length(), 10000 - text.length()));
  }
}
