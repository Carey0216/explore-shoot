package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.settings.RuntimeEnvironment;
import cn.campus.tools.EnvironmentTools;
import java.nio.channels.*;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class EnvironmentIsolationTest {
  @TempDir Path root;

  @Test
  void refusesLivePathsAndMismatchedIdentities() throws Exception {
    assertThrows(
        IllegalStateException.class,
        () -> RuntimeEnvironment.validate(root, root.resolve("data"), "test", true));
    Path unmarked = root.resolve("unmarked");
    Files.createDirectories(unmarked);
    Files.writeString(unmarked.resolve("store-v2.json"), "{}");
    assertThrows(
        IllegalStateException.class,
        () -> RuntimeEnvironment.validate(root, unmarked, "test", true));
    Path local = root.resolve("independent");
    RuntimeEnvironment.open(root, local, "development", true);
    assertThrows(
        IllegalStateException.class,
        () -> RuntimeEnvironment.open(root, local, "production", true));
    assertThrows(
        IllegalStateException.class, () -> RuntimeEnvironment.open(root, local, "test", true));
    assertThrows(
        IllegalArgumentException.class, () -> EnvironmentTools.directory(root, "production"));
  }

  @Test
  void resetRequiresIdentityAndStoppedProcessAndKeepsVerifiedBackup() throws Exception {
    Files.createDirectories(root.resolve("data"));
    Files.writeString(root.resolve("data/real.txt"), "REAL");
    Path data = EnvironmentTools.directory(root, "test");
    var identity = RuntimeEnvironment.open(root, data, "test", true);
    String id = str(identity.get("instanceId"));
    Files.writeString(data.resolve("fixture.txt"), "TEST");
    assertThrows(IllegalStateException.class, () -> EnvironmentTools.reset(root, "test", "wrong"));
    try (var channel =
            FileChannel.open(
                data.resolve(".java-backend.lock"),
                StandardOpenOption.CREATE,
                StandardOpenOption.WRITE);
        var lock = channel.lock()) {
      assertThrows(
          OverlappingFileLockException.class, () -> EnvironmentTools.reset(root, "test", id));
    }
    assertTrue(Files.exists(data.resolve("fixture.txt")));
    EnvironmentTools.reset(root, "test", id);
    assertFalse(Files.exists(data.resolve("fixture.txt")));
    assertTrue(Files.exists(data.resolve(".environment.json")));
    assertEquals("REAL", Files.readString(root.resolve("data/real.txt")));
    try (var files = Files.list(data.getParent().resolve("backups"))) {
      assertEquals(1, files.count());
    }
  }
}
