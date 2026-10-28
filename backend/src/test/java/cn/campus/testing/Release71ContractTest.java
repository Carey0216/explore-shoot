package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.point.PointService;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Release71ContractTest {
  @TempDir Path temp;

  @Test
  void quizPapersArePrivateBoundedSingleUseAndRemainBoundedAcrossRestart() throws Exception {
    try (var app = new ApiFixture(temp)) {
      var admin = app.admin();
      admin.login("admin");
      var bank = admin.get("/api/admin/scout-quiz");
      assertEquals(30, rows(bank.get("questions")).size());
      var user = app.user();
      var account = user.register("quiz_candidate", "");
      Map<String, Object> answersById = new HashMap<>();
      for (var q : rows(bank.get("questions"))) answersById.put(str(q.get("id")), q.get("answer"));
      var paper = user.send("/api/scout/quiz/start", "POST", obj(), 200);
      assertEquals(5, rows(paper.get("questions")).size());
      assertFalse(write(paper).contains("\"answer\""));
      assertFalse(write(user.get("/api/auth/me")).contains("quizPaper"));
      var stranger = app.user();
      stranger.register("quiz_stranger", "");
      var answers = obj();
      for (var q : rows(paper.get("questions")))
        answers.put(str(q.get("id")), answersById.get(str(q.get("id"))));
      stranger.request(
          "/api/scout/quiz/submit", "POST", obj("id", paper.get("id"), "answers", answers), 409);
      var passed =
          user.send(
              "/api/scout/quiz/submit",
              "POST",
              obj("id", paper.get("id"), "answers", answers),
              200);
      assertTrue(yes(passed.get("passed")));
      assertEquals("approved", map(user.get("/api/auth/me").get("account")).get("scoutStatus"));
      assertTrue(integer(user.get("/api/notifications/summary").get("unread")) > 0);
      user.request(
          "/api/scout/quiz/submit", "POST", obj("id", paper.get("id"), "answers", answers), 409);
      admin.send("/api/admin/users/" + account.get("id"), "PATCH", obj("scoutStatus", "none"), 200);
      user.login("quiz_candidate");
      assertEquals(5, integer(user.get("/api/scout/quiz").get("remaining")));
      user.send("/api/scout/quiz/start", "POST", obj(), 200);
      // Starting and abandoning five papers is not a way to obtain unlimited random questions.
      var limited = app.user();
      limited.register("quiz_limited", "");
      for (int i = 0; i < 5; i++) limited.send("/api/scout/quiz/start", "POST", obj(), 200);
      limited.request("/api/scout/quiz/start", "POST", obj(), 409);
      app.restart();
      limited.login("quiz_limited");
      assertEquals(0, integer(limited.get("/api/scout/quiz").get("remaining")));
      limited.request("/api/scout/quiz/start", "POST", obj(), 409);
      limited.send("/api/scout/apply", "POST", obj("reason", "希望由管理员复核我的探索官申请"), 201);
    }
  }

  @Test
  void achievementsOnlyCelebrateNewPersistedProgressAndIdempotentRetriesDontRepeat()
      throws Exception {
    try (var app = new ApiFixture(temp)) {
      var admin = app.admin();
      admin.login("admin");
      var user = app.user();
      var account = user.register("reward_user", "");
      var point = rows(user.get("/api/catalog").get("points")).getFirst();
      admin.send(
          "/api/admin/passport/themes",
          "POST",
          obj(
              "title",
              "第一站",
              "description",
              "第一次真实打卡记录",
              "kind",
              "visits",
              "symbol",
              "camera",
              "badgePreset",
              "badge-50",
              "pointIds",
              List.of(),
              "target",
              1,
              "published",
              true),
          201);
      String submission = UUID.randomUUID().toString();
      var body =
          obj(
              "pointId",
              point.get("id"),
              "note",
              "图书馆旁，今天的光很好",
              "submissionId",
              submission,
              "accountId",
              account.get("id"));
      var record = user.send("/api/checkins", "POST", body, 201);
      var events = map(record.get("passportEvents"));
      assertEquals(1, rows(events.get("achievements")).size());
      assertEquals("badge-50", rows(events.get("achievements")).getFirst().get("badgePreset"));
      assertEquals(1, rows(events.get("places")).size());
      var again = user.send("/api/checkins", "POST", body, 200);
      // v8.1.3 resumes an already-saved receipt, without granting any progress again.
      assertEquals(record.get("id"), again.get("id"));
      var retryEvents = map(again.get("passportEvents"));
      assertEquals(true, retryEvents.get("recorded"));
      for (String kind : List.of("achievements", "buildings", "places"))
        assertTrue(rows(retryEvents.get(kind)).isEmpty(), kind + " must not be granted twice");
      body.put("submissionId", UUID.randomUUID().toString());
      assertTrue(
          rows(map(user.send("/api/checkins", "POST", body, 201).get("passportEvents"))
                  .get("achievements"))
              .isEmpty());
      assertEquals("张**明", PointService.maskName("张小小明"));
      assertEquals("A*B", PointService.maskName("AB"));
      assertEquals("😀*😀", PointService.maskName("😀人😀"));
    }
  }

  @Test
  void ownerControlsAreEnforcedAndSavedFlagsAreActuallyReturned() throws Exception {
    try (var app = new ApiFixture(temp)) {
      app.promoteFixtureOwner();
      var owner = app.admin();
      owner.login("admin");
      owner.send(
          "/api/admin/admins",
          "POST",
          obj(
              "username",
              "super_viewer",
              "name",
              "普通超管",
              "role",
              "super",
              "password",
              ApiFixture.PASSWORD),
          201);
      var other = app.admin();
      other.login("super_viewer");
      other.request(
          "/api/admin/map-config/unlock",
          "POST",
          obj("username", "admin", "password", ApiFixture.PASSWORD),
          403);
      assertFalse(
          write(map(other.get("/api/auth/me").get("account")).get("effectivePermissions"))
              .contains("map-config"));
      var flags = owner.get("/api/admin/features");
      var saved = map(flags.get("features"));
      map(saved.get("campus-3d")).put("visible", false);
      map(saved.get("panorama")).put("enabled", false);
      owner.send(
          "/api/admin/features",
          "PUT",
          obj("revision", flags.get("revision"), "features", saved),
          200);
      assertFalse(
          yes(
              map(map(app.user().get("/api/features").get("features")).get("campus-3d"))
                  .get("visible")));
      owner.send(
          "/api/admin/features",
          "PUT",
          obj("revision", flags.get("revision"), "features", saved),
          409);
      var user = app.user();
      var a = user.register("profile_edit", "");
      owner.request("/api/admin/users/" + a.get("id"), "PATCH", obj("nickname", "新昵称"), 400);
      owner.send(
          "/api/admin/users/" + a.get("id"),
          "PATCH",
          obj("nickname", "新昵称", "confirmed", true, "scoutStatus", "none"),
          200);
      user.login("profile_edit");
      assertEquals("新昵称", map(user.get("/api/auth/me").get("account")).get("nickname"));
      assertEquals(
          5,
          integer(user.get("/api/scout/quiz").get("remaining")),
          "Profile edit must not revoke an ordinary user's quiz opportunities");
      assertFalse(
          yes(
              map(map(other.get("/api/admin/feature-visibility").get("features")).get("campus-3d"))
                  .get("visible")));
      var records = rows(owner.get("/api/admin/records").get("events"));
      var id = records.getFirst().get("id");
      other.request(
          "/api/admin/records",
          "DELETE",
          obj("ids", List.of(id), "kind", "audit", "currentPassword", ApiFixture.PASSWORD),
          403);
      owner.send(
          "/api/admin/records",
          "DELETE",
          obj("ids", List.of(id), "kind", "audit", "currentPassword", ApiFixture.PASSWORD),
          200);
      assertTrue(
          rows(owner.get("/api/admin/records").get("events")).stream()
              .noneMatch(e -> eq(e.get("id"), id)));
      assertNotNull(find(rows(app.data().get("audit")), "id", id));
    }
  }
}
