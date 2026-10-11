package cn.campus;

import static cn.campus.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.dto.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class SearchContractTest {
  @TempDir Path temporary;

  @Test
  void searchPagingPrivacyAndAccountFiltersUseActualJavaHttp() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var guest = app.user();
      var alice = app.user();
      var bob = app.user();
      var admin = app.admin();
      var catalog = guest.get("/api/catalog");
      var points = rows(catalog.get("points"));
      String id = str(points.getFirst().get("id"));
      Map<String, Object> first = guest.send("/api/points/search", "POST", obj("pageSize", 2), 200);
      assertEquals(8, integer(first.get("total")));
      assertEquals(2, rows(first.get("points")).size());
      assertTrue(yes(first.get("hasMore")));
      Set<Object> ids = new HashSet<>();
      for (int page = 1; page <= 4; page++) {
        var result =
            guest.send("/api/points/search", "POST", obj("page", page, "pageSize", 2), 200);
        for (var p : rows(result.get("points"))) assertTrue(ids.add(p.get("id")));
        assertFalse(write(result).contains("viewCount"));
        assertFalse(write(result).contains("popularity"));
      }
      assertEquals(8, ids.size());
      assertTrue(
          rows(guest.send("/api/points/search", "POST", obj("page", 999), 200).get("points"))
              .isEmpty());
      for (String query : List.of("library", "図書館", "圖書館", "ＬＩＢＲＡＲＹ"))
        assertFalse(
            rows(guest.send("/api/points/search", "POST", obj("query", query), 200).get("points"))
                .isEmpty());
      String title = str(rows(catalog.get("templates")).getFirst().get("title"));
      assertFalse(
          rows(guest.send("/api/points/search", "POST", obj("query", title), 200).get("points"))
              .isEmpty());
      for (var input :
          List.of(
              obj("query", 123),
              obj("query", "x".repeat(101)),
              obj("filter", "super"),
              obj("page", 0),
              obj("pageSize", 101),
              obj("page", 1.2),
              obj("accountId", "forged"))) guest.send("/api/points/search", "POST", input, 400);
      guest.send("/api/points/search", "POST", obj("filter", "saved"), 401);
      var a = alice.register("search_alice", "");
      bob.register("search_bob", "");
      alice.send("/api/bookmarks", "POST", obj("pointId", id), 200);
      assertEquals(
          1,
          integer(
              alice.send("/api/points/search", "POST", obj("filter", "saved"), 200).get("total")));
      assertEquals(
          0,
          integer(
              bob.send("/api/points/search", "POST", obj("filter", "saved"), 200).get("total")));
      alice.send(
          "/api/checkins",
          "POST",
          obj(
              "accountId",
              a.get("id"),
              "submissionId",
              UUID.randomUUID().toString(),
              "pointId",
              id,
              "note",
              "Java 检索测试"),
          201);
      assertEquals(
          1,
          integer(
              alice
                  .send("/api/points/search", "POST", obj("filter", "visited"), 200)
                  .get("total")));
      assertEquals(
          7,
          integer(
              alice
                  .send("/api/points/search", "POST", obj("filter", "unvisited"), 200)
                  .get("total")));
      assertEquals(
          0,
          integer(
              bob.send("/api/points/search", "POST", obj("filter", "visited"), 200).get("total")));
      admin.login("admin");
      admin.send("/api/points/search", "POST", obj(), 404);
      String hidden = str(points.getLast().get("id"));
      admin.send("/api/admin/points/" + hidden, "PATCH", obj("published", false), 200);
      assertEquals(
          7,
          integer(
              guest
                  .send("/api/points/search", "POST", obj("filter", "popular"), 200)
                  .get("total")));
      app.restart();
      assertEquals(
          1,
          integer(
              alice
                  .send("/api/points/search", "POST", obj("filter", "visited"), 200)
                  .get("total")));
      System.out.println("Java search API checks: " + app.checks);
    }
  }

  @Test
  void typedRegistrationPreservesOptionalInviteAndRejectsWrongTypes() {
    var request =
        RegistrationRequest.from(
            obj("username", "student", "nickname", "同学", "password", ApiFixture.PASSWORD));
    assertEquals("", request.inviteCode());
    assertThrows(
        ApiException.class,
        () ->
            RegistrationRequest.from(
                obj(
                    "username",
                    "student",
                    "nickname",
                    "同学",
                    "password",
                    ApiFixture.PASSWORD,
                    "inviteCode",
                    123)));
    assertThrows(ApiException.class, () -> PointSearchRequest.from(obj("pageSize", "10")));
  }
}
