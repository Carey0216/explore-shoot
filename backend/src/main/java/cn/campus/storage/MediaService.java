package cn.campus.storage;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.common.RateLimiter;
import cn.campus.web.ApiContext;
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

  public boolean handle(ApiContext context) throws Exception {
    StoreRepository store = context.store;
    if (context.route("/api/media", "POST")) {
      context.need();
      limits.check(context.account.get("id") + ":upload", 15);
      byte[] photo = Security.photo(context.body.get("photo"), 5 * 1024 * 1024);
      String id = Security.id();
      Files.write(store.directory.resolve("media/" + id + ".jpg"), photo);
      store
          .rows("media")
          .add(
              obj(
                  "id",
                  id,
                  "ownerId",
                  context.account.get("id"),
                  "public",
                  false,
                  "deleted",
                  false,
                  "at",
                  StoreRepository.now()));
      try {
        store.save();
      } catch (RuntimeException e) {
        Files.deleteIfExists(store.directory.resolve("media/" + id + ".jpg"));
        throw e;
      }
      context.send(obj("id", id, "url", "/media/" + id), 201);
      return true;
    }
    Matcher m = Pattern.compile("^/media/([a-f0-9-]+)$").matcher(context.path);
    if (m.matches() && context.method.equals("GET")) {
      Map<String, Object> item = find(store.rows("media"), "id", m.group(1));
      Path file = store.directory.resolve("media/" + m.group(1) + ".jpg");
      if (item == null
          || yes(item.get("deleted"))
          || (!yes(item.get("public"))
              && (context.account == null || !eq(item.get("ownerId"), context.account.get("id"))))
          || !Files.isRegularFile(file)) throw new ApiException("照片不存在", 404);
      context.response.setContentType("image/jpeg");
      context.response.setHeader(
          "Cache-Control", yes(item.get("public")) ? "private, max-age=60" : "private, no-store");
      Files.copy(file, context.response.getOutputStream());
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
