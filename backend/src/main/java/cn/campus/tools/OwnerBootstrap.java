package cn.campus.tools;

import static cn.campus.common.Json.*;

import cn.campus.admin.AdminPermissions;
import cn.campus.auth.Security;
import cn.campus.storage.StoreRepository;
import java.io.*;
import java.nio.file.*;
import java.util.*;

/**
 * Offline, explicit, one-time owner creation. No published default password or automatic upgrade.
 */
public final class OwnerBootstrap {
  public static void run(Path root, String[] args) throws Exception {
    if (args.length != 1)
      throw new IllegalArgumentException("用法：owner-bootstrap <账号>；先停服，密码由标准输入提供");
    String name = Security.username(args[0]);
    Path data =
        Path.of(System.getenv().getOrDefault("EXPLORE_DATA_DIR", root.resolve("data").toString()));
    try (var store = new StoreRepository(root, data)) {
      if (AdminPermissions.ownerExists(store))
        throw new IllegalStateException("顶级管理员已存在；请在账户设置中修改，不会重置密码或再建一个");
      if (store.rows("admins").stream()
          .anyMatch(a -> eq(a.get("username"), name) && !yes(a.get("deleted"))))
        throw new IllegalStateException("账号已存在，需人工核实，未覆盖");
      String password =
          new BufferedReader(
                  new InputStreamReader(System.in, java.nio.charset.StandardCharsets.UTF_8))
              .readLine();
      Security.password(password);
      Path backups = data.resolve("maintenance-backups");
      Files.createDirectories(backups);
      store.backup(backups.resolve("before-owner-" + UUID.randomUUID() + ".zip"));
      store
          .rows("admins")
          .add(
              obj(
                  "id",
                  Security.id(),
                  "username",
                  name,
                  "name",
                  "顶级管理员",
                  "role",
                  "owner",
                  "enabled",
                  true,
                  "passwordHash",
                  Security.hashPassword(password),
                  "createdAt",
                  StoreRepository.now(),
                  "permissionRevision",
                  0));
      store.audit(
          obj("id", "maintenance", "username", "maintenance", "role", "owner"),
          "初始化唯一顶级管理员",
          name,
          "离线初始化；无密码或密钥记录",
          "local",
          "admin");
      store.save();
      System.out.println("已建立唯一顶级管理员；未改动原管理员和用户数据。");
    }
  }
}
