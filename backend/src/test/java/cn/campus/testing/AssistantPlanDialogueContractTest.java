package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class AssistantPlanDialogueContractTest {
  @TempDir Path temporary;

  private Map<String,Object> body(Map<String,Object> point, String title, double offset) {
    return obj("pointId", point.get("id"), "title", title, "standDescription", "在允许通行的公共步道拍摄建筑", "lng", num(point.get("lng")) + offset,
        "lat", point.get("lat"), "bearing", 90, "bestTime", "以现场光线为准", "status", "published");
  }
  private Map<String,Object> ask(ApiFixture.Client user, String question, Object context) throws Exception {
    var b = obj("question", question, "purpose", "support", "generate", true, "history", List.of());
    if (context != null) b.put("planContext", context);
    return user.send("/api/assistant/chat", "POST", b, 200);
  }
  private List<Map<String,Object>> items(Map<String,Object> answer) {
    return rows(map(map(answer.get("planPreview")).get("plan")).get("items"));
  }
  private Map<String,Object> payload(Map<String,Object> answer) {
    return obj("title", "连续修改的建筑计划", "items", items(answer).stream().map(i -> obj("id", i.get("id"), "spotId", i.get("spotId"), "composition", i.get("composition"), "minutes", i.get("minutes"), "done", false)).toList());
  }

  @Test void editsKeepRouteContextRespectBudgetAndSaveWithOwnership() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin(); admin.login("admin");
      var user = app.user(); user.register("plan_alice", "");
      var bob = app.user(); bob.register("plan_bob", "");
      var p = rows(user.get("/api/catalog").get("points")).stream().filter(i -> yes(i.get("open"))).findFirst().orElseThrow();
      var first = admin.send("/api/admin/shooting-spots", "POST", body(p, "建筑第一站", 0), 201);
      var far = admin.send("/api/admin/shooting-spots", "POST", body(p, "建筑远处视角", .0015), 201);
      var near = admin.send("/api/admin/shooting-spots", "POST", body(p, "安静建筑步道", .0001), 201);
      var initial = ask(user, "今天只有二十分钟，想拍建筑", null);
      assertEquals("plan", initial.get("mode"));
      assertEquals(20, integer(map(initial.get("planContext")).get("budget")));
      assertFalse(items(initial).isEmpty());
      assertTrue(integer(map(map(initial.get("planPreview")).get("schedule")).get("estimatedMinutes")) <= 20);
      var context = obj("budget", 30, "preference", "建筑", "spotIds", List.of(first.get("id"), far.get("id")), "favorites", false, "quiet", false);
      var changed = ask(user, "第二站太远", context);
      assertEquals(first.get("id"), items(changed).getFirst().get("spotId"));
      assertEquals(near.get("id"), items(changed).get(1).get("spotId"));
      assertTrue(write(changed).contains("实际道路仍需导航核对"));
      assertTrue(write(changed).contains("开放时段待核对"));
      var saved = user.send("/api/my/plans", "POST", payload(changed), 201);
      var shortened = ask(user, "删掉第二站", changed.get("planContext"));
      assertEquals(1, items(shortened).size());
      var update = payload(shortened); update.put("revision", saved.get("revision"));
      String path = "/api/my/plans/" + saved.get("id");
      bob.send(path, "PUT", update, 404);
      var newer = user.send(path, "PUT", update, 200);
      assertEquals(2, integer(newer.get("revision")));
      user.send(path, "PUT", update, 409);
      assertEquals(1, rows(user.get("/api/my/plans").get("items")).size());
      var tooShort = ask(user, "只有十分钟", changed.get("planContext"));
      assertTrue(integer(map(map(tooShort.get("planPreview")).get("schedule")).get("estimatedMinutes")) <= 10);
      var english=ask(user,"I have ten minutes and want to photograph buildings",null);
      assertEquals(10,integer(map(english.get("planContext")).get("budget")));
      var removedFirst=ask(user,"Remove the first stop",changed.get("planContext"));
      assertEquals(1,items(removedFirst).size());
      assertEquals(near.get("id"),items(removedFirst).getFirst().get("spotId"));
      var quiet = ask(user, "换个安静点的", changed.get("planContext"));
      assertTrue(write(quiet).contains("实时人流未核实"));
      user.send("/api/assistant/chat", "POST", obj("question", "第二站太远", "purpose", "support", "planContext", obj("ownerId", "someone_else")), 400);
    }
  }

  @Test void favoritesAreOnlyCurrentOwnersAndUnpublishedSpotsDisappear() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin(); admin.login("admin");
      var alice = app.user(); alice.register("private_plan_alice", "");
      var bob = app.user(); bob.register("private_plan_bob", "");
      var p = rows(alice.get("/api/catalog").get("points")).stream().filter(i -> yes(i.get("open"))).findFirst().orElseThrow();
      var b = body(p, "收藏中的建筑", 0);
      var spot = admin.send("/api/admin/shooting-spots", "POST", b, 201);
      alice.send("/api/bookmarks", "POST", obj("pointId", p.get("id")), 200);
      var initial = ask(alice, "想拍建筑", null);
      var picked = ask(alice, "从我收藏里挑", initial.get("planContext"));
      assertEquals(spot.get("id"), items(picked).getFirst().get("spotId"));
      assertTrue(yes(map(picked.get("planContext")).get("favorites")));
      var other = ask(bob, "从我收藏里挑", initial.get("planContext"));
      assertNull(other.get("planPreview"));
      assertTrue(str(other.get("answer")).contains("你的收藏中暂时没有"));
      assertFalse(write(other).contains("ownerId"));
      var guest = ask(app.user(), "从我收藏里挑", initial.get("planContext"));
      assertNull(guest.get("planPreview"));
      assertTrue(str(guest.get("answer")).contains("先登录"));
      b.put("status", "draft"); b.put("revision", spot.get("revision"));
      admin.send("/api/admin/shooting-spots/" + spot.get("id"), "PATCH", b, 200);
      var refresh = ask(alice, "继续调整这份拍摄计划", initial.get("planContext"));
      assertTrue(items(refresh).isEmpty());
      assertFalse(write(map(refresh.get("planPreview"))).contains(str(spot.get("id"))));
    }
  }
}
