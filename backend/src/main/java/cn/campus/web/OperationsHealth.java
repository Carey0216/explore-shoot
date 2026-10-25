package cn.campus.web;

import static cn.campus.common.Json.*;

import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.LongAdder;

/** Aggregated health only: no image URLs, user text, account IDs, tokens or locations. */
public final class OperationsHealth {
  private static final Map<String, LongAdder> client =
      new java.util.concurrent.ConcurrentHashMap<>();

  public static void report(String kind, String platform) {
    if (!Set.of("image-failed", "network-failed", "save-failed").contains(kind)
        || !Set.of("web", "mini").contains(platform))
      throw new cn.campus.common.ApiException("诊断类别无效");
    client.computeIfAbsent(platform + ":" + kind, k -> new LongAdder()).increment();
  }

  public static Map<String, Object> snapshot(cn.campus.storage.StoreRepository store) {
    var counts = obj();
    client.forEach((k, v) -> counts.put(k, v.sum()));
    var backup = obj("available", false, "message", "尚无可核验的备份回执");
    Path path = store.directory.resolve("maintenance/backup-status.json");
    try {
      if (Files.isRegularFile(path) && Files.size(path) < 16000) {
        var raw = parse(Files.readString(path));
        for (String k :
            List.of(
                "available",
                "createdAt",
                "sha256",
                "verified",
                "restoreVerifiedAt",
                "restoredFiles",
                "databaseReadable",
                "message")) if (raw.containsKey(k)) backup.put(k, raw.get(k));
      }
    } catch (Exception e) {
      backup.put("message", "备份回执无法读取，请检查维护记录");
    }
    return obj(
        "clientFailures",
        counts,
        "weather",
        cn.campus.point.CampusWeatherService.health(),
        "backup",
        backup,
        "notice",
        "客户端诊断仅汇总次数；断网时无法立即上报，重启后进程计数归零。");
  }
}
