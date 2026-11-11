package cn.campus.checkin;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;
import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import org.junit.jupiter.api.Test;
import java.util.*;

class AtlasSyncTest {
  Map<String,Object> sample() {
    String geometry = write(obj("photo", obj("imageWidth", 100, "imageHeight", 100), "plan", obj()));
    var buildings = List.of(obj("id", "photo:roof-1", "name", "图书馆", "pointIds", List.of("p1"),
        "revision", 1, "outline", List.of(List.of(1,1), List.of(20,1), List.of(20,20)), "holes", List.of()));
    String content = write(obj("geometryChecksum", Security.digest(geometry), "buildings", buildings));
    String payload = write(obj("geometry", geometry, "geometryChecksum", Security.digest(geometry),
        "buildings", buildings, "content", content, "contentChecksum", Security.digest(content)));
    return obj("schema", "jingyu-atlas/1", "payload", payload, "checksum", Security.digest(payload));
  }
  @Test void refusesCorruptPayloadAndInvalidGeometryBeforeInitialization() {
    var good = sample(); assertEquals(1, rows(AtlasSync.verified(good).get("buildings")).size());
    good.put("payload", str(good.get("payload")) + " ");
    assertThrows(ApiException.class, () -> AtlasSync.verified(good));
    var bad = sample(); var payload = parse(str(bad.get("payload")));
    rows(payload.get("buildings")).getFirst().put("outline", List.of(List.of(1,1), List.of(120,1), List.of(20,20)));
    String content = write(obj("geometryChecksum", payload.get("geometryChecksum"), "buildings", payload.get("buildings")));
    payload.put("content", content); payload.put("contentChecksum", Security.digest(content));
    bad.put("payload", write(payload)); bad.put("checksum", Security.digest(write(payload)));
    assertThrows(ApiException.class, () -> AtlasSync.verified(bad));
  }
  @Test void importingSourceNeverOverwritesLiveEditsEvenWithALowerLiveRevision() {
    var live = new ArrayList<Map<String,Object>>();
    live.add(obj("id", "photo:roof-1", "name", "云端正在标注的名称", "revision", 1, "pointIds", List.of("cloud")));
    var before = write(live.getFirst());
    var snapshot = List.of(obj("id", "photo:roof-1", "name", "旧本机名称", "revision", 100),
        obj("id", "photo:roof-2", "name", "新环境基础建筑", "revision", 2));
    assertTrue(AtlasSync.mergeMissing(live, snapshot));
    assertEquals(before, write(live.getFirst()));
    assertEquals(2, live.size());
    assertFalse(AtlasSync.mergeMissing(live, snapshot), "Restart must be idempotent");
    assertEquals(before, write(live.getFirst()));
  }
}
