package cn.campus.storage;

import cn.campus.auth.Security;
import cn.campus.web.ApiContext;
import java.nio.file.*;

/**
 * Call only after authorization. Revalidate every time so revoked media cannot get a cached 304.
 */
public final class ImageDelivery {
  private ImageDelivery() {}

  public static void send(ApiContext c, Path file, boolean reusable) throws Exception {
    c.response.setContentType("image/jpeg");
    c.response.setHeader("Cache-Control", reusable ? "private, no-cache" : "private, no-store");
    String tag =
        "\""
            + Security.digest(
                file.toAbsolutePath()
                    + ":"
                    + Files.size(file)
                    + ":"
                    + Files.getLastModifiedTime(file))
            + "\"";
    if (reusable) {
      c.response.setHeader("ETag", tag);
      if (tag.equals(c.request.getHeader("If-None-Match"))) {
        c.response.setStatus(304);
        return;
      }
    }
    c.response.setContentLengthLong(Files.size(file));
    Files.copy(file, c.response.getOutputStream());
  }
}
