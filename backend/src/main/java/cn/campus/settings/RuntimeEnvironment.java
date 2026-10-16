package cn.campus.settings;

import static cn.campus.common.Json.*;

import cn.campus.common.Json;
import java.nio.file.*;
import java.util.*;

/** Disk identity prevents accidentally starting a development process against live data. */
public final class RuntimeEnvironment {
  public static final Set<String> NAMES = Set.of("development", "test", "pilot", "production");

  public static String current() {
    return System.getenv()
        .getOrDefault(
            "EXPLORE_ENV", "1".equals(System.getenv("EXPLORE_TEST_MODE")) ? "test" : "pilot");
  }

  public static void validate(Path root, Path data, String name, boolean explicit)
      throws Exception {
    if (!NAMES.contains(name)) throw new IllegalStateException("EXPLORE_ENV 配置无效");
    if (Set.of("development", "test").contains(name)
        && (!explicit
            || data.toAbsolutePath()
                .normalize()
                .equals(root.resolve("data").toAbsolutePath().normalize())
            || data.toAbsolutePath()
                .normalize()
                .startsWith(Path.of("/var/lib/explore-shoot/data").toAbsolutePath().normalize())))
      throw new IllegalStateException("开发 / 测试必须显式指定独立数据目录，不能使用试点数据目录");
    if (name.equals("production") && "test".equals(System.getenv("WECHAT_LOGIN_MODE")))
      throw new IllegalStateException("正式环境禁止测试微信登录");
    if (name.equals("production")
        && !Files.exists(data.resolve("store-v2.json"))
        && !Files.exists(data.resolve("bootstrap-admin.json"))
        && (System.getenv("ADMIN_PASSWORD") == null
            || System.getenv("ADMIN_PASSWORD").equals("Explore2026!")))
      throw new IllegalStateException("正式环境须配置独立初始管理员密码");
    Path marker = data.resolve(".environment.json");
    if (Files.exists(marker)) {
      var existing = parse(Files.readString(marker));
      if (!eq(existing.get("name"), name)) throw new IllegalStateException("数据目录环境不匹配；拒绝启动，数据未迁移");
      if (!str(existing.get("instanceId")).matches("[a-f0-9-]{36}"))
        throw new IllegalStateException("环境标识无效");
    } else if (Set.of("development", "test").contains(name)
        && Files.exists(data.resolve("store-v2.json"))) {
      throw new IllegalStateException("开发 / 测试不能接管无环境标记的已有业务数据");
    } else if (name.equals("production") && Files.exists(data.resolve("store-v2.json"))) {
      throw new IllegalStateException("正式环境不能直接接管旧试点 / 测试数据；请按正式迁移流程初始化");
    }
  }

  public static Map<String, Object> open(Path root, Path data, String name, boolean explicit)
      throws Exception {
    validate(root, data, name, explicit);
    Files.createDirectories(data);
    Path marker = data.resolve(".environment.json");
    if (!Files.exists(marker))
      Files.writeString(
          marker,
          Json.write(obj("name", name, "instanceId", UUID.randomUUID().toString())),
          StandardOpenOption.CREATE_NEW);
    return parse(Files.readString(marker));
  }

  public static String label(String name) {
    return switch (name) {
      case "development" -> "开发环境";
      case "test" -> "测试环境";
      case "production" -> "正式环境";
      default -> "开发探索试点";
    };
  }
}
