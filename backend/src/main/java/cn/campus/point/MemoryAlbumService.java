package cn.campus.point;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.*;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.file.Files;
import java.util.*;
import org.springframework.stereotype.Service;

/**
 * Private albums contain only explicitly selected, currently owned photos. No automatic sharing.
 */
@Service
public final class MemoryAlbumService {
  static Map<String, Object> ownedMedia(StoreRepository store, Object owner, Object id) {
    var m = find(store.rows("media"), "id", id);
    return m != null
            && eq(m.get("ownerId"), owner)
            && !yes(m.get("deleted"))
            && str(id).matches("[a-f0-9-]{36}")
            && Files.isRegularFile(store.directory.resolve("media/" + id + ".jpg"))
        ? m
        : null;
  }

  public static List<Map<String, Object>> candidates(StoreRepository store, Object owner) {
    var records = store.indexed("checkins", "ownerId", str(owner));
    var points = store.rows("points").stream().filter(p -> eq(p.get("authorId"), owner)).toList();
    var result = new ArrayList<Map<String, Object>>();
    for (var media : store.rows("media")) {
      if (ownedMedia(store, owner, media.get("id")) == null) continue;
      var record =
          records.stream()
              .filter(r -> eq(r.get("mediaId"), media.get("id")))
              .findFirst()
              .orElse(null);
      var point =
          points.stream()
              .filter(
                  p ->
                      eq(p.get("mediaId"), media.get("id"))
                          || list(p.get("mediaIds")).contains(media.get("id"))
                          || list(p.get("gallery")).contains("/media/" + media.get("id")))
              .findFirst()
              .orElse(null);
      result.add(
          obj(
              "mediaId",
              media.get("id"),
              "photo",
              "/media/" + media.get("id"),
              "sourceType",
              record != null ? "checkin" : point != null ? "point" : "photo",
              "sourceId",
              record != null ? record.get("id") : point != null ? point.get("id") : media.get("id"),
              "place",
              record != null ? record.get("pointName") : point != null ? point.get("name") : "校园照片",
              "date",
              record != null ? record.get("createdAt") : media.get("createdAt")));
    }
    result.sort(Comparator.comparing((Map<String, Object> m) -> str(m.get("date"))).reversed());
    return result;
  }

  public static Map<String, Object> view(StoreRepository store, Map<String, Object> album) {
    var out = copy(album);
    out.remove("ownerId");
    out.put(
        "items",
        rows(album.get("items")).stream()
            .map(
                i -> {
                  var item = copy(i);
                  boolean available =
                      ownedMedia(store, album.get("ownerId"), i.get("mediaId")) != null;
                  item.put("available", available);
                  item.put("photo", available ? "/media/" + i.get("mediaId") : null);
                  return item;
                })
            .toList());
    return out;
  }

  public boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("user") || !c.path.startsWith("/api/my/memories")) return false;
    c.need();
    cn.campus.settings.InteractionFeatures.require(c.store, "memories");
    Object owner = c.account.get("id");
    if (c.route("/api/my/memories/candidates", "GET")) {
      int page = 1;
      try {
        page = Integer.parseInt(Objects.toString(c.request.getParameter("page"), "1"));
      } catch (Exception ignored) {
      }
      if (page < 1 || page > 1000) throw new ApiException("页码无效");
      var all = candidates(c.store, owner);
      int from = Math.min(all.size(), (page - 1) * 48), to = Math.min(all.size(), from + 48);
      c.send(
          obj(
              "items",
              all.subList(from, to),
              "page",
              page,
              "hasMore",
              to < all.size(),
              "total",
              all.size()));
      return true;
    }
    var albums = c.store.rows("memoryAlbums");
    if (c.route("/api/my/memories", "GET")) {
      c.send(
          obj(
              "items",
              albums.stream()
                  .filter(a -> eq(a.get("ownerId"), owner))
                  .sorted(
                      Comparator.comparing((Map<String, Object> a) -> str(a.get("updatedAt")))
                          .reversed())
                  .map(a -> view(c.store, a))
                  .toList()));
      return true;
    }
    boolean create = c.route("/api/my/memories", "POST");
    if (!create && !c.path.matches("/api/my/memories/[a-f0-9-]{36}")) return false;
    var album = create ? null : find(albums, "id", c.path.substring(c.path.lastIndexOf('/') + 1));
    if (!create && (album == null || !eq(album.get("ownerId"), owner)))
      throw new ApiException("回忆册不存在", 404);
    if (c.method.equals("GET")) {
      c.send(view(c.store, album));
      return true;
    }
    if (!Set.of("POST", "PUT", "DELETE").contains(c.method)) return false;
    if (!create
        && (!whole(c.body.get("revision"))
            || integer(c.body.get("revision")) != integer(album.get("revision"))))
      throw new ApiException("回忆册已在其他设备更新，请重新载入", 409);
    if (c.method.equals("DELETE")) {
      albums.remove(album);
      c.store.save();
      c.send(obj("ok", true));
      return true;
    }
    RequestValues.fields(c.body, "revision", "title", "theme", "message", "items");
    if (create && albums.stream().filter(a -> eq(a.get("ownerId"), owner)).count() >= 30)
      throw new ApiException("最多保留30本回忆册");
    String title = RequestValues.text(c.body, "title", "", 80, true),
        theme = RequestValues.text(c.body, "theme", "semester", 20, true),
        message = RequestValues.text(c.body, "message", "", 500, false);
    if (!Set.of("semester", "graduation", "custom").contains(theme))
      throw new ApiException("回忆册主题无效");
    var input = rows(c.body.get("items"));
    if (input.isEmpty() || input.size() > 24) throw new ApiException("请主动选择1至24张本人照片");
    var choices = candidates(c.store, owner);
    var seen = new HashSet<String>();
    var items = new ArrayList<Map<String, Object>>();
    for (var raw : input) {
      RequestValues.fields(raw, "mediaId", "caption");
      String id = str(raw.get("mediaId"));
      if (!seen.add(id)) throw new ApiException("同一张照片不能重复加入");
      var candidate = find(choices, "mediaId", id);
      if (candidate == null) throw new ApiException("请选择自己仍可访问的照片", 403);
      var item = copy(candidate);
      item.remove("photo");
      item.put("caption", RequestValues.text(raw, "caption", "", 140, false));
      items.add(item);
    }
    if (create)
      album =
          obj(
              "id",
              Security.id(),
              "ownerId",
              owner,
              "createdAt",
              StoreRepository.now(),
              "revision",
              0);
    album.putAll(
        obj(
            "title",
            title,
            "theme",
            theme,
            "message",
            message,
            "items",
            items,
            "updatedAt",
            StoreRepository.now(),
            "revision",
            integer(album.get("revision")) + 1));
    if (create) albums.add(album);
    c.store.save();
    c.send(view(c.store, album), create ? 201 : 200);
    return true;
  }
}
