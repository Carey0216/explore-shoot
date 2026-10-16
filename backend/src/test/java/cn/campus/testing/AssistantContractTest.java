package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class AssistantContractTest {
  @TempDir Path temporary;

  static Map<String, Object> content(String body) {
    return obj(
        "title",
        "晴塔摄影说明",
        "body",
        body,
        "tags",
        List.of("晴塔"),
        "pointIds",
        List.of(),
        "sourceUrl",
        "https://example.com/public-source");
  }

  @Test
  void onlyPublishedFactsAreRetrievedAndDraftsStayPrivate() throws Exception {
    try (var app = new ApiFixture(temporary)) {
      var admin = app.admin();
      admin.login("admin");
      var user = app.user();
      user.register("knowledge_user", "");
      String id =
          str(
              admin
                  .send(
                      "/api/admin/knowledge",
                      "POST",
                      obj("revision", 0, "action", "draft", "content", content("晴塔只在公开步道拍摄。")),
                      200)
                  .get("id"));
      var query = obj("question", "晴塔怎么拍", "generate", false);
      assertTrue(
          rows(user.send("/api/assistant/query", "POST", query, 200).get("sources")).isEmpty());
      admin.send(
          "/api/admin/knowledge/" + id,
          "PUT",
          obj("revision", 1, "action", "publish", "content", content("晴塔只在公开步道拍摄。")),
          200);
      String before = write(app.data());
      var found = user.send("/api/assistant/query", "POST", query, 200);
      assertEquals("retrieved", found.get("mode"));
      assertTrue(write(found).contains("公开步道"));
      assertFalse(write(found).contains("passwordHash"));
      assertEquals(before, write(app.data()));
      admin.send(
          "/api/admin/knowledge/" + id,
          "PUT",
          obj("revision", 2, "action", "draft", "content", content("PRIVATE_UNPUBLISHED_DRAFT")),
          200);
      assertFalse(
          write(user.send("/api/assistant/query", "POST", query, 200))
              .contains("PRIVATE_UNPUBLISHED_DRAFT"));
      admin.send(
          "/api/admin/knowledge/" + id,
          "PUT",
          obj("revision", 1, "action", "publish", "content", content("stale")),
          409);
      user.send("/api/admin/knowledge", "POST", obj(), 404);
      user.send("/api/assistant/query", "POST", obj("question", List.of("bad")), 400);
      user.send("/api/assistant/query", "POST", obj("question", "x".repeat(301)), 400);
      user.send("/api/assistant/query", "POST", obj("question", "图书馆怎么拍", "role", "super"), 400);
      assertFalse(yes(user.get("/api/assistant/capabilities").get("generationAvailable")));
    }
  }

  @Test
  void compatibleModelIsGroundedBoundedAndNeverHoldsTheBusinessWriteLock() throws Exception {
    var entered = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    var delayed = new AtomicBoolean(false);
    var payload = new AtomicReference<String>();
    var articleId = new AtomicReference<String>();
    var provider = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    provider.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
    provider.createContext(
        "/v1/chat/completions",
        exchange -> {
          try {
            assertEquals(
                "Bearer FAKE_LOCAL_TEST_KEY",
                exchange.getRequestHeaders().getFirst("Authorization"));
            String body =
                new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            payload.set(body);
            if (delayed.get()) {
              entered.countDown();
              assertTrue(release.await(5, TimeUnit.SECONDS));
            }
            byte[] bytes =
                write(
                        obj(
                            "choices",
                            List.of(
                                obj(
                                    "message",
                                    obj(
                                        "content",
                                        write(
                                            obj(
                                                "answer",
                                                "晴塔在公开步道取景。",
                                                "sourceIds",
                                                List.of("knowledge:" + articleId.get()))))))))
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
          } catch (Exception e) {
            throw new RuntimeException(e);
          } finally {
            exchange.close();
          }
        });
    provider.start();
    try (var app =
            new ApiFixture(
                temporary,
                Map.of(
                    "ASSISTANT_API_BASE",
                    "http://127.0.0.1:" + provider.getAddress().getPort() + "/v1",
                    "ASSISTANT_MODEL",
                    "fixture-model",
                    "ASSISTANT_API_KEY",
                    "FAKE_LOCAL_TEST_KEY"));
        var pool = Executors.newVirtualThreadPerTaskExecutor()) {
      var admin = app.admin();
      admin.login("admin");
      var user = app.user();
      user.register("grounded_user", "");
      user.send(
          "/api/checkins",
          "POST",
          obj(
              "pointId",
              "nmu1",
              "submissionId",
              UUID.randomUUID().toString(),
              "note",
              "PRIVATE_CHECKIN_DO_NOT_SEND"),
          201);
      articleId.set(
          str(
              admin
                  .send(
                      "/api/admin/knowledge",
                      "POST",
                      obj(
                          "revision",
                          0,
                          "action",
                          "publish",
                          "content",
                          content("晴塔的入口在公开步道，施工期间不要进入。")),
                      200)
                  .get("id")));
      var question = obj("question", "晴塔在哪里拍摄", "generate", true);
      var answer = user.send("/api/assistant/query", "POST", question, 200);
      assertEquals("generated", answer.get("mode"));
      assertTrue(write(answer).contains("公开步道"));
      assertFalse(payload.get().contains("PRIVATE_CHECKIN_DO_NOT_SEND"));
      assertFalse(payload.get().contains(ApiFixture.PASSWORD));
      assertFalse(payload.get().contains("passwordHash"));
      assertFalse(payload.get().contains("FAKE_LOCAL_TEST_KEY"));
      assertTrue(payload.get().length() < 20000);
      delayed.set(true);
      var pending = pool.submit(() -> user.send("/api/assistant/query", "POST", question, 200));
      assertTrue(entered.await(3, TimeUnit.SECONDS));
      assertTimeoutPreemptively(
          java.time.Duration.ofSeconds(2),
          () ->
              admin.send(
                  "/api/admin/knowledge/" + articleId.get(),
                  "PUT",
                  obj(
                      "revision",
                      1,
                      "action",
                      "unpublish",
                      "content",
                      content("晴塔的入口在公开步道，施工期间不要进入。")),
                  200));
      release.countDown();
      var refreshed = pending.get(5, TimeUnit.SECONDS);
      assertEquals("retrieved", refreshed.get("mode"));
      assertTrue(rows(refreshed.get("sources")).isEmpty());
      assertFalse(str(refreshed.get("answer")).contains("入口在公开步道"));
    } finally {
      release.countDown();
      provider.stop(0);
    }
  }
}
