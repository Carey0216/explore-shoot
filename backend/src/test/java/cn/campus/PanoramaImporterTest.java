package cn.campus;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.tools.PanoramaImporter;
import java.awt.image.BufferedImage;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PanoramaImporterTest {
  @TempDir Path root;

  private Path input() throws Exception {
    Path input = root.resolve("input");
    Files.createDirectories(input.resolve("faces"));
    Files.writeString(
        input.resolve("manifest.json"),
        write(
            obj(
                "source",
                "https://www.720yun.com/t/20ajz0smen0?scene_id=8753864",
                "scenes",
                List.of(obj("id", 8753864, "faceSize", 4)))));
    for (String id : List.of("r", "l", "u", "d", "b", "f"))
      ImageIO.write(
          new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB),
          "jpg",
          input.resolve("faces/face_" + id + ".jpg").toFile());
    return input;
  }

  @Test
  void preservesEveryFaceAndRecordsProvenanceWithoutImportingHtml() throws Exception {
    Path input = input(), output = root.resolve("output");
    Files.writeString(input.resolve("全景图_离线查看器.html"), "untrusted HTML");
    PanoramaImporter.importFaces(input, output);
    var manifest = parse(Files.readString(output.resolve("manifest.json")));
    assertEquals("cube", manifest.get("projection"));
    for (var item : list(manifest.get("faces"))) {
      var face = map(item);
      String name = str(face.get("file"));
      byte[] expected = Files.readAllBytes(input.resolve("faces").resolve(name));
      assertArrayEquals(expected, Files.readAllBytes(output.resolve(name)));
      assertEquals(
          HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(expected)),
          face.get("sha256"));
    }
    assertFalse(Files.exists(output.resolve("全景图_离线查看器.html")));
    assertFalse(Files.readString(output.resolve("manifest.json")).contains(input.toString()));
  }

  @Test
  void incompleteOrMismatchedInputLeavesExistingDestinationIntact() throws Exception {
    Path input = input(), output = root.resolve("output");
    Files.createDirectories(output);
    Files.writeString(output.resolve("manifest.json"), "existing");
    Files.delete(input.resolve("faces/face_f.jpg"));
    assertThrows(Exception.class, () -> PanoramaImporter.importFaces(input, output));
    assertEquals("existing", Files.readString(output.resolve("manifest.json")));
    assertFalse(Files.exists(output.resolve("face_r.jpg")));
    ImageIO.write(
        new BufferedImage(4, 3, BufferedImage.TYPE_INT_RGB),
        "jpg",
        input.resolve("faces/face_f.jpg").toFile());
    assertThrows(IllegalArgumentException.class, () -> PanoramaImporter.importFaces(input, output));
    assertEquals("existing", Files.readString(output.resolve("manifest.json")));
  }
}
