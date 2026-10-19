package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class MigrationContractTest {
  @TempDir Path temporary;

  private Map<String, Object> preferences() {
    return obj("budget", 30, "people", 1, "intensity", "适中", "theme", "全部", "mode", "fixed");
  }

  @Test
  void javaRouteSearchUsesVisibleStopsAndValidatesRequestsWithoutWritingData() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var guest = app.user();
      var all = rows(guest.request("/api/plan", "POST", preferences(), 200));
      assertFalse(all.isEmpty());
      var request = preferences();
      request.put("query", "ＬＩＢＲＡＲＹ");
      var found = rows(guest.request("/api/plan", "POST", request, 200));
      assertFalse(found.isEmpty());
      for (var route : found) {
        assertTrue(
            rows(route.get("stops")).stream().anyMatch(p -> str(p.get("name")).contains("图书馆")));
        assertFalse(write(route).contains("viewCount"));
      }
      String before = Files.readString(temporary.resolve("data/test-store-snapshot.json"));
      request.put("query", "x".repeat(101));
      guest.request("/api/plan", "POST", request, 400);
      request.put("query", List.of("图书馆"));
      guest.request("/api/plan", "POST", request, 400);
      request = preferences();
      request.put("people", 3);
      guest.request("/api/plan", "POST", request, 400);
      assertEquals(before, Files.readString(temporary.resolve("data/test-store-snapshot.json")));
      request = preferences();
      request.put("query", "不会匹配的地点");
      assertEquals(0, rows(guest.request("/api/plan", "POST", request, 200)).size());
      assertEquals(all.size(), rows(guest.request("/api/plan", "POST", preferences(), 200)).size());
    }
  }

  @Test
  void privateLibraryKeepsSessionWarningsAndSavedPointsAfterOfflineChanges() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var root = app.admin();
      root.login("admin");
      var alice = app.user();
      alice.register("library_alice", "");
      var bob = app.user();
      bob.register("library_bob", "");
      var plans = rows(alice.request("/api/plan", "POST", preferences(), 200));
      var plan = plans.stream().filter(r -> yes(r.get("available"))).findFirst().orElseThrow();
      var session =
          alice.send(
              "/api/sessions",
              "POST",
              obj("routeId", plan.get("id"), "preferences", preferences()),
              201);
      Object point = list(plan.get("points")).getFirst();
      alice.send("/api/bookmarks", "POST", obj("pointId", point), 200);
      var library = alice.get("/api/my/library");
      assertEquals(1, integer(map(library.get("overview")).get("explorations")));
      assertEquals(1, rows(library.get("savedPoints")).size());
      assertFalse(write(library.get("savedPoints")).contains("viewCount"));
      assertEquals(0, integer(rows(library.get("sessions")).getFirst().get("completedTasks")));
      root.send("/api/admin/points/" + point, "PATCH", obj("published", false, "open", false), 200);
      library = alice.get("/api/my/library");
      var current = rows(library.get("sessions")).getFirst();
      assertEquals(session.get("id"), current.get("id"));
      assertFalse(list(current.get("blocked")).isEmpty());
      assertEquals(alice.list("/api/sessions").getFirst().get("blocked"), current.get("blocked"));
      assertTrue(rows(library.get("savedPoints")).isEmpty());
      assertEquals(1, integer(map(library.get("overview")).get("bookmarks")));
      var other = bob.get("/api/my/library");
      assertTrue(rows(other.get("sessions")).isEmpty());
      assertTrue(rows(other.get("savedPoints")).isEmpty());
      app.user().request("/api/my/library", "GET", null, 401);
      root.request("/api/my/library", "GET", null, 404);
    }
  }

  @Test
  void adminSummaryUsesServerExpiryAndDoesNotExposePrivateMediaOrPopularity() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var root = app.admin();
      root.login("admin");
      var initial = map(root.get("/api/admin/overview").get("summary"));
      assertFalse(initial.isEmpty());
      assertFalse(initial.containsKey("activeInvites"));
      assertFalse(initial.containsKey("inviteUses"));
      root.request("/api/admin/invites", "POST", obj("maxUses", 1, "days", 1), 404);
      root.send(
          "/api/admin/admins",
          "POST",
          obj(
              "username",
              "mod62",
              "name",
              "审核员",
              "password",
              ApiFixture.PASSWORD,
              "role",
              "normal"),
          201);
      var moderator = app.admin();
      moderator.login("mod62");
      String summary = write(moderator.get("/api/admin/overview").get("summary"));
      for (String hidden : List.of("viewCount", "popularity", "track", "mediaId", "passwordHash"))
        assertFalse(summary.contains(hidden));
      app.user().request("/api/admin/overview", "GET", null, 404);
    }
  }
}
