package cn.campus.auth;

import cn.campus.common.ApiException;
import cn.campus.common.Json;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import org.bouncycastle.crypto.generators.SCrypt;

public final class Security {
  private static final SecureRandom RANDOM = new SecureRandom();

  public static String id() {
    return UUID.randomUUID().toString();
  }

  public static String token() {
    byte[] b = new byte[32];
    RANDOM.nextBytes(b);
    return HexFormat.of().formatHex(b);
  }

  public static String digest(String text) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public static String hashPassword(String password) {
    byte[] bytes = new byte[16];
    RANDOM.nextBytes(bytes);
    String salt = HexFormat.of().formatHex(bytes);
    return "scrypt:"
        + salt
        + ":"
        + HexFormat.of()
            .formatHex(
                SCrypt.generate(
                    password.getBytes(StandardCharsets.UTF_8),
                    salt.getBytes(StandardCharsets.UTF_8),
                    16384,
                    8,
                    1,
                    64));
  }

  public static boolean verifyPassword(Object password, Object hash) {
    try {
      String[] p = Json.str(hash).split(":");
      if (p.length != 3 || !p[0].equals("scrypt")) return false;
      byte[] expected = HexFormat.of().parseHex(p[2]);
      byte[] actual =
          SCrypt.generate(
              Json.str(password).getBytes(StandardCharsets.UTF_8),
              p[1].getBytes(StandardCharsets.UTF_8),
              16384,
              8,
              1,
              64);
      return MessageDigest.isEqual(expected, actual);
    } catch (Exception e) {
      return false;
    }
  }

  public static String text(Object value, int limit) {
    String s = Json.str(value).trim();
    return s.substring(0, Math.min(s.length(), limit));
  }

  public static String text(Object value) {
    return text(value, 2000);
  }

  public static String password(Object value) {
    if (!(value instanceof String s) || s.length() < 8 || s.length() > 128)
      throw new ApiException("密码需为 8—128 个字符");
    return (String) value;
  }

  public static String username(Object value) {
    String name = text(value, 32).toLowerCase(Locale.ROOT);
    if (!name.matches("[a-z0-9_]{3,32}")) throw new ApiException("账号需为 3—32 位字母、数字或下划线");
    return name;
  }

  public static String escape(Object value) {
    return Objects.toString(value, "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;");
  }

  public static byte[] photo(Object photo, int max) {
    String s = Json.str(photo);
    if (!s.matches("data:image/jpeg;base64,[A-Za-z0-9+/=]+")) throw new ApiException("照片格式无效");
    byte[] b;
    try {
      b = Base64.getDecoder().decode(s.substring(s.indexOf(',') + 1));
    } catch (Exception e) {
      throw new ApiException("照片格式无效");
    }
    if (b.length > max)
      throw new ApiException(max <= 1024 * 1024 ? "处理后头像请小于 1MB" : "处理后照片请小于 5MB");
    return cleanJPEG(b);
  }

  public static byte[] cleanJPEG(byte[] buffer) {
    if (buffer.length < 4 || (buffer[0] & 255) != 255 || (buffer[1] & 255) != 216)
      throw new ApiException("照片格式无效，请重新上传");
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.write(buffer, 0, 2);
    int offset = 2;
    while (offset + 1 < buffer.length) {
      if ((buffer[offset] & 255) != 255) throw new ApiException("照片数据无效");
      int marker = buffer[offset + 1] & 255;
      if (marker == 218 || marker == 217) {
        out.write(buffer, offset, buffer.length - offset);
        return out.toByteArray();
      }
      if (offset + 4 > buffer.length) throw new ApiException("照片数据不完整");
      int length = ((buffer[offset + 2] & 255) << 8) | (buffer[offset + 3] & 255);
      if (length < 2 || offset + 2 + length > buffer.length) throw new ApiException("照片数据不完整");
      if (marker != 225 && marker != 237 && marker != 254) out.write(buffer, offset, length + 2);
      offset += length + 2;
    }
    throw new ApiException("照片数据不完整");
  }
}
