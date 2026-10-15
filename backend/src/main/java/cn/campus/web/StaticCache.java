package cn.campus.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.concurrent.ConcurrentHashMap;

/** Revalidate public program files; never cache API responses or account data. */
public final class StaticCache {
  private record Entry(long size, java.nio.file.attribute.FileTime modified, String tag) {}

  private final ConcurrentHashMap<Path, Entry> entries = new ConcurrentHashMap<>();

  public boolean notModified(HttpServletRequest request, HttpServletResponse response, Path file)
      throws Exception {
    var attributes = Files.readAttributes(file, BasicFileAttributes.class);
    var entry = entries.get(file);
    if (entry == null
        || entry.size() != attributes.size()
        || !entry.modified().equals(attributes.lastModifiedTime())) {
      var digest = MessageDigest.getInstance("SHA-256");
      try (var stream = new DigestInputStream(Files.newInputStream(file), digest)) {
        stream.transferTo(OutputStream.nullOutputStream());
      }
      entry = new Entry(attributes.size(), attributes.lastModifiedTime(),
          "W/\"" + HexFormat.of().formatHex(digest.digest()) + "\"");
      if (entries.size() > 2048) entries.clear();
      entries.put(file, entry);
    }
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("ETag", entry.tag());
    response.setDateHeader("Last-Modified", entry.modified().toMillis());
    var condition = request.getHeader("If-None-Match");
    boolean unchanged;
    if (condition != null) {
      var tag = entry.tag().substring(2);
      unchanged = Arrays.stream(condition.split(","))
          .map(String::trim)
          .anyMatch(value -> value.equals("*") || value.replaceFirst("^W/", "").equals(tag));
    } else {
      long since = -1;
      try { since = request.getDateHeader("If-Modified-Since"); }
      catch (IllegalArgumentException ignored) { }
      unchanged = since >= 0 && since / 1000 >= entry.modified().toMillis() / 1000;
    }
    if (unchanged) response.setStatus(HttpServletResponse.SC_NOT_MODIFIED);
    return unchanged;
  }
}
