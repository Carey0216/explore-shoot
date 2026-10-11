package cn.campus;

import static cn.campus.Json.*;

import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import org.springframework.stereotype.Service;

@Service
public class MediaService {
  private final RateLimiter limits;

  public MediaService(RateLimiter limits) {
    this.limits = limits;
  }

  public boolean handle(ApiContext c) throws Exception {
    StoreRepository s = c.store;
    if (c.route("/api/media", "POST")) {
      c.need();
      limits.check(c.account.get("id") + ":upload", 15);
      byte[] photo = Security.photo(c.body.get("photo"), 5 * 1024 * 1024);
      String id = Security.id();
      Files.write(s.directory.resolve("media/" + id + ".jpg"), photo);
      s.rows("media")
          .add(
              obj(
                  "id",
                  id,
                  "ownerId",
                  c.account.get("id"),
                  "public",
                  false,
                  "deleted",
                  false,
                  "at",
                  StoreRepository.now()));
      try {
        s.save();
      } catch (RuntimeException e) {
        Files.deleteIfExists(s.directory.resolve("media/" + id + ".jpg"));
        throw e;
      }
      c.send(obj("id", id, "url", "/media/" + id), 201);
      return true;
    }
    Matcher m = Pattern.compile("^/media/([a-f0-9-]+)$").matcher(c.path);
    if (m.matches() && c.method.equals("GET")) {
      Map<String, Object> item = find(s.rows("media"), "id", m.group(1));
      Path file = s.directory.resolve("media/" + m.group(1) + ".jpg");
      if (item == null
          || yes(item.get("deleted"))
          || (!yes(item.get("public"))
              && (c.account == null || !eq(item.get("ownerId"), c.account.get("id"))))
          || !Files.isRegularFile(file)) throw new ApiException("照片不存在", 404);
      c.response.setContentType("image/jpeg");
      c.response.setHeader(
          "Cache-Control", yes(item.get("public")) ? "private, max-age=60" : "private, no-store");
      Files.copy(file, c.response.getOutputStream());
      return true;
    }
    return false;
  }

  public void purge(StoreRepository s, Object id) throws Exception {
    if (id == null) return;
    if (s.rows("sessions").stream()
            .anyMatch(x -> rows(x.get("tasks")).stream().anyMatch(t -> eq(t.get("mediaId"), id)))
        || s.rows("checkins").stream().anyMatch(x -> eq(x.get("mediaId"), id))) return;
    Map<String, Object> m = find(s.rows("media"), "id", id);
    if (m != null && !yes(m.get("public"))) {
      m.put("deleted", true);
      Files.deleteIfExists(s.directory.resolve("media/" + id + ".jpg"));
    }
  }
}
