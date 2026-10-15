package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PointReactionContractTest {
  @TempDir Path temporary;

  @Test
  void exclusivePersistentReactionsArePrivateAndPersonalRankingBeatsPopularity() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var guest = app.user(); var alice = app.user(); var bob = app.user();
      var root = app.admin(); var moderator = app.admin();
      var points = rows(guest.get("/api/catalog").get("points"));
      String id = str(points.getFirst().get("id")), url = "/api/points/" + id + "/reaction";
      guest.send(url, "PUT", obj("value", "like"), 401);
      alice.register("reaction_alice", ""); bob.register("reaction_bob", ""); root.login("admin");
      root.send("/api/admin/admins", "POST", obj("username", "reaction_mod", "password", ApiFixture.PASSWORD,
          "name", "Moderator", "role", "normal"), 201);
      moderator.login("reaction_mod");
      root.send("/api/admin/points/" + id + "/popularity", "PATCH", obj("popularity", 1000000), 200);
      var first = alice.send(url, "PUT", obj("value", "like"), 200);
      assertEquals(1, integer(map(first.get("point")).get("likeCount")));
      var retry = alice.send(url, "PUT", obj("value", "like"), 200);
      assertEquals(first.get("version"), retry.get("version"), "Retry must not create a second vote");
      assertEquals(1, rows(app.data().get("pointReactions")).size());
      bob.send(url, "PUT", obj("value", "like"), 200);
      alice.send(url, "PUT", obj("value", "dislike"), 200);
      assertEquals(2, rows(app.data().get("pointReactions")).size());
      for (var visitor : List.of(guest, bob, alice)) {
        var catalog = visitor.get("/api/catalog");
        var point = find(rows(catalog.get("points")), "id", id);
        assertEquals(1, integer(point.get("likeCount")));
        assertFalse(write(point).contains("dislikeCount"));
        assertFalse(write(point).contains("userId"));
        assertFalse(write(point).contains("viewCount"));
        assertFalse(write(point).contains("popularity"));
      }
      assertEquals(id, list(alice.get("/api/catalog").get("popularPointIds")).getLast());
      assertEquals(id, list(bob.get("/api/catalog").get("popularPointIds")).getFirst());
      assertEquals(id, list(guest.get("/api/catalog").get("popularPointIds")).getFirst());
      for (String filter : List.of("all", "popular", "nearby")) {
        var result = alice.send("/api/points/search", "POST", obj("filter", filter, "pageSize", 100), 200);
        assertEquals(id, rows(result.get("points")).getLast().get("id"));
      }
      var firstPage = alice.send("/api/points/search", "POST", obj("filter", "popular", "pageSize", 2), 200);
      assertTrue(rows(firstPage.get("points")).stream().noneMatch(p -> eq(p.get("id"), id)));
      for (var admin : List.of(root, moderator)) {
        var point = find(rows(admin.get("/api/admin/overview").get("points")), "id", id);
        assertEquals(1, integer(point.get("likeCount")));
        assertEquals(1, integer(point.get("dislikeCount")));
      }
      assertFalse(write(moderator.get("/api/admin/overview").get("points")).contains("popularity"));
      for (var bad : List.of(obj("value", "invalid"), obj("value", 1), obj("value", "like", "userId", "forged"), obj()))
        alice.send(url, "PUT", bad, 400);
      alice.request(url, "PUT", obj("value", "like"), 403, Map.of("Origin", "https://invalid.example"));
      app.restart(); alice.login("reaction_alice");
      assertEquals(id, list(alice.get("/api/catalog").get("popularPointIds")).getLast());
      alice.send(url, "PUT", obj("value", null), 200);
      assertEquals(id, list(alice.get("/api/catalog").get("popularPointIds")).getFirst());
      assertEquals(1, rows(app.data().get("pointReactions")).size());
      root.login("admin");
      root.send("/api/admin/points/" + id, "PATCH", obj("published", false), 200);
      alice.send(url, "PUT", obj("value", "like"), 404);
      assertEquals(1, rows(app.data().get("pointReactions")).size());
    }
  }
}
