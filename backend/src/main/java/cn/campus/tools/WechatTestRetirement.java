package cn.campus.tools;

import static cn.campus.common.Json.*;

import cn.campus.common.Json;
import cn.campus.miniprogram.WechatTestAccounts;
import cn.campus.storage.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;

/** Offline, cohort-scoped retirement; persist the deletion queue before touching photo files. */
public final class WechatTestRetirement {
  public static int clean(StoreRepository store, boolean apply) throws Exception {
    try (var ignored = store.writeAccess()) {
      Set<String> users = new HashSet<>();
      for (var u : store.rows("users"))
        if (WechatTestAccounts.account(u)) users.add(str(u.get("id")));
      for (String id : users)
        if (!id.matches(MediaReferences.UUID)) throw new IllegalStateException("测试账号ID异常，未清理数据");
      var before = store.db;
      var after = Json.clone(before);
      List<String> files = new ArrayList<>();
      for (var row : store.rows("media"))
        if (users.contains(str(row.get("ownerId")))) {
          String id = str(row.get("id"));
          if (!id.matches(MediaReferences.UUID)) throw new IllegalStateException("测试照片ID异常");
          files.add("media/" + id + ".jpg");
        }
      for (String id : users) files.add("avatars/user-" + id + ".jpg");
      for (var pair :
          Map.ofEntries(
                  Map.entry("users", "id"),
                  Map.entry("auth", "accountId"),
                  Map.entry("wechatTestBindings", "userId"),
                  Map.entry("checkins", "ownerId"),
                  Map.entry("photographyPlans", "ownerId"),
                  Map.entry("announcementReceipts", "ownerId"),
                  Map.entry("sessions", "ownerId"),
                  Map.entry("works", "ownerId"),
                  Map.entry("pointReactions", "userId"),
                  Map.entry("notifications", "userId"),
                  Map.entry("applications", "userId"),
                  Map.entry("reports", "userId"),
                  Map.entry("workReports", "userId"),
                  Map.entry("media", "ownerId"),
                  Map.entry("audit", "actorId"))
              .entrySet())
        rows(after.get(pair.getKey()))
            .removeIf(row -> users.contains(str(row.get(pair.getValue()))));
      // Test identities are never bound to production identities; discard orphan test bindings too.
      after.remove("wechatTestBindings");
      MediaReferences.Index references;
      try {
        store.db = after;
        references = MediaReferences.index(store);
      } finally {
        store.db = before;
      }
      if (!references.complete()) throw new IllegalStateException("旧照片引用无法核对，暂不清理");
      for (String file : files)
        if (file.startsWith("media/") && references.contains(file.substring(6, 42)))
          throw new IllegalStateException("测试照片仍被其他内容引用，先解除引用再清理");
      if (!apply) return users.size();
      if (!users.isEmpty() || !rows(before.get("wechatTestBindings")).isEmpty()) {
        var queue = rows(after.computeIfAbsent("pendingWechatTestDeletes", k -> new ArrayList<>()));
        for (String file : files)
          if (queue.stream().noneMatch(q -> eq(q.get("file"), file))) queue.add(obj("file", file));
        try {
          store.db = after;
          store.save();
        } catch (RuntimeException e) {
          store.db = before;
          throw e;
        }
      }
      drain(store);
      return users.size();
    }
  }

  private static void drain(StoreRepository store) throws Exception {
    var queue = store.rows("pendingWechatTestDeletes");
    if (queue.isEmpty()) return;
    for (var entry : new ArrayList<>(queue)) {
      String relative = str(entry.get("file"));
      if (!relative.matches(
          "(?:media/" + MediaReferences.UUID + "|avatars/user-" + MediaReferences.UUID + ")\\.jpg"))
        throw new IllegalStateException("清理队列路径异常");
      Path file = store.directory.resolve(relative);
      if (!file.getParent().toRealPath().equals(file.getParent().toAbsolutePath().normalize())
          || Files.isSymbolicLink(file)) throw new IllegalStateException("清理路径不能是链接");
      try {
        if (relative.startsWith("media/")) PhotoVariants.remove(store, file);
        Files.deleteIfExists(file);
        queue.remove(entry);
      } catch (java.io.IOException e) {
        throw new IllegalStateException("测试账号已停用，照片清理队列保留；解除文件占用后重试", e);
      }
    }
    store.db.remove("pendingWechatTestDeletes");
    store.save();
  }

  public static void run(Path root, String[] args) throws Exception {
    if (args.length > 1 || args.length == 1 && !Set.of("--check", "--apply").contains(args[0]))
      throw new IllegalArgumentException("用法：retire-wechat-test [--check|--apply]；必须先停服");
    Path data =
        Path.of(System.getenv().getOrDefault("EXPLORE_DATA_DIR", root.resolve("data").toString()));
    if (!Files.isRegularFile(data.resolve("store-v2.json"))
        && !Files.isRegularFile(data.resolve("campus.mv.db")))
      throw new IllegalStateException("现有数据不存在");
    try (var store = new StoreRepository(root, data)) {
      boolean apply = args.length == 1 && args[0].equals("--apply");
      int count = clean(store, false);
      if (apply && WechatTestAccounts.hasData(store)) {
        Path directory = data.resolve("maintenance-backups");
        Files.createDirectories(directory);
        Path backup =
            directory.resolve("before-wechat-test-retirement-" + UUID.randomUUID() + ".zip");
        store.backup(backup);
        System.out.println("完整数据备份已校验：" + backup.getFileName());
        clean(store, true);
      }
      System.out.println((apply ? "已清理" : "待清理") + "微信测试账号：" + count + "；正式账号与绑定保留");
    }
  }
}
