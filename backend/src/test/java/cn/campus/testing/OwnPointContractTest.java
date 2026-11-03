package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class OwnPointContractTest {
  @TempDir Path temporary;

  @Test
  void ownerCanEditAndWithdrawWithoutChangingOthersOrCheckins() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var root = app.admin();
      root.login("admin");
      var alice = app.user();
      alice.register("ownpoint_alice", "");
      var bob = app.user();
      bob.register("ownpoint_bob", "");
      var guest = app.user();
      var apply = alice.send("/api/scout/apply", "POST", obj("reason", "贡献校园真实的拍摄地点"), 201);
      root.send(
          "/api/admin/applications/" + apply.get("id"),
          "PATCH",
          obj("status", "approved", "note", "测试通过"),
          200);
      var location = rows(guest.get("/api/catalog").get("points")).getFirst();
      String photo =
          "data:image/jpeg;base64,"
              + Base64.getEncoder()
                  .encodeToString(
                      Files.readAllBytes(app.root.resolve("dist/shared/nmu-library.jpg")));
      var media = alice.send("/api/media", "POST", obj("photo", photo), 201);
      var p =
          alice.send(
              "/api/points",
              "POST",
              obj(
                  "name",
                  "测试校园发现",
                  "description",
                  "自己的真实拍摄角落",
                  "condition",
                  "公共步道请勿打扰他人",
                  "theme",
                  "建筑",
                  "lng",
                  location.get("lng"),
                  "lat",
                  location.get("lat"),
                  "mediaId",
                  media.get("id")),
              201);
      String url = "/api/my/points/" + p.get("id");
      guest.request(url, "GET", null, 401);
      bob.request(url, "GET", null, 404);
      var body =
          obj(
              "name",
              "修改后的发现",
              "description",
              "修改后的介绍至少五个字",
              "condition",
              "请从公共步道进入",
              "theme",
              "自然",
              "version",
              p.get("version"),
              "authorId",
              "forged",
              "published",
              false);
      bob.send(url, "PUT", body, 404);
      alice.send(url, "PUT", body, 200);
      alice.send(url, "PUT", body, 409);
      var mine = alice.get(url);
      assertEquals("修改后的发现", mine.get("name"));
      assertTrue(yes(mine.get("published")));
      assertFalse(write(mine).contains("authorId"));
      assertFalse(write(mine).contains("viewCount"));
      bob.send(url, "DELETE", obj("version", mine.get("version")), 404);
      alice.send(url, "DELETE", obj("version", mine.get("version")), 200);
      alice.request(url, "GET", null, 404);
      assertEquals(0, integer(alice.get("/api/my/content?tab=posts").get("total")));
      assertNull(find(rows(guest.get("/api/catalog").get("points")), "id", p.get("id")));
      guest.request("/media/" + media.get("id"), "GET", null, 404);
      assertTrue(
          Files.exists(app.directory.resolve("data/media/" + media.get("id") + ".jpg")),
          "withdraw keeps original media");
    }
  }
}
