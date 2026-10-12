package cn.campus.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;

/** JSON helpers keep the existing on-disk schema and browser API compatible. */
public final class Json {
  public static final ObjectMapper MAPPER = new ObjectMapper();

  public static Map<String, Object> obj(Object... pairs) {
    Map<String, Object> out = new LinkedHashMap<>();
    for (int i = 0; i < pairs.length; i += 2) out.put((String) pairs[i], pairs[i + 1]);
    return out;
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> map(Object v) {
    return v instanceof Map ? (Map<String, Object>) v : obj();
  }

  @SuppressWarnings("unchecked")
  public static List<Map<String, Object>> rows(Object v) {
    return v instanceof List ? (List<Map<String, Object>>) v : new ArrayList<>();
  }

  @SuppressWarnings("unchecked")
  public static List<Object> list(Object v) {
    return v instanceof List ? (List<Object>) v : new ArrayList<>();
  }

  public static String str(Object v) {
    return v instanceof String s ? s : "";
  }

  public static boolean yes(Object v) {
    return Boolean.TRUE.equals(v);
  }

  public static double num(Object v) {
    return v instanceof Number n ? n.doubleValue() : Double.NaN;
  }

  public static long integer(Object v) {
    return v instanceof Number n ? n.longValue() : 0;
  }

  public static boolean whole(Object v) {
    double n = num(v);
    return Double.isFinite(n) && n == Math.rint(n) && Math.abs(n) <= 9007199254740991d;
  }

  public static boolean eq(Object a, Object b) {
    return Objects.equals(a, b);
  }

  public static Map<String, Object> copy(Map<String, Object> value) {
    return new LinkedHashMap<>(value);
  }

  public static Map<String, Object> clone(Map<String, Object> value) {
    return parse(write(value));
  }

  public static Map<String, Object> parse(String value) {
    try {
      Object v = MAPPER.readValue(value, Object.class);
      if (!(v instanceof Map)) throw new IllegalArgumentException();
      return map(v);
    } catch (Exception e) {
      throw new ApiException("请求格式无效", 400);
    }
  }

  public static String write(Object value) {
    try {
      return MAPPER.writeValueAsString(value);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public static Map<String, Object> find(List<Map<String, Object>> rows, String key, Object value) {
    return rows.stream().filter(r -> eq(r.get(key), value)).findFirst().orElse(null);
  }
}
