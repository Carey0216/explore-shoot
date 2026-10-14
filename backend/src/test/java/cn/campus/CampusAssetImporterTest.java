package cn.campus;

import static org.junit.jupiter.api.Assertions.*;

import cn.campus.tools.CampusAssetImporter;
import java.awt.image.BufferedImage;
import java.nio.*;
import java.nio.file.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CampusAssetImporterTest {
  @TempDir Path temporary;

  private Path inputs() throws Exception {
    Path folder = Files.createDirectory(temporary.resolve("inputs"));
    for (String file :
        new String[] {
          "clocktower-material-atlas-v1.png",
          "campus-brick-atlas-v1.png",
          "library-facade-v1.png",
          "gym-facade-v1.png",
          "campus-landscape-atlas-v1.png",
          "campus-tree-v1.png"
        }) {
      var image =
          new BufferedImage(
              64,
              64,
              file.contains("tree") ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
      ImageIO.write(image, "png", folder.resolve(file).toFile());
    }
    Files.write(
        folder.resolve("clocktower-textured-v2.glb"),
        ByteBuffer.allocate(20)
            .order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x46546c67)
            .putInt(2)
            .putInt(20)
            .array());
    return folder;
  }

  @Test
  void incompleteLateInputDoesNotReplaceExistingTextures() throws Exception {
    var source = inputs();
    var root = Files.createDirectory(temporary.resolve("project"));
    Path target = root.resolve("dist/shared/campus-assets/textures/ivory.jpg");
    Files.createDirectories(target.getParent());
    Files.writeString(target, "keep old material");
    Files.delete(source.resolve("campus-tree-v1.png"));
    assertThrows(
        Exception.class, () -> CampusAssetImporter.run(root, new String[] {source.toString()}));
    assertEquals("keep old material", Files.readString(target));
    assertFalse(Files.exists(root.resolve("dist/shared/campus-assets/manifest.json")));
  }

  @Test
  void packsAlphaAndMatchingRegistryWithoutChangingSource() throws Exception {
    var source = inputs();
    var original = Files.readAllBytes(source.resolve("campus-tree-v1.png"));
    var root = Files.createDirectory(temporary.resolve("project"));
    Files.createDirectories(root.resolve("backend/src/main/resources"));
    CampusAssetImporter.run(root, new String[] {source.toString()});
    assertArrayEquals(
        original, Files.readAllBytes(root.resolve("dist/shared/campus-assets/textures/tree.png")));
    assertArrayEquals(original, Files.readAllBytes(source.resolve("campus-tree-v1.png")));
    assertEquals(
        Files.readString(root.resolve("dist/shared/campus-assets/manifest.json")),
        Files.readString(root.resolve("backend/src/main/resources/campus-assets.json")));
    assertFalse(
        Files.readString(root.resolve("backend/src/main/resources/campus-assets.json"))
            .contains(temporary.toString()));
  }
}
