package cn.campus.ai.knowledge;

import cn.campus.ai.knowledge.dto.*;
import cn.campus.common.RateLimiter;
import cn.campus.point.PointReactionService;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.stereotype.Service;

@Service
public final class AssistantService {
  private final StoreRepository store;
  private final KnowledgeService knowledge;
  private final CompatibleModelClient model;
  private final RateLimiter limits;
  private final Semaphore generationSlots = new Semaphore(2);

  public AssistantService(
      StoreRepository store,
      KnowledgeService knowledge,
      CompatibleModelClient model,
      RateLimiter limits) {
    this.store = store;
    this.knowledge = knowledge;
    this.model = model;
    this.limits = limits;
  }

  public boolean handle(ApiContext context) throws Exception {
    if (context.audience.equals("admin") && context.route("/api/admin/assistant-status", "GET")) {
      context.need();
      context.send(
          cn.campus.common.Json.obj(
              "generationAvailable",
              model.configured(),
              "retrieval",
              "BM25",
              "storage",
              "H2 / JDBC"));
      return true;
    }
    if (!context.audience.equals("user")) return false;
    if (context.route("/api/assistant/capabilities", "GET")) {
      try (var guard = store.readAccess()) {
        var policy = SupportPolicy.load(store);
        context.send(
            cn.campus.common.Json.obj(
                "generationAvailable",
                model.configured(),
                "furtherEnabled",
                policy.furtherEnabled(),
                "modelLabel",
                policy.modelLabel(),
                "presets",
                policy.presets().stream()
                    .limit(6)
                    .map(p -> cn.campus.common.Json.obj("title", p.title(), "question", p.title()))
                    .toList(),
                "retrievalAvailable",
                cn.campus.settings.InteractionFeatures.enabled(store, "assistant")));
      }
      return true;
    }
    boolean chat = context.route("/api/assistant/chat", "POST");
    if (!context.route("/api/assistant/query", "POST") && !chat) return false;
    try (var guard = store.readAccess()) {
      cn.campus.settings.InteractionFeatures.guard(context);
    }
    String purpose =
        cn.campus.common.RequestValues.text(context.body, "purpose", "search", 20, true);
    if (!Set.of("search", "support").contains(purpose))
      throw new cn.campus.common.ApiException("助手用途无效");
    limits.check(context.ip + ":campus-assistant", 12);
    var conversation = chat ? ChatQuestion.from(context.body) : null;
    var question =
        chat
            ? new AssistantQuestion(conversation.question(), true)
            : AssistantQuestion.from(context.body);
    if (chat) {
      SupportPolicy policy;
      try (var guard = store.readAccess()) {
        policy = SupportPolicy.load(store);
      }
      if (conversation.further() && !policy.furtherEnabled())
        throw new cn.campus.common.ApiException("进一步回答入口已关闭", 403);
      var preset =
          conversation.further()
              ? Optional.<SupportPolicy.Preset>empty()
              : policy.match(question.question());
      if (preset.isPresent()) {
        var p = preset.get();
        context.send(
            new AssistantAnswer(
                "preset",
                p.answer(),
                p.path().isEmpty()
                    ? List.of()
                    : List.of(
                        new AssistantAnswer.Citation(p.id(), p.title(), p.answer(), p.path(), "")),
                List.of(),
                List.of()));
        return true;
      }
    }
    KnowledgeService.Snapshot snapshot;
    Set<String> disliked;
    try (var guard = store.readAccess()) {
      snapshot = knowledge.snapshot();
      disliked = PointReactionService.dislikedIds(store, context.account);
    }
    var hits = CampusRetriever.search(snapshot, question.question());
    var notices = new ArrayList<String>();
    String answer = excerpts(hits), mode = "retrieved";
    if (chat && hits.isEmpty())
      answer = "我可以帮你安排一次拍摄、讨论构图与光线，也能说明收藏、打卡和联系管理员的用法。请告诉我你想拍什么、预计花多久？涉及账号的具体处理，请使用‘联系管理员’留言。";
    if (question.generate() && (!hits.isEmpty() || chat)) {
      if (!model.configured()) notices.add("尚未配置生成模型，当前提供资料与功能帮助。");
      else if (!generationSlots.tryAcquire()) notices.add("模型正在处理其他问题，先为你展示资料检索结果。");
      else
        try {
          answer =
              chat
                  ? model.chat(question.question(), hits, conversation.history())
                  : model.generate(question.question(), hits);
          mode = "generated";
        } catch (Exception e) {
          notices.add("模型暂时不可用，已切换为资料检索结果。");
        } finally {
          generationSlots.release();
        }
    }
    // Never retain a deleted/unpublished source while an external provider was taking time to
    // reply.
    try (var guard = store.readAccess()) {
      var current = knowledge.snapshot();
      if (!current.documents().equals(snapshot.documents())
          || !current.places().equals(snapshot.places())) {
        snapshot = current;
        hits = CampusRetriever.search(snapshot, question.question());
        answer = excerpts(hits);
        mode = "retrieved";
        notices.add("资料刚有更新，已按最新发布内容重新检索。");
      }
    }
    var intent = CampusRetriever.intent(question.question());
    var related = new HashSet<String>();
    hits.forEach(hit -> related.addAll(hit.document().pointIds()));
    var places =
        snapshot.places().stream()
            .filter(p -> related.contains(p.id()) && p.open())
            .filter(p -> intent.theme().isEmpty() || p.theme().equals(intent.theme()))
            .filter(
                p ->
                    intent.conditions().isEmpty()
                        || p.conditionSets().stream()
                            .anyMatch(set -> set.containsAll(intent.conditions())))
            .sorted(Comparator.comparing(p -> disliked.contains(p.id())))
            .limit(5)
            .map(
                p ->
                    new AssistantAnswer.Place(
                        p.id(),
                        p.name(),
                        p.theme(),
                        p.cover(),
                        p.open(),
                        p.conditions().stream().sorted().toList()))
            .toList();
    if (!intent.conditions().isEmpty() && places.isEmpty())
      notices.add("暂未找到同时符合这些条件的已审核机位；不会将普通地点坐标当作确认站位。");
    if (mode.equals("generated")) notices.add("AI依据公开资料整理，具体开放与通行情况请以现场为准。");
    var sources =
        hits.stream()
            .map(
                hit -> {
                  var d = hit.document();
                  return new AssistantAnswer.Citation(
                      d.id(),
                      d.title(),
                      d.text().substring(0, Math.min(400, d.text().length())),
                      d.path(),
                      d.sourceUrl());
                })
            .toList();
    context.send(new AssistantAnswer(mode, answer, sources, places, List.copyOf(notices)));
    return true;
  }

  private static String excerpts(List<CampusRetriever.Hit> hits) {
    if (hits.isEmpty()) return "暂未找到有依据的校园资料。可以试试“图书馆适合怎么拍”，或等待管理员补充并发布相关知识。";
    return String.join(
        "\n\n",
        hits.stream()
            .limit(3)
            .map(
                h ->
                    h.document().title()
                        + "：\n"
                        + h.document()
                            .text()
                            .substring(0, Math.min(500, h.document().text().length())))
            .toList());
  }
}
