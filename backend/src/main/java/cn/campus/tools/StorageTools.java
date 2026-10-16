package cn.campus.tools;

import cn.campus.storage.StoreRepository;
import java.nio.file.*;
import java.util.*;

/** Offline backup/export keeps SQL consistent; never accepts SQL supplied by an administrator. */
public final class StorageTools {
  public static void run(Path root, String[] args) throws Exception {
    if (args.length != 2 || !Set.of("backup", "export-json").contains(args[0]))
      throw new IllegalArgumentException("用法：storage backup|export-json <不存在的输出文件>；先停止本环境服务");
    Path data =
        Path.of(System.getenv().getOrDefault("EXPLORE_DATA_DIR", root.resolve("data").toString()))
            .toAbsolutePath()
            .normalize();
    if (!Files.exists(data.resolve("campus.mv.db")) && !Files.exists(data.resolve("store-v2.json")))
      throw new IllegalStateException("现有数据不存在，拒绝创建空数据");
    Path output = Path.of(args[1]).toAbsolutePath().normalize();
    if (Files.exists(output) || output.startsWith(data))
      throw new IllegalArgumentException("输出须在数据目录外且不能覆盖已有文件");
    Files.createDirectories(output.getParent());
    try (var store = new StoreRepository(root, data)) {
      if (args[0].equals("backup")) store.backup(output);
      else Files.writeString(output, store.exportJson(), StandardOpenOption.CREATE_NEW);
    }
    System.out.println("已完成并保留原数据：" + output.getFileName());
  }
}
