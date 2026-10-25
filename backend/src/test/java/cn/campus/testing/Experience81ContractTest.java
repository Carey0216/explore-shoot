package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.point.PointSearchService;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class Experience81ContractTest {
  @TempDir Path temporary;

  @Test
  void forgivingSearchSeasonMetadataAndDiagnosticsArePermissionScoped() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var guest = app.user();
      var normal = app.admin();
      normal.login("admin");
      for (String q : List.of("tushuguan", "tsg", "图书管", "图书官")) {
        var r = guest.send("/api/points/search", "POST", obj("query", q, "pageSize", 1), 200);
        assertTrue(integer(r.get("total")) > 0);
        assertEquals(1, rows(r.get("points")).size());
        assertFalse(write(r).contains("popularity"));
      }
      normal.send("/api/admin/points/nmu1", "PATCH", obj("searchAliases", "校园书屋、知识港"), 200);
      assertFalse(
          rows(guest.send("/api/points/search", "POST", obj("query", "知识港"), 200).get("points"))
              .isEmpty());
      var near = guest.send("/api/points/search", "POST", obj("query", "图叔馆"), 200);
      assertFalse(rows(near.get("suggestions")).isEmpty());
      guest.send("/api/client-health", "POST", obj("kind", "image-failed", "platform", "web"), 200);
      guest.send(
          "/api/client-health",
          "POST",
          obj("kind", "image-failed", "platform", "web", "url", "private-photo"),
          400);
      normal.request("/api/admin/performance/runtime", "GET", null, 403);
      var topic =
          obj(
              "title",
              "校园雪景",
              "description",
              "积累历年参考照片",
              "theme",
              "snow",
              "referenceDate",
              "2026-01-16",
              "startsAt",
              "2026-01-01T00:00:00Z",
              "endsAt",
              "2026-12-31T00:00:00Z",
              "pointIds",
              List.of("nmu1"),
              "ruleIds",
              List.of(),
              "published",
              true);
      normal.send("/api/admin/topics", "POST", topic, 201);
      var snow =
          rows(guest.get("/api/topics").get("items")).stream()
              .filter(t -> eq(t.get("theme"), "snow"))
              .findFirst()
              .orElseThrow();
      assertEquals("2026-01-16", snow.get("referenceDate"));
      assertTrue(rows(snow.get("points")).getFirst().containsKey("lat"));
      topic.put("referenceDate", "2026-02-31");
      normal.send("/api/admin/topics", "POST", topic, 400);
      app.promoteFixtureOwner();
      var owner = app.admin();
      owner.login("admin");
      var ops = map(owner.get("/api/admin/performance/runtime").get("operations"));
      assertTrue(ops.containsKey("backup"));
      assertTrue(ops.containsKey("weather"));
      assertFalse(write(ops).contains("private-photo"));
    }
  }

  @Test
  void pinyinAndManualAliasesHaveBoundedPredictableMatches() {
    var p = obj("name", "德泽楼", "aliases", List.of("教学楼A"));
    assertTrue(PointSearchService.friendlyMatch(p, "dezelou"));
    assertTrue(PointSearchService.friendlyMatch(p, "dzl"));
    assertTrue(PointSearchService.friendlyMatch(p, "教学楼A"));
    assertFalse(PointSearchService.friendlyMatch(p, " "));
    assertFalse(PointSearchService.friendlyMatch(p, "random-place"));
  }
}
