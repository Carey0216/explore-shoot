package cn.campus.tools;

import static cn.campus.common.Json.*;

import java.nio.file.*;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.*;
import javax.imageio.ImageIO;

/**
 * Imports supplied local cube faces unchanged. Never executes the supplied HTML or accesses URLs.
 */
public final class PanoramaImporter {
  public static void run(Path root, String[] args) throws Exception {
    if (args.length != 1) throw new IllegalArgumentException("用法：panorama <本机全景资料目录>");
    importFaces(Path.of(args[0]), root.resolve("dist/shared/panorama"));
    System.out.println("已导入六面实景全景；原图未修改，单点全景不生成测绘坐标或建筑高度。");
  }

  public static void importFaces(Path input, Path output) throws Exception {
    input = input.toRealPath();
    Path sourceFile = input.resolve("manifest.json");
    if (Files.size(sourceFile) > 65536) throw new IllegalArgumentException("全景清单过大");
    var manifest = parse(Files.readString(sourceFile));
    String source = str(manifest.get("source"));
    if (!source.matches("https://www\\.720yun\\.com/t/[A-Za-z0-9]+\\?scene_id=[0-9]+"))
      throw new IllegalArgumentException("全景来源格式无效");
    var scenes = list(manifest.get("scenes"));
    if (scenes.size() != 1) throw new IllegalArgumentException("当前导入工具需要一个全景场景");
    var scene = map(scenes.getFirst());
    int size = (int) num(scene.get("faceSize"));
    if (size < 1 || size > 4096) throw new IllegalArgumentException("全景面尺寸须在1至4096之间");
    List<Map<String, Object>> faces = new ArrayList<>();
    List<Path> files = new ArrayList<>();
    for (String id : List.of("r", "l", "u", "d", "b", "f")) {
      String name = "face_" + id + ".jpg";
      Path path = input.resolve("faces").resolve(name).toRealPath();
      if (!path.startsWith(input) || Files.size(path) > 10_000_000)
        throw new IllegalArgumentException("图片路径或大小无效：" + name);
      // Read dimensions before decoding; reject disguised files and oversized decompression inputs.
      try (var stream = ImageIO.createImageInputStream(path.toFile())) {
        var readers = ImageIO.getImageReaders(stream);
        if (!readers.hasNext()) throw new IllegalArgumentException("无法读取全景图片：" + name);
        var reader = readers.next();
        try {
          reader.setInput(stream);
          if (!reader.getFormatName().equalsIgnoreCase("JPEG")
              || reader.getWidth(0) != size
              || reader.getHeight(0) != size)
            throw new IllegalArgumentException("全景面必须是同尺寸正方形JPEG：" + name);
          reader.read(0);
        } finally {
          reader.dispose();
        }
      }
      byte[] bytes = Files.readAllBytes(path);
      String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
      faces.add(obj("id", id, "file", name, "sha256", hash, "bytes", bytes.length));
      files.add(path);
    }
    // Validate the complete input before writing any destination. Publish the manifest last.
    Files.createDirectories(output);
    for (int i = 0; i < files.size(); i++)
      Files.copy(
          files.get(i),
          output.resolve(str(faces.get(i).get("file"))),
          StandardCopyOption.REPLACE_EXISTING);
    Files.writeString(
        output.resolve("manifest.json"),
        write(
                obj(
                    "title",
                    "北方民族大学空中全景导航",
                    "projection",
                    "cube",
                    "faceSize",
                    size,
                    "source",
                    source,
                    "sceneId",
                    scene.get("id"),
                    "importedAt",
                    LocalDate.now().toString(),
                    "captureDate",
                    "未知；以照片内原有标注为准",
                    "faces",
                    faces,
                    "notice",
                    "单一拍摄位置实景全景，非摄影测量三维重建；不能用于导航定位。"))
            + "\n");
  }
}
