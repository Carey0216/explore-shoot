package cn.campus.tools;

import static cn.campus.common.Json.*;

import java.awt.image.BufferedImage;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.*;
import javax.imageio.*;

/** Packages locally reviewed AI display assets; does not upload files or contact a provider. */
public final class CampusAssetImporter {
  public static void run(Path root, String[] args) throws Exception {
    if (args.length != 1) throw new IllegalArgumentException("用法：campus-assets <本机素材目录>");
    Path source = Path.of(args[0]).toRealPath();
    Path target = root.resolve("dist/shared/campus-assets");
    var textures = new ArrayList<Map<String, Object>>();
    String[][] names = {
      {"ivory", "clocktower-material-atlas-v1.png"},
      {"brick", "campus-brick-atlas-v1.png"},
      {"library", "library-facade-v1.png"},
      {"gym", "gym-facade-v1.png"},
      {"landscape", "campus-landscape-atlas-v1.png"},
      {"tree", "campus-tree-v1.png"}
    };
    Path model = source.resolve("clocktower-textured-v3.glb").toRealPath();
    if (!model.startsWith(source) || Files.size(model) > 64_000_000)
      throw new IllegalArgumentException("模型大小无效");
    var bytes = Files.readAllBytes(model);
    var header = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
    if (bytes.length < 20
        || header.getInt() != 0x46546c67
        || header.getInt() != 2
        || header.getInt() != bytes.length) throw new IllegalArgumentException("模型必须为完整GLB 2.0");
    var validated = new LinkedHashMap<String, BufferedImage>();
    for (var pair : names) {
      Path input = source.resolve(pair[1]).toRealPath();
      if (!input.startsWith(source) || Files.size(input) > 32_000_000)
        throw new IllegalArgumentException("素材路径或大小无效");
      BufferedImage image;
      try (var stream = ImageIO.createImageInputStream(input.toFile())) {
        var readers = ImageIO.getImageReaders(stream);
        if (!readers.hasNext()) throw new IllegalArgumentException("素材不是图片");
        var reader = readers.next();
        try {
          reader.setInput(stream);
          if (reader.getWidth(0) > 4096 || reader.getHeight(0) > 4096)
            throw new IllegalArgumentException("素材尺寸过大");
          image = reader.read(0);
        } finally {
          reader.dispose();
        }
      }
      boolean alpha = pair[0].equals("tree");
      if (alpha && !image.getColorModel().hasAlpha())
        throw new IllegalArgumentException("树木素材需要透明通道");
      validated.put(pair[0], image);
    }
    Files.createDirectories(target.resolve("textures"));
    Files.createDirectories(target.resolve("models"));
    for (var pair : names) {
      Path input = source.resolve(pair[1]).toRealPath();
      BufferedImage image = validated.get(pair[0]);
      boolean alpha = pair[0].equals("tree");
      String filename = pair[0] + (alpha ? ".png" : ".jpg");
      Path output = target.resolve("textures").resolve(filename);
      if (alpha) Files.copy(input, output, StandardCopyOption.REPLACE_EXISTING);
      else {
        var rgb =
            new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_RGB);
        var graphics = rgb.createGraphics();
        graphics.drawImage(image, 0, 0, null);
        graphics.dispose();
        var writer = ImageIO.getImageWritersByFormatName("JPEG").next();
        try (var stream = ImageIO.createImageOutputStream(output.toFile())) {
          writer.setOutput(stream);
          var settings = writer.getDefaultWriteParam();
          settings.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
          settings.setCompressionQuality(.91f);
          writer.write(null, new IIOImage(rgb, null, null), settings);
        } finally {
          writer.dispose();
        }
      }
      textures.add(
          obj(
              "id",
              pair[0],
              "url",
              "/shared/campus-assets/textures/" + filename,
              "width",
              image.getWidth(),
              "height",
              image.getHeight(),
              "bytes",
              Files.size(output),
              "sha256",
              sha(output),
              "original",
              pair[1],
              "originalSHA256",
              sha(input),
              "source",
              "AI辅助生成；依据用户提供的全景或材质参考，非实测立面",
              "estimated",
              true));
    }
    Path output = target.resolve("models/clock.glb");
    Files.copy(model, output, StandardCopyOption.REPLACE_EXISTING);
    var registry =
        obj(
            "version",
            1,
            "generatedAt",
            LocalDate.now().toString(),
            "textures",
            textures,
            "models",
            List.of(
                obj(
                    "id",
                    "clock",
                    "url",
                    "/shared/campus-assets/models/clock.glb",
                    "bytes",
                    bytes.length,
                    "sha256",
                    sha(output),
                    "rotation",
                    0,
                    "source",
                    "用户全景与AI正交参考；平直建筑构件重建；连续立面UV；非摄影测量",
                    "license",
                    "项目生成展示资源；仅估算展示；原腾讯试验模型留在本机",
                    "estimated",
                    true)));
    Files.writeString(target.resolve("manifest.json"), write(registry) + "\n");
    Files.writeString(
        root.resolve("backend/src/main/resources/campus-assets.json"), write(registry) + "\n");
    System.out.println("已打包6组材质与钟楼模型，原始素材保留。此工具只写本机，不发布或上传。");
  }

  private static String sha(Path path) throws Exception {
    return HexFormat.of()
        .formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)));
  }
}
