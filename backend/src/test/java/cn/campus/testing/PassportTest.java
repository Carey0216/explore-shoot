package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import cn.campus.checkin.PassportService;
import java.util.*;
import org.junit.jupiter.api.Test;

class PassportTest {
  @Test
  void completedTasksAndPrivateCheckinsCountOncePerLocationButKeepRepeatedVisits() {
    var records =
        PassportService.records(
            List.of(
                obj(
                    "id",
                    "new",
                    "pointId",
                    "a",
                    "createdAt",
                    "2026-10-10T12:00:00Z",
                    "mediaId",
                    "photo")),
            List.of(
                obj(
                    "id",
                    "old",
                    "createdAt",
                    "2026-10-09T12:00:00Z",
                    "tasks",
                    List.of(
                        obj("id", "done", "pointId", "a", "status", "done"),
                        obj("id", "skipped", "pointId", "b", "status", "skip"),
                        obj("id", "removed", "pointId", "offline", "status", "done")))));
    assertEquals(3, records.size());
    assertEquals("new", records.getFirst().get("id"));
    assertEquals("task", records.getLast().get("kind"));
    assertTrue(yes(records.getLast().get("legacyTime")));
    var summary = PassportService.summary(records, List.of(obj("id", "a"), obj("id", "b")));
    assertEquals(3, summary.get("visits"));
    assertEquals(2, summary.get("unique"));
    assertEquals(1L, summary.get("current"));
    assertEquals(1L, summary.get("photos"));
    assertEquals(List.of("a", "offline"), summary.get("ids"));
    assertEquals(0, PassportService.summary(List.of(), List.of()).get("visits"));
  }
}
