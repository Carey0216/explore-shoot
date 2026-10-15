package cn.campus.testing;

import static org.junit.jupiter.api.Assertions.*;

import cn.campus.web.StaticCache;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class StaticCacheContractTest {
  @TempDir Path temporary;

  @Test
  void changedFilesAndConditionalHeaderPrecedence() throws Exception {
    var file = temporary.resolve("asset.js");
    Files.writeString(file, "first");
    var cache = new StaticCache();
    var first = new MockHttpServletResponse();
    assertFalse(cache.notModified(new MockHttpServletRequest(), first, file));
    String etag = first.getHeader("ETag");
    var match = new MockHttpServletRequest();
    match.addHeader("If-None-Match", "\"other\", " + etag);
    var response = new MockHttpServletResponse();
    assertTrue(cache.notModified(match, response, file));
    assertEquals(304, response.getStatus());
    var precedence = new MockHttpServletRequest();
    precedence.addHeader("If-None-Match", "\"different\"");
    precedence.addHeader("If-Modified-Since", first.getHeader("Last-Modified"));
    assertFalse(cache.notModified(precedence, new MockHttpServletResponse(), file));
    Files.writeString(file, "updated file contents");
    var changed = new MockHttpServletResponse();
    assertFalse(cache.notModified(match, changed, file));
    assertNotEquals(etag, changed.getHeader("ETag"));
  }

  @Test
  void actualStaticResponsesRevalidateButPrivateApisDoNot() throws Exception {
    try (var fixture = new ApiFixture(temporary)) {
      var client = HttpClient.newHttpClient();
      var entry = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + fixture.userPort + "/admin/"))
          .build(), HttpResponse.BodyHandlers.ofString());
      assertEquals(302, entry.statusCode());
      assertEquals("http://admin.localhost:" + fixture.adminPort + "/", entry.headers().firstValue("Location").orElseThrow());
      for (int port : new int[] {fixture.userPort, fixture.adminPort}) {
        var url = URI.create("http://127.0.0.1:" + port + "/app.js");
        var first = client.send(HttpRequest.newBuilder(url).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, first.statusCode());
        var tag = first.headers().firstValue("ETag").orElseThrow();
        for (String method : new String[] {"GET", "HEAD"}) {
          var again = client.send(HttpRequest.newBuilder(url).header("If-None-Match", tag)
              .method(method, HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
          assertEquals(304, again.statusCode());
          assertEquals("", again.body());
        }
        var api = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/auth/me"))
            .header("If-None-Match", "*").build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, api.statusCode());
        assertEquals("no-store", api.headers().firstValue("Cache-Control").orElseThrow());
        assertTrue(api.headers().firstValue("ETag").isEmpty());
      }
    }
  }
}
