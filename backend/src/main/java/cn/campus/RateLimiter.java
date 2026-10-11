package cn.campus;

import java.util.*;
import org.springframework.stereotype.Component;

@Component
public class RateLimiter {
  private record Entry(long until, int count) {}

  private final Map<String, Entry> entries = new HashMap<>();

  public synchronized void check(String key, int limit) {
    long now = TimeSource.now();
    entries.entrySet().removeIf(e -> e.getValue().until() < now);
    Entry old = entries.get(key),
        next = old == null ? new Entry(now + 60000, 1) : new Entry(old.until(), old.count() + 1);
    entries.put(key, next);
    if (next.count() > limit) throw new ApiException("操作过于频繁，请一分钟后再试", 429);
  }
}
