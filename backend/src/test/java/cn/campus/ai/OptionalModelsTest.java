package cn.campus.ai;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.*;

import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.Test;

/** Optional real local models; only public test sentences, no live accounts or user content. */
class OptionalModelsTest {
  private final Path root = Path.of("..").toAbsolutePath().normalize();

  @Test
  void installedSixVoicesWarmAndProduceValidAudio() throws Exception {
    AiService service = new AiService(root, null, false);
    try {
      assumeTrue(
          yes(service.options().get("available")),
          "Optional offline voice models are not installed.");
      service.warmup();
      assertEquals("ready", map(service.options().get("warmup")).get("state"));
      assertEquals(36, integer(map(service.options().get("warmup")).get("ready")));
      var definition =
          parse(
              Files.readString(root.resolve("backend/src/main/resources/navigation-voices.json")));
      String text = str(map(definition.get("prompts")).get("start"));
      for (var voice : rows(definition.get("voices"))) {
        byte[] wav =
            service
                .synthesize(obj("voice", voice.get("id"), "text", text))
                .get(60, TimeUnit.SECONDS);
        assertTrue(wav.length >= 44);
        assertEquals("RIFF", new String(wav, 0, 4, java.nio.charset.StandardCharsets.US_ASCII));
        assertEquals("WAVE", new String(wav, 8, 4, java.nio.charset.StandardCharsets.US_ASCII));
      }
      System.out.println(
          "PASS real offline speech: six voices, 36 prepared prompts and reusable audio");
    } finally {
      service.close();
    }
  }
}
