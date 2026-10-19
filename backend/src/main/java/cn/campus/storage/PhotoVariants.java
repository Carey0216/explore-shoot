package cn.campus.storage;

import cn.campus.common.ApiException;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import javax.imageio.*;
import javax.imageio.stream.ImageInputStream;

/** Small disk cache, no original image retained in heap; callers must authorize before serving. */
public final class PhotoVariants {
  private static final java.util.concurrent.atomic.LongAdder
      hits = new java.util.concurrent.atomic.LongAdder(),
      misses = new java.util.concurrent.atomic.LongAdder();

  public static Map<String, Object> statistics() {
    return cn.campus.common.Json.obj(
        "hits", hits.sum(), "misses", misses.sum(), "scope", "当前进程启动以来的磁盘缩略图命中，不代表浏览器缓存命中");
  }

  private PhotoVariants() {}

  private static String key(Path original) throws IOException {
    return cn.campus.auth.Security.digest(
        original.toAbsolutePath()
            + ":"
            + Files.size(original)
            + ":"
            + Files.getLastModifiedTime(original)
            + ":480-v1");
  }

  /** Delete a derivative before removing its source; never generate an image during cleanup. */
  public static synchronized void remove(StoreRepository store, Path original) throws IOException {
    if (!Files.isRegularFile(original, LinkOption.NOFOLLOW_LINKS)) return;
    Path cache = store.directory.resolve("cache/thumbnails");
    if (!Files.exists(cache)) return;
    if (Files.isSymbolicLink(cache) || !cache.toRealPath().startsWith(store.directory.toRealPath()))
      throw new IOException("Invalid thumbnail cache");
    Files.deleteIfExists(cache.resolve(key(original) + ".jpg"));
  }

  public static byte[] jpeg(byte[] input, int edge, float quality) throws IOException {
    try (ImageInputStream stream =
        ImageIO.createImageInputStream(new ByteArrayInputStream(input))) {
      var readers = ImageIO.getImageReaders(stream);
      if (!readers.hasNext()) throw new ApiException("照片无法读取，请重新选择");
      var reader = readers.next();
      BufferedImage image;
      try {
        reader.setInput(stream);
        int w = reader.getWidth(0), h = reader.getHeight(0);
        if (w <= 0 || h <= 0 || (long) w * h > 120_000_000L) throw new ApiException("照片尺寸过大，请先缩小");
        var param = reader.getDefaultReadParam();
        int sample = Math.max(1, Math.max(w, h) / edge);
        param.setSourceSubsampling(sample, sample, 0, 0);
        image = reader.read(0, param);
      } finally {
        reader.dispose();
      }
      double scale = Math.min(1, (double) edge / Math.max(image.getWidth(), image.getHeight()));
      var result =
          new BufferedImage(
              Math.max(1, (int) Math.round(image.getWidth() * scale)),
              Math.max(1, (int) Math.round(image.getHeight() * scale)),
              BufferedImage.TYPE_INT_RGB);
      var g = result.createGraphics();
      try {
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, result.getWidth(), result.getHeight());
        g.setRenderingHint(
            RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.drawImage(image, 0, 0, result.getWidth(), result.getHeight(), null);
      } finally {
        g.dispose();
        image.flush();
      }
      var writer = ImageIO.getImageWritersByFormatName("jpeg").next();
      try (var bytes = new ByteArrayOutputStream();
          var output = ImageIO.createImageOutputStream(bytes)) {
        writer.setOutput(output);
        var param = writer.getDefaultWriteParam();
        param.setCompressionMode(javax.imageio.ImageWriteParam.MODE_EXPLICIT);
        param.setCompressionQuality(quality);
        writer.write(null, new IIOImage(result, null, null), param);
        output.flush();
        return bytes.toByteArray();
      } finally {
        writer.dispose();
        result.flush();
      }
    }
  }

  public static synchronized Path thumbnail(StoreRepository store, Path original)
      throws IOException {
    Path cache = store.directory.resolve("cache/thumbnails");
    Files.createDirectories(cache);
    if (Files.isSymbolicLink(cache) || !cache.toRealPath().startsWith(store.directory.toRealPath()))
      throw new IOException("Invalid thumbnail cache");
    String key = key(original);
    Path target = cache.resolve(key + ".jpg");
    if (Files.isRegularFile(target, LinkOption.NOFOLLOW_LINKS)) {
      hits.increment();
      return target;
    }
    misses.increment();
    byte[] photo = jpeg(Files.readAllBytes(original), 480, .72f);
    var temp = Files.createTempFile(cache, "variant-", ".tmp");
    try {
      Files.write(temp, photo);
      Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
    } finally {
      Files.deleteIfExists(temp);
    }
    try (var paths = Files.list(cache)) {
      var old =
          paths
              .filter(
                  p ->
                      p.getFileName().toString().matches("[a-f0-9]{64}\\.jpg") && !p.equals(target))
              .sorted(
                  Comparator.comparingLong(
                      p -> {
                        try {
                          return Files.getLastModifiedTime(p).toMillis();
                        } catch (IOException e) {
                          return 0L;
                        }
                      }))
              .toList();
      for (int i = 0; i < old.size() - 255; i++) Files.deleteIfExists(old.get(i));
    }
    return target;
  }
}
