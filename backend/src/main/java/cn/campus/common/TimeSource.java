package cn.campus.common;

import java.nio.file.*;

/** Clock injection is available only in explicitly isolated test mode, never via HTTP input. */
public final class TimeSource {
  public static long now() {
    long now = System.currentTimeMillis();
    String file = System.getenv("EXPLORE_TEST_CLOCK");
    if ("1".equals(System.getenv("EXPLORE_TEST_MODE")) && file != null)
      try {
        return now + Long.parseLong(Files.readString(Path.of(file)).trim());
      } catch (Exception e) {
        throw new IllegalStateException("Invalid test clock");
      }
    return now;
  }
}
