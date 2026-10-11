package cn.campus.tools;

import cn.campus.Json;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.CountDownLatch;

/** Small command-line tools share the same Java build as the backend. */
public final class ProjectTools {
  public static Path root() {
    return Path.of(
            System.getenv().getOrDefault("EXPLORE_PROJECT_ROOT", System.getProperty("user.dir")))
        .toAbsolutePath()
        .normalize();
  }

  public static void run(String tool, String[] args) throws Exception {
    List<String> options = Arrays.asList(args);
    switch (tool) {
      case "i18n" -> I18nGenerator.run(root(), args);
      case "dev" -> DevTools.run(root(), args);
      case "release" -> new ReleasePublisher(root()).run(args);
      case "history" -> new HistoryTools(root()).run(args);
      case "map-refresh" -> MapRefresh.run(root(), args);
      case "addresses" ->
          System.out.println(
              Json.write(PhoneBridge.addresses(options.contains("--include-virtual"))));
      case "phone-entry" -> {
        PhoneEntry.write(root(), options.contains("--stopped"));
        System.out.println("Phone entry: http://admin.localhost:4176/phone-test.html");
      }
      case "phone-bridge" -> {
        String lan =
            options.stream()
                .filter(a -> a.startsWith("--lan="))
                .map(a -> a.substring(6))
                .findFirst()
                .orElse(null);
        boolean publicMode = options.contains("--public");
        String origin;
        if (lan != null) {
          if (PhoneBridge.addresses(false).stream().noneMatch(a -> a.get("address").equals(lan)))
            throw new IllegalArgumentException("Choose an IPv4 address on this computer.");
          origin = "http://" + lan + ":4178";
        } else {
          origin = System.getenv("PUBLIC_TEST_ORIGIN");
          if (!publicMode
              || origin == null
              || !origin.matches("https://[a-z0-9-]+\\.trycloudflare\\.com"))
            throw new IllegalArgumentException("Public mode requires an approved HTTPS origin.");
        }
        PhoneBridge bridge =
            new PhoneBridge(
                origin, lan == null ? "127.0.0.1" : lan, publicMode ? 4179 : 4178, 4174);
        Runtime.getRuntime().addShutdownHook(new Thread(bridge::close));
        bridge.start();
        System.out.println("Phone test: " + origin + "\nAdmin remains local on port 4176.");
        new CountDownLatch(1).await();
      }
      default -> throw new IllegalArgumentException("Unknown project tool: " + tool);
    }
  }
}
