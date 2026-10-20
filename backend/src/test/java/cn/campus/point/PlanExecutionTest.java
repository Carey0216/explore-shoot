package cn.campus.point;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class PlanExecutionTest {
  @Test
  void overnightWindowBelongsToItsStartDayAndEndIsExclusive() {
    var windows =
        PlanExecution.windows(List.of(obj("days", List.of(1), "start", "22:00", "end", "02:00")));
    assertTrue(PlanExecution.within(windows, ZonedDateTime.parse("2026-10-19T23:00:00+08:00")));
    assertTrue(PlanExecution.within(windows, ZonedDateTime.parse("2026-10-20T01:00:00+08:00")));
    assertFalse(PlanExecution.within(windows, ZonedDateTime.parse("2026-10-20T02:00:00+08:00")));
    assertFalse(PlanExecution.within(windows, ZonedDateTime.parse("2026-10-20T23:00:00+08:00")));
    assertThrows(
        RuntimeException.class,
        () ->
            PlanExecution.windows(
                List.of(obj("days", List.of(0), "start", "08:00", "end", "18:00"))));
    assertThrows(
        RuntimeException.class,
        () ->
            PlanExecution.windows(
                List.of(obj("days", List.of(1), "start", "25:00", "end", "18:00"))));
  }
}
