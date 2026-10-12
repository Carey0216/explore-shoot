package cn.campus.storage;

import static cn.campus.common.Json.*;

import java.nio.file.*;
import java.util.*;
import java.util.regex.*;

/** Includes offline points, private records, retained unknown content fields and the v1 archive. */
public final class MediaReferences {
  private MediaReferences() {}

  public static final String UUID = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
  private static final Pattern URL = Pattern.compile("/media/(" + UUID + ")(?![a-f0-9-])");
  private static final Set<String> SYSTEM =
      Set.of(
          "media",
          "auth",
          "audit",
          "logs",
          "settings",
          "pendingMediaDeletes",
          "pendingUnusedMediaDeletes");

  public record Index(Set<String> ids, boolean complete) {
    public boolean contains(String id) {
      return !complete || ids.contains(id);
    }
  }

  public static Index index(StoreRepository store) {
    Set<String> ids = new HashSet<>();
    store.db.forEach(
        (key, value) -> {
          if (!SYSTEM.contains(key)) collect(value, ids);
        });
    Path legacy = store.directory.resolve("store.json");
    if (Files.exists(legacy))
      try {
        collect(parse(Files.readString(legacy)), ids);
      } catch (Exception e) {
        return new Index(ids, false);
      }
    return new Index(ids, true);
  }

  private static void collect(Object value, Set<String> ids) {
    if (value instanceof Map<?, ?> m) m.values().forEach(v -> collect(v, ids));
    else if (value instanceof List<?> l) l.forEach(v -> collect(v, ids));
    else if (value instanceof String s) {
      if (s.matches(UUID)) ids.add(s);
      Matcher m = URL.matcher(s);
      while (m.find()) ids.add(m.group(1));
    }
  }

  public static boolean referenced(StoreRepository store, Object id) {
    return index(store).contains(str(id));
  }
}
