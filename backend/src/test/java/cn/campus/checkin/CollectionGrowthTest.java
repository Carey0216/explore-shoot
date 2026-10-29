package cn.campus.checkin;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class CollectionGrowthTest {
  final Map<String,Object> atlas = obj("buildings",List.of(
      obj("id","a","frame","photo","area","东区","pointIds",List.of("p1","p1b")),
      obj("id","b","frame","photo","area","东区","pointIds",List.of("p2")),
      obj("id","duplicate","frame","plan","area","东区","pointIds",List.of("p3")),
      obj("id","unlinked","frame","photo","area","东区","pointIds",List.of())));
  Map<String,Object> visit(String id,String kind,String date){ return obj("pointId",id,"kind",kind,"createdAt",date); }
  List<Map<String,Object>> grow(List<Map<String,Object>> records){
    return CollectionGrowth.milestones(records,atlas,List.of(obj("id","fall","title","秋色","theme","autumn","published",true,
      "startsAt","2026-10-01T00:00:00Z","endsAt","2026-11-01T00:00:00Z","pointIds",List.of("p1","p2"))),Set.of("p1","p2"));
  }
  @Test void actualCheckinsOnlyAndDuplicateBuildingFramesDoNotInflateProgress(){
    var m=grow(List.of(visit("p1","task","2026-10-01T01:00:00Z"),visit("p2","checkin","invalid")));
    assertTrue(m.stream().noneMatch(r->yes(r.get("earned"))));
    m=grow(List.of(visit("p1","checkin","2026-10-01T01:00:00Z"),visit("p1b","checkin","2026-10-01T02:00:00Z")));
    assertTrue(yes(m.get(0).get("earned")));
    assertEquals(1,integer(m.get(1).get("progress")));
    assertEquals(2,integer(m.get(1).get("target")));
    assertEquals(List.of("p2"),m.get(1).get("nextPointIds"));
  }
  @Test void seasonCountsOnlyInsideDatesAndRecomputesAfterCheckinRemoval(){
    var early=visit("p1","checkin","2026-09-30T23:59:59Z");
    var last=visit("p2","checkin","2026-11-01T00:00:00Z");
    assertEquals(0,integer(grow(List.of(early,last)).get(2).get("progress")));
    var start=visit("p1","checkin","2026-10-01T00:00:00Z");
    var end=visit("p2","checkin","2026-10-31T23:59:59Z");
    var result=grow(List.of(start,end));
    assertTrue(result.stream().allMatch(r->yes(r.get("earned"))));
    assertEquals("2026-10-31T23:59:59Z",result.get(1).get("completedAt"));
    assertFalse(yes(grow(List.of(start)).get(2).get("earned")));
  }
  @Test void unpublishedPointNeverShrinksSeasonTargetOrCompletesArea(){
    var visits=List.of(visit("p1","checkin","2026-10-01T01:00:00Z"));
    var topics=List.of(obj("id","fall","title","秋色","theme","autumn","published",true,"startsAt","2026-10-01T00:00:00Z","endsAt","2026-11-01T00:00:00Z","pointIds",List.of("p1","hidden")));
    assertEquals(2,CollectionGrowth.milestones(visits,atlas,topics,Set.of("p1")).size());
    var hiddenAtlas=obj("buildings",List.of(rows(atlas.get("buildings")).getFirst(),obj("id","hidden","frame","photo","area","东区","pointIds",List.of(),"growthUnavailable",true)));
    var area=CollectionGrowth.milestones(visits,hiddenAtlas,List.of(),Set.of("p1")).get(1);
    assertEquals(2,integer(area.get("target")));
    assertFalse(yes(area.get("earned")));
  }
  @Test void visibleLinkedVisitStillLightsBuildingWithHiddenAlternative(){
    var mixed=obj("buildings",List.of(obj("id","a","frame","photo","area","东区","pointIds",List.of("p1"),"growthUnavailable",true)));
    var result=CollectionGrowth.milestones(List.of(visit("p1","checkin","2026-10-01T01:00:00Z")),mixed,List.of(),Set.of("p1"));
    assertTrue(yes(result.getFirst().get("earned")));
    assertTrue(yes(result.get(1).get("earned")));
    assertEquals(1,integer(result.get(1).get("target")));
  }
}
