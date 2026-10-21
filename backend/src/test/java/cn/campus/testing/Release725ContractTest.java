package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.settings.Celebrations;
import cn.campus.storage.StoreRepository;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Release725ContractTest {
  @TempDir Path temp;

  @Test void ownerRulesEnforceAudienceScheduleProofAndPersistentReceipts() throws Exception {
    try (var app = new ApiFixture(temp)) {
      var admin = app.admin(); admin.login("admin");
      admin.request("/api/admin/celebrations", "GET", null, 403);
      app.promoteFixtureOwner(); admin.login("admin");
      var user = app.user(); user.register("celebration_user", "");
      user.request("/api/admin/celebrations", "GET", null, 404);
      assertTrue(list(user.send("/api/celebrations/claim", "POST", obj("event", "scout-passed", "page", "publish"), 200).get("items")).isEmpty());
      var r = copy(Celebrations.defaults().getFirst());
      r.put("id", "fixture-campaign"); r.put("event", "page-enter");
      r.put("audience", "specific"); r.put("usernames", List.of("celebration_user"));
      r.put("pages", List.of("me"));
      admin.send("/api/admin/celebrations", "PUT", obj("revision", 0, "rules", List.of(r)), 200);
      admin.send("/api/admin/celebrations", "PUT", obj("revision", 0, "rules", List.of(r)), 409);
      var other = app.user(); other.register("campaign_other", "");
      assertTrue(list(other.send("/api/celebrations/claim", "POST", obj("event", "page-enter", "page", "me"), 200).get("items")).isEmpty());
      assertTrue(list(user.send("/api/celebrations/claim", "POST", obj("event", "page-enter", "page", "discover"), 200).get("items")).isEmpty());
      var claim = user.send("/api/celebrations/claim", "POST", obj("event", "page-enter", "page", "me"), 200);
      assertEquals(1, list(claim.get("items")).size());
      assertFalse(write(claim).contains("celebration_user"));
      assertFalse(write(user.get("/api/auth/me")).contains("celebrationSeen"));
      assertFalse(write(admin.get("/api/admin/overview")).contains("celebrationSeen"));
      app.restart(); user.login("celebration_user"); admin.login("admin");
      assertTrue(list(user.send("/api/celebrations/claim", "POST", obj("event", "page-enter", "page", "me"), 200).get("items")).isEmpty());
      r.put("endsAt", "2020-01-01T00:00:00Z");
      admin.send("/api/admin/celebrations", "PUT", obj("revision", 1, "rules", List.of(r)), 200);
      assertTrue(list(user.send("/api/celebrations/claim", "POST", obj("event", "page-enter", "page", "me"), 200).get("items")).isEmpty());
      r.put("endsAt", ""); r.put("event", "checkin-saved"); r.put("pages", List.of());
      admin.send("/api/admin/celebrations", "PUT", obj("revision", 2, "rules", List.of(r)), 200);
      assertTrue(list(user.send("/api/celebrations/claim", "POST", obj("event", "checkin-saved", "page", "checkin"), 200).get("items")).isEmpty());
      user.send("/api/checkins", "POST", obj("pointId", "nmu1", "note", "fixture only", "submissionId", UUID.randomUUID().toString()), 201);
      assertEquals(1, list(user.send("/api/celebrations/claim", "POST", obj("event", "checkin-saved", "page", "checkin"), 200).get("items")).size());
      r.put("event", "scout-passed");
      admin.send("/api/admin/celebrations", "PUT", obj("revision", 3, "rules", List.of(r)), 200);
      var bank = new HashMap<String,Object>();
      for (var q : rows(admin.get("/api/admin/scout-quiz").get("questions"))) bank.put(str(q.get("id")), q.get("answer"));
      var paper = user.send("/api/scout/quiz/start", "POST", obj(), 200);
      var answers = obj();
      for (var q : rows(paper.get("questions"))) answers.put(str(q.get("id")), bank.get(str(q.get("id"))));
      user.send("/api/scout/quiz/submit", "POST", obj("id", paper.get("id"), "answers", answers), 200);
      assertEquals(1, list(user.send("/api/celebrations/claim", "POST", obj("event", "scout-passed", "page", "publish"), 200).get("items")).size());
      assertTrue(list(user.send("/api/celebrations/claim", "POST", obj("event", "scout-passed", "page", "publish"), 200).get("items")).isEmpty());
      r.put("density", 10000);
      admin.send("/api/admin/celebrations", "PUT", obj("revision", 4, "rules", List.of(r)), 400);
    }
  }

  @Test void identityChangesResetFiveAttemptsInvalidatePapersAndMigrateOldLockOnce() throws Exception {
    try (var app = new ApiFixture(temp)) {
      var admin = app.admin(); admin.login("admin");
      var user = app.user(); var a = user.register("retry_candidate", "");
      var old = user.send("/api/scout/quiz/start", "POST", obj(), 200);
      admin.send("/api/admin/users/" + a.get("id"), "PATCH", obj("scoutStatus", "approved"), 200);
      admin.send("/api/admin/users/" + a.get("id"), "PATCH", obj("scoutStatus", "none"), 200);
      user.request("/api/scout/quiz", "GET", null, 401);
      user.login("retry_candidate");
      assertEquals(5, integer(user.get("/api/scout/quiz").get("remaining")));
      user.send("/api/scout/quiz/submit", "POST", obj("id", old.get("id"), "answers", obj()), 409);
      for (int i=0; i<5; i++) user.send("/api/scout/quiz/start", "POST", obj(), 200);
      user.send("/api/scout/quiz/start", "POST", obj(), 409);
      admin.send("/api/admin/users/" + a.get("id"), "PATCH", obj("scoutStatus", "none"), 200);
      user.login("retry_candidate");
      assertEquals(0, integer(user.get("/api/scout/quiz").get("remaining")), "Saving unchanged identity does not grant retries");
      app.close();
      try (var store = new StoreRepository(app.root, temp.resolve("data"), "test")) {
        store.db.remove("quizRetries725"); store.save();
      }
      app.start(); user.login("retry_candidate");
      assertEquals(5, integer(user.get("/api/scout/quiz").get("remaining")));
      for (int i=0; i<5; i++) user.send("/api/scout/quiz/start", "POST", obj(), 200);
      app.restart(); user.login("retry_candidate");
      assertEquals(0, integer(user.get("/api/scout/quiz").get("remaining")), "Migration cannot repeat on restart");
      try (var files=Files.list(temp.resolve("data/maintenance-backups"))) {
        assertTrue(files.anyMatch(p->p.getFileName().toString().startsWith("before-v725-quiz-")));
      }
      admin.login("admin");
      admin.send("/api/admin/users/" + a.get("id"), "PATCH", obj("scoutStatus", "approved"), 200);
      admin.send("/api/admin/users/" + a.get("id"), "PATCH", obj("scoutStatus", "none", "enabled", false), 200);
      user.request("/api/auth/login", "POST", obj("username", "retry_candidate", "password", ApiFixture.PASSWORD), 403);
    }
  }
}
