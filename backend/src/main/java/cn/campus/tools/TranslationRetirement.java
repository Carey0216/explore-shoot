package cn.campus.tools;

import static cn.campus.common.Json.*;

import cn.campus.storage.StoreRepository;
import java.nio.file.*;
import java.util.*;

/** Offline maintenance: discard only the retired preference, never content written by users. */
public final class TranslationRetirement {
  public static int clean(StoreRepository store, boolean apply) {
    int changed = 0;
    for (String type : List.of("users", "admins"))
      for (var account : store.rows(type)) {
        var preferences = map(account.get("preferences"));
        if (!preferences.containsKey("language")) continue;
        changed++;
        if (apply) {
          var next = copy(preferences);
          next.remove("language");
          account.put("preferences", next);
          account.put("preferencesRevision", integer(account.get("preferencesRevision")) + 1);
        }
      }
    if (apply && changed > 0) store.save();
    return changed;
  }

  public static void run(Path root, String[] args) throws Exception {
    if (args.length > 1 || args.length == 1 && !Set.of("--check", "--apply").contains(args[0]))
      throw new IllegalArgumentException("用法：retire-translation [--check|--apply]；操作前停止服务并备份数据");
    Path directory =
        Path.of(System.getenv().getOrDefault("EXPLORE_DATA_DIR", root.resolve("data").toString()));
    if (!Files.isRegularFile(directory.resolve("store-v2.json")))
      throw new IllegalStateException("现有数据不存在，不创建新的用户数据");
    boolean apply = args.length == 1 && args[0].equals("--apply");
    try (var store = new StoreRepository(root, directory)) {
      System.out.println(
          (apply ? "已清理" : "待清理") + "旧语言偏好：" + clean(store, apply) + " 个账号；账号和作品数据保留");
    }
  }
}
