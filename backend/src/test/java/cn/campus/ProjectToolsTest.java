package cn.campus;

import static cn.campus.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.tools.*;
import com.google.zxing.*;
import com.google.zxing.common.HybridBinarizer;
import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ProjectToolsTest {
  @TempDir Path temporary;

  private static String request(int port, String target, String headers, String method)
      throws Exception {
    try (var socket = new Socket("127.0.0.1", port)) {
      socket.setSoTimeout(5000);
      socket
          .getOutputStream()
          .write(
              (method
                      + " "
                      + target
                      + " HTTP/1.1\r\n"
                      + headers
                      + "Connection: close\r\nContent-Length: 0\r\n\r\n")
                  .getBytes(StandardCharsets.US_ASCII));
      return new String(socket.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    }
  }

  @Test
  void javaPhoneProxyPreservesUserRequestsButBlocksAdminForeignOriginsAndSpoofedHeaders()
      throws Exception {
    List<Map<String, Object>> received = Collections.synchronizedList(new ArrayList<>());
    var upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    upstream.createContext(
        "/",
        exchange -> {
          received.add(
              obj(
                  "path",
                  exchange.getRequestURI().toString(),
                  "cookie",
                  exchange.getRequestHeaders().getFirst("Cookie"),
                  "origin",
                  exchange.getRequestHeaders().getFirst("Origin"),
                  "forwarded",
                  exchange.getRequestHeaders().getFirst("X-Forwarded-For")));
          byte[] body = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
          exchange.getResponseHeaders().set("Content-Type", "application/json");
          exchange
              .getResponseHeaders()
              .set("Set-Cookie", "nmu_user=TEST; HttpOnly; SameSite=Strict; Path=/");
          exchange.sendResponseHeaders(200, body.length);
          exchange.getResponseBody().write(body);
          exchange.close();
        });
    upstream.start();
    try (var bridge =
        new PhoneBridge(
            "https://fixture.trycloudflare.com", "127.0.0.1", 0, upstream.getAddress().getPort())) {
      bridge.start();
      String host = "Host: fixture.trycloudflare.com\r\n";
      assertTrue(request(bridge.port(), "/", host, "GET").startsWith("HTTP/1.1 200"));
      assertTrue(
          request(bridge.port(), "/", host, "GET").toLowerCase(Locale.ROOT).contains("; secure"));
      assertTrue(
          request(
                  bridge.port(),
                  "/api/auth/login",
                  host
                      + "Origin: https://fixture.trycloudflare.com\r\n"
                      + "Cookie: nmu_admin=SECRET; nmu_user=USER\r\n"
                      + "X-Forwarded-For: 8.8.8.8\r\n"
                      + "Forwarded: for=8.8.8.8\r\n",
                  "POST")
              .startsWith("HTTP/1.1 200"));
      var last = received.getLast();
      assertEquals("nmu_user=USER", last.get("cookie"));
      assertEquals("http://127.0.0.1:" + upstream.getAddress().getPort(), last.get("origin"));
      assertNull(last.get("forwarded"));
      for (String path :
          List.of(
              "/admin",
              "/admin/app.js",
              "/api/admin/overview",
              "/%61dmin",
              "/api/%61dmin/overview"))
        assertTrue(request(bridge.port(), path, host, "GET").startsWith("HTTP/1.1 404"));
      assertTrue(
          request(bridge.port(), "/", host + "Origin: https://evil.example\r\n", "GET")
              .startsWith("HTTP/1.1 403"));
      assertTrue(request(bridge.port(), "/", host, "POST").startsWith("HTTP/1.1 403"));
      assertTrue(
          request(bridge.port(), "/", "Host: evil.example\r\n", "GET").startsWith("HTTP/1.1 403"));
      assertTrue(
          request(bridge.port(), "/__phone_health", host, "GET").contains("\"backend\":\"java\""));
      assertEquals(3, received.size());
    } finally {
      upstream.stop(0);
    }
  }

  @Test
  void generatedQrDecodesToTheExactHttpsUserUrlAndNeverTheAdminSite() throws Exception {
    var entry = PhoneEntry.make(obj("origin", "https://long-fixture-test.trycloudflare.com"));
    String svg = str(entry.get("svg"));
    var size = Pattern.compile("viewBox=\"0 0 (\\d+) (\\d+)\"").matcher(svg);
    assertTrue(size.find());
    int modules = Integer.parseInt(size.group(1)), pixels = modules * 8;
    int[] colors = new int[pixels * pixels];
    Arrays.fill(colors, 0xffffff);
    var cells = Pattern.compile("M(\\d+) (\\d+)h1v1h-1z").matcher(svg);
    while (cells.find()) {
      int x = Integer.parseInt(cells.group(1)) * 8, y = Integer.parseInt(cells.group(2)) * 8;
      for (int dy = 0; dy < 8; dy++)
        for (int dx = 0; dx < 8; dx++) colors[(y + dy) * pixels + x + dx] = 0;
    }
    String decoded =
        new MultiFormatReader()
            .decode(
                new BinaryBitmap(
                    new HybridBinarizer(new RGBLuminanceSource(pixels, pixels, colors))))
            .getText();
    assertEquals(entry.get("url"), decoded);
    assertTrue(decoded.endsWith("/#discover"));
    assertFalse(decoded.contains("admin"));
    Files.createDirectories(temporary.resolve("data"));
    Files.writeString(
        temporary.resolve("data/https-test.json"),
        "\uFEFF" + write(obj("origin", "https://long-fixture-test.trycloudflare.com")));
    PhoneEntry.write(temporary, false);
    assertTrue(Files.readString(temporary.resolve("dist/admin/phone-test.html")).contains("手机测试"));
    assertTrue(
        yes(
            parse(Files.readString(temporary.resolve("dist/admin/phone-test.json")))
                .get("active")));
    PhoneEntry.write(temporary, true);
    assertFalse(
        yes(
            parse(Files.readString(temporary.resolve("dist/admin/phone-test.json")))
                .get("active")));
    assertThrows(
        IllegalArgumentException.class,
        () -> PhoneEntry.make(obj("origin", "https://evil.example/<script>")));
  }

  @Test
  void releaseValidationRejectsPartialVersionUpdatesAndReproducesExistingNotes() {
    String version = "6.1.0", commit = "a".repeat(40);
    var entries =
        List.of(obj("version", version, "date", "2026-10-11", "commit", commit, "title", "Java"));
    var docs =
        obj(
            "README.md",
            "# 项目 v6.1\n源码标签 `v6.1.0`\n",
            "版本考古与回退.md",
            "当前 **v6.1.0**\n| 2026-10-11 | `v6.1.0` | `aaaaaaa` |",
            "dist/user/index.html",
            "校园探索试点 v6.1</span>",
            "验收记录.md",
            "## v6.1 当前发布验收\n已验证");
    ReleaseDocs.check(version, entries, file -> str(docs.get(file)));
    for (String file : docs.keySet()) {
      var changed = copy(docs);
      changed.put(file, "旧版");
      assertThrows(
          IllegalStateException.class,
          () -> ReleaseDocs.check(version, entries, name -> str(changed.get(name))));
    }
    docs.put("README.md", docs.get("README.md") + "\nGitHub Latest 保持 v0.0.0。");
    assertThrows(
        IllegalStateException.class,
        () -> ReleaseDocs.check(version, entries, file -> str(docs.get(file))));
    String notes =
        ReleasePublisher.notes(
            "## 6.1.0 · 2026-10-11\n\n- Java 运行工具。\n\n## 6.0.0 · 2026-10-11\n旧版",
            entries.getFirst());
    assertTrue(notes.contains("对应源码提交：`" + commit + "`"));
    assertTrue(notes.endsWith("- Java 运行工具。"));
    assertFalse(notes.contains("旧版"));
  }

  @Test
  void publicGeometryImportClipsRoadsAndRejectsIncompleteData() {
    List<Map<String, Object>> elements = new ArrayList<>();
    for (int i = 0; i < 4; i++)
      elements.add(
          obj(
              "type",
              "node",
              "id",
              i + 1,
              "lon",
              106.095 + (i % 2) * .001,
              "lat",
              38.495 + (i / 2) * .001));
    elements.add(
        obj(
            "type",
            "way",
            "id",
            461608579,
            "nodes",
            List.of(1, 2, 4, 3, 1),
            "tags",
            obj("landuse", "education")));
    for (int i = 0; i < 10; i++)
      elements.add(
          obj(
              "type",
              "way",
              "id",
              100 + i,
              "nodes",
              List.of(1, 2),
              "timestamp",
              "2024-05-18T00:00:00Z",
              "tags",
              obj("highway", "footway")));
    var geo = MapRefresh.convert(obj("elements", elements));
    assertEquals(10, integer(map(geo.get("metadata")).get("roadCount")));
    assertEquals(11, rows(geo.get("features")).size());
    assertEquals("WGS84", map(geo.get("metadata")).get("coordinateSystem"));
    assertThrows(
        IllegalArgumentException.class, () -> MapRefresh.convert(obj("elements", List.of())));
    assertThrows(IllegalArgumentException.class, () -> MapRefresh.convert(obj()));
  }
}
