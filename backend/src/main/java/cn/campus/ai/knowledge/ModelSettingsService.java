package cn.campus.ai.knowledge;

import static cn.campus.common.Json.*;

import cn.campus.admin.AdminPermissions;
import cn.campus.auth.Security;
import cn.campus.common.*;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.springframework.stereotype.Service;

/** Write-only credential, encrypted outside business rows. OS account owns key and ciphertext. */
@Service
public final class ModelSettingsService {
  private final CompatibleModelClient model;
  private final StoreRepository store;
  private long revision;

  public ModelSettingsService(StoreRepository store, CompatibleModelClient model) throws Exception {
    this.store = store;
    this.model = model;
    Path file = folder().resolve("provider.enc");
    if (Files.exists(file)) {
      var b =
          parse(
              new String(
                  crypt(Cipher.DECRYPT_MODE, Files.readAllBytes(file)), StandardCharsets.UTF_8));
      model.configure(
          new CompatibleModelClient.Configuration(
              str(b.get("base")), str(b.get("model")), str(b.get("key"))));
      revision = integer(b.get("revision"));
    }
  }

  private Path folder() {
    return store.directory.resolve("secrets/assistant");
  }

  private void protect(Path p) throws Exception {
    if (Files.getFileStore(p).supportsFileAttributeView("posix"))
      Files.setPosixFilePermissions(
          p,
          java.nio.file.attribute.PosixFilePermissions.fromString(
              Files.isDirectory(p) ? "rwx------" : "rw-------"));
    else {
      var acl = Files.getFileAttributeView(p, java.nio.file.attribute.AclFileAttributeView.class);
      if (acl != null)
        acl.setAcl(
            List.of(
                java.nio.file.attribute.AclEntry.newBuilder()
                    .setType(java.nio.file.attribute.AclEntryType.ALLOW)
                    .setPrincipal(Files.getOwner(p))
                    .setPermissions(
                        java.util.EnumSet.allOf(java.nio.file.attribute.AclEntryPermission.class))
                    .build()));
    }
  }

  private byte[] crypt(int mode, byte[] input) throws Exception {
    Path dir = folder();
    Files.createDirectories(dir);
    protect(dir);
    Path key = dir.resolve("master.key");
    if (!Files.exists(key)) {
      if (mode == Cipher.DECRYPT_MODE) throw new IllegalStateException("模型保护密钥缺失，请恢复完整备份");
      byte[] bytes = new byte[32];
      new SecureRandom().nextBytes(bytes);
      Files.write(key, bytes, StandardOpenOption.CREATE_NEW);
      protect(key);
    }
    byte[] nonce = new byte[12];
    if (mode == Cipher.ENCRYPT_MODE) new SecureRandom().nextBytes(nonce);
    else {
      if (input.length < 28) throw new IllegalStateException("模型配置损坏");
      System.arraycopy(input, 0, nonce, 0, 12);
    }
    var cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(
        mode, new SecretKeySpec(Files.readAllBytes(key), "AES"), new GCMParameterSpec(128, nonce));
    byte[] result =
        cipher.doFinal(
            mode == Cipher.ENCRYPT_MODE ? input : Arrays.copyOfRange(input, 12, input.length));
    if (mode == Cipher.DECRYPT_MODE) return result;
    byte[] full = Arrays.copyOf(nonce, nonce.length + result.length);
    System.arraycopy(result, 0, full, 12, result.length);
    return full;
  }

  public boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("admin") || !c.path.equals("/api/admin/ai-settings")) return false;
    AdminPermissions.ownerOnly(c);
    var current = model.configuration();
    if (c.method.equals("GET")) {
      c.send(
          obj(
              "base",
              current.base(),
              "model",
              current.model(),
              "keyConfigured",
              !current.key().isEmpty(),
              "revision",
              revision));
      return true;
    }
    if (!c.method.equals("PUT")) return false;
    RequestValues.fields(c.body, "base", "model", "key", "clearKey", "currentPassword", "revision");
    if (!whole(c.body.get("revision")) || integer(c.body.get("revision")) != revision)
      throw new ApiException("模型配置已更新，请重新载入", 409);
    if (!Security.verifyPassword(
        Security.text(c.body.get("currentPassword"), 129), c.account.get("passwordHash")))
      throw new ApiException("当前密码不正确", 403);
    String key = RequestValues.text(c.body, "key", "", 1000, false);
    if (key.isEmpty()) key = RequestValues.flag(c.body, "clearKey", false) ? "" : current.key();
    var next =
        new CompatibleModelClient.Configuration(
            RequestValues.text(c.body, "base", "", 500, false),
            RequestValues.text(c.body, "model", "", 150, false),
            key);
    try {
      if (!next.base().isEmpty()) next.endpoint();
    } catch (IllegalArgumentException e) {
      throw new ApiException("模型接口须为有效HTTPS地址，或本机回环HTTP地址");
    }
    long nextRevision = revision + 1;
    byte[] encoded =
        crypt(
            Cipher.ENCRYPT_MODE,
            write(
                    obj(
                        "base",
                        next.base(),
                        "model",
                        next.model(),
                        "key",
                        next.key(),
                        "revision",
                        nextRevision))
                .getBytes(StandardCharsets.UTF_8));
    Path tmp = folder().resolve("provider.tmp"), file = folder().resolve("provider.enc");
    Files.write(tmp, encoded);
    protect(tmp);
    Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    protect(file);
    model.configure(next);
    revision = nextRevision;
    c.audit("更新AI模型配置", "assistant", "密钥仅写入受保护配置，不回传");
    c.store.save();
    c.send(obj("ok", true));
    return true;
  }
}
