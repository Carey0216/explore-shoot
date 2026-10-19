package cn.campus.web;

import static cn.campus.common.Json.*;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/**
 * Bounded, process-local metrics. No parameters, bodies, identities or credentials are retained.
 */
public final class RuntimeMetrics {
  private static final ConcurrentHashMap<String, Sample> routes = new ConcurrentHashMap<>();
  private static final long started = System.currentTimeMillis();

  private static final class Sample {
    final LongAdder count = new LongAdder(), errors = new LongAdder(), nanos = new LongAdder();
    final AtomicLong max = new AtomicLong();
    final AtomicLongArray buckets = new AtomicLongArray(8);
  }

  private static final long[] bounds = {10, 50, 100, 250, 500, 1000, 5000, Long.MAX_VALUE};

  public static void record(String method, String path, int status, long nanos) {
    if (!path.startsWith("/api/")) return;
    String key = method + " " + path.replaceAll("[A-Za-z0-9_-]{24,}", ":id");
    if (routes.size() >= 180 && !routes.containsKey(key)) key = "other";
    var s = routes.computeIfAbsent(key, k -> new Sample());
    s.count.increment();
    if (status >= 400) s.errors.increment();
    s.nanos.add(nanos);
    s.max.accumulateAndGet(nanos, Math::max);
    long ms = nanos / 1000000;
    for (int i = 0; i < bounds.length; i++)
      if (ms <= bounds[i]) {
        s.buckets.incrementAndGet(i);
        break;
      }
  }

  public static Map<String, Object> snapshot() {
    var items = new ArrayList<Map<String, Object>>();
    long calls = 0, errors = 0, uploads = 0, failed = 0;
    for (var e : routes.entrySet()) {
      var s = e.getValue();
      long n = s.count.sum(), err = s.errors.sum();
      calls += n;
      errors += err;
      if (e.getKey().equals("POST /api/media")) {
        uploads += n;
        failed += err;
      }
      long target = (long) Math.ceil(n * .95), sum = 0, p95 = 0;
      for (int i = 0; i < bounds.length; i++) {
        sum += s.buckets.get(i);
        if (sum >= target) {
          p95 = bounds[i] == Long.MAX_VALUE ? -1 : bounds[i];
          break;
        }
      }
      items.add(
          obj(
              "route",
              e.getKey(),
              "requests",
              n,
              "errors",
              err,
              "averageMs",
              n == 0 ? 0 : s.nanos.sum() / 1000000d / n,
              "maxMs",
              s.max.get() / 1000000d,
              "p95UpperMs",
              p95));
    }
    items.sort(
        Comparator.comparingDouble(
                (Map<String, Object> m) -> ((Number) m.get("averageMs")).doubleValue())
            .reversed());
    return obj(
        "since",
        java.time.Instant.ofEpochMilli(started).toString(),
        "requests",
        calls,
        "errors",
        errors,
        "errorRate",
        calls == 0 ? 0 : errors / (double) calls,
        "uploads",
        uploads,
        "uploadFailures",
        failed,
        "uploadFailureRate",
        uploads == 0 ? 0 : failed / (double) uploads,
        "routes",
        items);
  }
}
