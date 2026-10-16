package cn.campus.ai;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.ai.knowledge.*;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class CompatibleModelClientTest {
  static List<CampusRetriever.Hit> evidence() {
    return List.of(
        new CampusRetriever.Hit(
            new KnowledgeService.Document(
                "point:library", "图书馆", "公共步道拍摄", List.of(), List.of(), "#shots", ""),
            1));
  }

  @Test
  void invalidOptionalConfigurationLeavesRetrievalAvailable() {
    var client =
        new CompatibleModelClient(
            new CompatibleModelClient.Configuration("http://external.example/v1", "model", "test"));
    assertFalse(client.configured());
    assertThrows(
        IllegalArgumentException.class,
        () ->
            new CompatibleModelClient.Configuration(
                    "https://example.com/v1?secret=bad", "model", "test")
                .endpoint());
  }

  @Test
  void rejectsUnprovidedCitationsOversizedAndStalledBodies() throws Exception {
    var response = new AtomicReference<>("unknown-source");
    var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
      server.setExecutor(pool);
      server.createContext(
          "/v1/chat/completions",
          exchange -> {
            try {
              exchange.getRequestBody().readAllBytes();
              exchange.sendResponseHeaders(200, 0);
              if (response.get().equals("stall")) {
                exchange.getResponseBody().write('{');
                exchange.getResponseBody().flush();
                Thread.sleep(16000);
              } else {
                String body =
                    response.get().equals("oversize")
                        ? "x".repeat(600000)
                        : write(
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
                                                    "没有依据的答案",
                                                    "sourceIds",
                                                    List.of("unknown-source"))))))));
                exchange.getResponseBody().write(body.getBytes(StandardCharsets.UTF_8));
              }
            } catch (Exception ignored) {
              // Cancellation closes the connection; no request content is logged.
            } finally {
              exchange.close();
            }
          });
      server.start();
      var client =
          new CompatibleModelClient(
              new CompatibleModelClient.Configuration(
                  "http://127.0.0.1:" + server.getAddress().getPort() + "/v1", "mock", "test"));
      assertThrows(Exception.class, () -> client.generate("图书馆", evidence()));
      response.set("oversize");
      assertThrows(Exception.class, () -> client.generate("图书馆", evidence()));
      response.set("stall");
      assertTimeoutPreemptively(
          Duration.ofSeconds(14),
          () -> assertThrows(Exception.class, () -> client.generate("图书馆", evidence())));
      server.stop(0);
      pool.shutdownNow();
    } finally {
      server.stop(0);
    }
  }
}
