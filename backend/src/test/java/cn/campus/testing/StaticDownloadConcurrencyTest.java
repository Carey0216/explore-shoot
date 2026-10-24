package cn.campus.testing;

import static org.junit.jupiter.api.Assertions.*;

import cn.campus.common.RateLimiter;
import cn.campus.storage.StoreRepository;
import cn.campus.web.RequestDispatcher;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import java.io.IOException;
import java.nio.file.*;
import java.time.Duration;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.*;

class StaticDownloadConcurrencyTest {
  @TempDir Path temporary;

  private MockHttpServletRequest request(String path) {
    var request = new MockHttpServletRequest("GET", path);
    request.setLocalPort(4174);
    request.addHeader("Host", "127.0.0.1:4174");
    return request;
  }

  @Test
  void aStalledStaticDownloadDoesNotBlockBusinessRequests() throws Exception {
    Files.createDirectories(temporary.resolve("dist/user"));
    Files.writeString(temporary.resolve("dist/user/app.js"), "console.log('fixture');");
    Files.writeString(temporary.resolve("package.json"), "{\"version\":\"6.5.4\"}");
    try (var store = new StoreRepository(temporary, temporary.resolve("data"))) {
      var dispatcher =
          new RequestDispatcher(
              store,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              new RateLimiter(),
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              new cn.campus.maps.MiniMapRouting(new RateLimiter()), null);
      var started = new CountDownLatch(1);
      var release = new CountDownLatch(1);
      var slow =
          new MockHttpServletResponse() {
            public ServletOutputStream getOutputStream() {
              return new ServletOutputStream() {
                public boolean isReady() {
                  return true;
                }

                public void setWriteListener(WriteListener listener) {}

                public void write(int value) throws IOException {
                  started.countDown();
                  try {
                    release.await();
                  } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IOException(e);
                  }
                }
              };
            }
          };
      var download =
          Thread.ofVirtual()
              .start(
                  () -> {
                    try {
                      dispatcher.handle(request("/app.js"), slow);
                    } catch (IOException e) {
                      throw new RuntimeException(e);
                    }
                  });
      try {
        assertTrue(started.await(3, TimeUnit.SECONDS));
        assertTimeoutPreemptively(
            Duration.ofSeconds(2),
            () -> {
              var response = new MockHttpServletResponse();
              dispatcher.handle(request("/api/health"), response);
              assertEquals(200, response.getStatus());
            });
      } finally {
        release.countDown();
        download.join(3000);
      }
      assertFalse(download.isAlive());
    }
  }
}
