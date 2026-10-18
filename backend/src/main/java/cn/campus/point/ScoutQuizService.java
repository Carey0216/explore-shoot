package cn.campus.point;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.common.TimeSource;
import cn.campus.notification.NotificationService;
import cn.campus.web.ApiContext;
import java.util.*;
import org.springframework.stereotype.Service;

/** Answers and attempt budgets live on the server. Abandoned papers also consume an attempt. */
@Service
public final class ScoutQuizService {
  public boolean handle(ApiContext c) throws Exception {
    if (c.audience.equals("admin") && c.path.startsWith("/api/admin/scout-quiz")) {
      c.need();
      if (c.route("/api/admin/scout-quiz", "GET")) {
        c.send(
            obj("questions", bank(c), "revision", integer(c.store.settings().get("quizRevision"))));
        return true;
      }
      if (!c.route("/api/admin/scout-quiz", "PUT")) return false;
      if (!whole(c.body.get("revision"))
          || integer(c.body.get("revision")) != integer(c.store.settings().get("quizRevision")))
        throw new ApiException("题库已修改，请刷新后重试", 409);
      var questions = rows(c.body.get("questions"));
      if (!(c.body.get("questions") instanceof List<?>)
          || questions.size() < 5
          || questions.size() > 200) throw new ApiException("题库需要5—200道题目");
      var ids = new HashSet<String>();
      var clean = new ArrayList<Map<String, Object>>();
      for (var q : questions) {
        String id = str(q.get("id"));
        if (!id.matches("[a-zA-Z0-9-]{1,50}") || !ids.add(id)) throw new ApiException("题目编号无效或重复");
        String title = ShootingSpotService.required(q, "title", 200);
        var options = list(q.get("options"));
        if (options.size() < 2
            || options.size() > 5
            || options.stream()
                .anyMatch(v -> !(v instanceof String) || str(v).isBlank() || str(v).length() > 150))
          throw new ApiException("每题需要2—5个有效选项");
        if (!whole(q.get("answer"))
            || integer(q.get("answer")) < 0
            || integer(q.get("answer")) >= options.size()) throw new ApiException("正确答案无效");
        clean.add(obj("id", id, "title", title, "options", options, "answer", q.get("answer")));
      }
      c.store.settings().put("scoutQuizBank", clean);
      c.store.settings().put("quizRevision", integer(c.body.get("revision")) + 1);
      c.audit("维护探索官题库", "scout-quiz", "题目数 " + clean.size());
      c.store.save();
      c.send(obj("ok", true));
      return true;
    }
    if (!c.audience.equals("user") || !c.path.startsWith("/api/scout/quiz")) return false;
    var user = c.need();
    if (c.route("/api/scout/quiz", "GET")) {
      c.send(
          obj(
              "remaining",
              Math.max(0, 5 - integer(user.get("quizUsed"))),
              "approved",
              eq(user.get("scoutStatus"), "approved")));
      return true;
    }
    if (c.route("/api/scout/quiz/start", "POST")) {
      if (eq(user.get("scoutStatus"), "approved")) throw new ApiException("你已经是校园探索官");
      if (integer(user.get("quizUsed")) >= 5) throw new ApiException("五次答题机会已用完，请向管理员申请", 409);
      var paper = new ArrayList<>(bank(c));
      Collections.shuffle(paper, new java.security.SecureRandom());
      paper = new ArrayList<>(paper.subList(0, 5));
      String token = Security.id();
      user.put("quizUsed", integer(user.get("quizUsed")) + 1);
      user.put(
          "quizPaper", obj("id", token, "expires", TimeSource.now() + 900000, "questions", paper));
      c.store.save();
      c.send(
          obj(
              "id",
              token,
              "remaining",
              5 - integer(user.get("quizUsed")),
              "questions",
              paper.stream()
                  .map(
                      q ->
                          obj(
                              "id",
                              q.get("id"),
                              "title",
                              q.get("title"),
                              "options",
                              q.get("options")))
                  .toList()));
      return true;
    }
    if (c.route("/api/scout/quiz/submit", "POST")) {
      var paper = map(user.get("quizPaper"));
      if (paper.isEmpty()
          || !eq(paper.get("id"), c.body.get("id"))
          || integer(paper.get("expires")) < TimeSource.now())
        throw new ApiException("答卷已失效，请重新开始；退出或过期仍计一次机会", 409);
      var answers = map(c.body.get("answers"));
      var questions = rows(paper.get("questions"));
      if (answers.size() != 5
          || questions.stream()
              .anyMatch(
                  q ->
                      !whole(answers.get(str(q.get("id"))))
                          || integer(answers.get(str(q.get("id")))) < 0
                          || integer(answers.get(str(q.get("id"))))
                              >= list(q.get("options")).size()))
        throw new ApiException("请完成全部5道题目");
      long score =
          questions.stream()
              .filter(q -> integer(answers.get(str(q.get("id")))) == integer(q.get("answer")))
              .count();
      user.remove("quizPaper");
      user.put("quizLastScore", score);
      user.put("quizLastAt", cn.campus.storage.StoreRepository.now());
      if (score >= 3) {
        user.put("scoutStatus", "approved");
        user.put("scoutSource", "quiz");
        c.store.rows("applications").stream()
            .filter(a -> eq(a.get("userId"), user.get("id")) && eq(a.get("status"), "pending"))
            .forEach(
                a -> {
                  a.put("status", "approved");
                  a.put("note", "社区规范答题通过，自动解锁");
                });
        NotificationService.add(
            c.store,
            user.get("id"),
            "quiz:" + c.body.get("id"),
            "scout",
            "你已成为校园探索官",
            "社区规范答题通过！现在可以发布校园发现。请尊重隐私、分享真实内容；管理员会持续复核内容与资格。",
            "#publish");
      }
      c.audit("探索官规范答题", user.get("id"), score >= 3 ? "通过" : "未通过");
      c.store.save();
      c.send(
          obj("passed", score >= 3, "score", score, "remaining", 5 - integer(user.get("quizUsed"))),
          200);
      return true;
    }
    return false;
  }

  private static List<Map<String, Object>> bank(ApiContext c) throws Exception {
    if (c.store.settings().get("scoutQuizBank") instanceof List<?>)
      return rows(c.store.settings().get("scoutQuizBank"));
    try (var stream = ScoutQuizService.class.getResourceAsStream("/scout-quiz.json")) {
      return rows(
          parse(
                  new String(
                      Objects.requireNonNull(stream).readAllBytes(),
                      java.nio.charset.StandardCharsets.UTF_8))
              .get("questions"));
    }
  }
}
