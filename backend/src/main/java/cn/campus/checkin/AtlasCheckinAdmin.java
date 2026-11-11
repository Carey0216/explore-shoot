package cn.campus.checkin;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.common.RequestValues;
import cn.campus.storage.MediaService;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

/** Manage collection credit separately from original check-in records. */
final class AtlasCheckinAdmin {
  private static List<Map<String, Object>> revoked(
      ApiContext c, Object owner, String pointId, Map<String, Object> reset) {
    if (reset == null || str(reset.get("cutoff")).isEmpty()) return List.of();
    Instant cutoff = Instant.parse(str(reset.get("cutoff")));
    return c.store.indexed("checkins", "ownerId", str(owner)).stream()
        .filter(r -> eq(r.get("pointId"), pointId))
        .filter(r -> {
          try {
            return !Instant.parse(str(r.get("createdAt"))).isAfter(cutoff);
          } catch (RuntimeException malformed) {
            return false;
          }
        })
        .toList();
  }

  private static Map<String, Object> row(ApiContext c, Map<String, Object> user, String pointId) {
    Object owner = user.get("id");
    var reset = find(c.store.rows("passportCheckinResets"), "id", owner + ":" + pointId);
    var records = PassportProgressService.recordsFor(c, owner).stream()
        .filter(r -> eq(r.get("pointId"), pointId))
        .toList();
    var revoked = revoked(c, owner, pointId, reset);
    var recordIds = records.stream().map(r -> obj("id", r.get("id"), "at", r.get("createdAt"))).toList();
    var revokedIds = revoked.stream().map(r -> r.get("id")).toList();
    String marker = Security.digest(write(obj("active", recordIds, "revoked", revokedIds, "reset", reset)));
    return obj(
        "userId", owner, "username", user.get("username"), "nickname", user.get("nickname"),
        "activeCount", records.size(), "revokedCount", revoked.size(),
        "lastAt", records.stream().map(r -> str(r.get("createdAt"))).max(String::compareTo).orElse(""),
        "reset", !revoked.isEmpty(), "marker", marker);
  }

  static boolean handle(ApiContext c, MediaService media) throws Exception {
    if (!c.path.equals("/api/admin/passport/point-checkins")) return false;
    c.need();
    if (!cn.campus.admin.AdminPermissions.owner(c.account))
      throw new ApiException("仅顶级管理员可维护点位打卡统计", 403);
    boolean read = c.method.equals("GET");
    String pointId = read ? Objects.toString(c.request.getParameter("pointId"), "") : str(c.body.get("pointId"));
    if (find(c.store.rows("points"), "id", pointId) == null)
      throw new ApiException("点位不存在", 404);
    if (read) {
      var users = c.store.rows("users").stream()
          .filter(u -> !yes(u.get("deleted")))
          .map(u -> row(c, u, pointId))
          .filter(r -> integer(r.get("activeCount")) > 0 || yes(r.get("reset")))
          .sorted(Comparator.comparing(r -> str(r.get("nickname"))))
          .toList();
      c.send(obj("items", users, "pointId", pointId));
      return true;
    }
    if (!c.method.equals("POST")) throw new ApiException("接口不存在", 404);
    RequestValues.fields(c.body, "pointId", "userId", "marker", "action");
    var user = find(c.store.rows("users"), "id", c.body.get("userId"));
    if (user == null || yes(user.get("deleted"))) throw new ApiException("用户不存在", 404);
    var current = row(c, user, pointId);
    if (!eq(current.get("marker"), c.body.get("marker")))
      throw new ApiException("打卡统计已变化，请刷新后重试", 409);
    String action = str(c.body.get("action"));
    if (!Set.of("reset", "restore", "delete").contains(action))
      throw new ApiException("请选择有效操作");

    Object owner = user.get("id");
    String id = owner + ":" + pointId;
    var old = find(c.store.rows("passportCheckinResets"), "id", id);
    if (action.equals("delete")) {
      var records = revoked(c, owner, pointId, old);
      if (records.isEmpty()) throw new ApiException("没有已取消统计的原始打卡", 409);
      var evidence = records.stream()
          .map(r -> obj("id", r.get("id"), "createdAt", r.get("createdAt"), "checksum", Security.digest(write(r))))
          .toList();
      backup(c, obj("action", action, "before", old, "records", evidence));
      var mediaIds = new HashSet<>();
      for (var record : records) {
        mediaIds.add(record.get("mediaId"));
        CheckinService.removeRecord(c.store, record, "相关作品已由管理员移除，你的举报已结束。");
      }
      c.audit("删除已取消统计的点位打卡", pointId, "用户 " + owner + "，共 " + records.size() + " 条");
      c.store.bump();
      c.store.save();
      for (Object mediaId : mediaIds) media.purge(c.store, mediaId);
    } else {
      boolean reset = action.equals("reset");
      if (reset ? integer(current.get("activeCount")) == 0 : !yes(current.get("reset")))
        throw new ApiException("打卡统计已变化，请刷新后重试", 409);
      var next = obj(
          "id", id, "ownerId", owner, "pointId", pointId,
          "cutoff", reset ? StoreRepository.now() : "",
          "revision", old == null ? 1 : integer(old.get("revision")) + 1,
          "updatedAt", StoreRepository.now(), "actorId", c.account.get("id"));
      backup(c, obj("before", old, "after", next, "action", action));
      if (old == null) c.store.rows("passportCheckinResets").add(next);
      else {
        old.clear();
        old.putAll(next);
      }
      c.audit(reset ? "取消点位收集统计" : "恢复点位收集统计", pointId, "用户 " + owner + "，保留原始记录");
      c.store.save();
    }
    c.send(row(c, user, pointId));
    return true;
  }

  private static void backup(ApiContext c, Map<String, Object> snapshot) throws Exception {
    Path dir = c.store.directory.resolve("maintenance-backups/passport-checkins");
    Files.createDirectories(dir);
    Path file = dir.resolve(Security.id() + ".json");
    snapshot.put("actorId", c.account.get("id"));
    snapshot.put("savedAt", StoreRepository.now());
    String content = write(snapshot);
    Files.writeString(file, content, StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
    try {
      Files.setPosixFilePermissions(file, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
    } catch (UnsupportedOperationException ignored) {
      // Windows inherits the data directory ACL.
    }
    if (!Files.readString(file, StandardCharsets.UTF_8).equals(content))
      throw new ApiException("备份校验失败", 503);
  }
}
