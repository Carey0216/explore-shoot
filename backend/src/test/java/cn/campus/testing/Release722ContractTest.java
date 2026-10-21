package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Release722ContractTest {
  @TempDir Path temp;

  @Test
  void presetsAvoidProviderAndOwnerControlsFurtherAnswers() throws Exception {
    var calls = new AtomicInteger();
    var provider = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    provider.createContext(
        "/v1/chat/completions",
        e -> {
          calls.incrementAndGet();
          e.getRequestBody().readAllBytes();
          byte[] response =
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
                                              "这是隔离模型的摄影建议。",
                                              "sourceIds",
                                              List.of())))))))
                  .getBytes(StandardCharsets.UTF_8);
          e.getResponseHeaders().set("Content-Type", "application/json");
          e.sendResponseHeaders(200, response.length);
          e.getResponseBody().write(response);
          e.close();
        });
    provider.start();
    try (var app =
        new ApiFixture(
            temp,
            Map.of(
                "ASSISTANT_API_BASE",
                "http://127.0.0.1:" + provider.getAddress().getPort() + "/v1",
                "ASSISTANT_MODEL",
                "fixture",
                "ASSISTANT_API_KEY",
                "TEST_ONLY_KEY"))) {
      var admin = app.admin();
      admin.login("admin");
      admin.send("/api/admin/support-settings", "GET", null, 403);
      app.promoteFixtureOwner();
      admin.login("admin");
      var user = app.user();
      var question =
          obj("purpose", "support", "question", "收藏在哪里？", "generate", true, "history", List.of());
      var preset = user.send("/api/assistant/chat", "POST", question, 200);
      assertEquals("preset", preset.get("mode"));
      assertTrue(str(preset.get("answer")).contains("爱心"));
      assertEquals(0, calls.get());
      var unknown = copy(question);
      unknown.put("question", "请讲讲焦外散景与超焦距之间的区别");
      assertEquals("generated", user.send("/api/assistant/chat", "POST", unknown, 200).get("mode"));
      assertEquals(1, calls.get());
      var further = copy(question);
      further.put("further", true);
      assertEquals("generated", user.send("/api/assistant/chat", "POST", further, 200).get("mode"));
      assertEquals(2, calls.get());
      var policy = admin.get("/api/admin/support-settings");
      policy.put("furtherEnabled", false);
      policy.put("modelLabel", "小景");
      var rows = rows(policy.get("presets"));
      rows.getFirst().put("keywords", List.of("特殊验收词"));
      rows.getFirst().put("answer", "自定义的校园操作说明。");
      policy.put("presets", rows);
      admin.send("/api/admin/support-settings", "PUT", policy, 200);
      user.send("/api/assistant/chat", "POST", further, 403);
      assertEquals(2, calls.get());
      var caps = user.get("/api/assistant/capabilities");
      assertFalse(yes(caps.get("furtherEnabled")));
      assertEquals("小景", caps.get("modelLabel"));
      assertFalse(write(caps).contains("TEST_ONLY_KEY"));
      admin.send("/api/admin/support-settings", "PUT", policy, 409);
      var invalid = copy(policy);
      invalid.put("revision", 1);
      invalid.put("modelLabel", "x".repeat(31));
      admin.send("/api/admin/support-settings", "PUT", invalid, 400);
      var custom = copy(question);
      custom.put("question", "特殊验收词");
      assertEquals(
          "自定义的校园操作说明。", user.send("/api/assistant/chat", "POST", custom, 200).get("answer"));
      assertEquals(2, calls.get());
      app.restart();
      admin.login("admin");
      assertEquals("小景", admin.get("/api/admin/support-settings").get("modelLabel"));
    } finally {
      provider.stop(0);
    }
  }
}
