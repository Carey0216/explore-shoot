package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Release820ContractTest {
  @TempDir Path temporary;
  @Test void scheduledBatchIsPreviewedAtomicRevisionCheckedAndBackedUp() throws Exception {
    try(var app=new ApiFixture(temporary)){
      var admin=app.admin();admin.login("admin");var guest=app.user();
      for(String asset:List.of("chat-plan", "collection-growth", "task-workbench"))
        assertTrue(((String)guest.request("/shared/"+asset+".css","GET",null,200)).contains("820"));
      var point=rows(guest.get("/api/catalog").get("points")).getFirst();
      var topic=admin.send("/api/admin/topics","POST",obj("title","秋色计划","description","原介绍","theme","autumn","startsAt",Instant.now().toString(),"endsAt",Instant.now().plusSeconds(7200).toString(),"pointIds",List.of(point.get("id")),"ruleIds",List.of(),"published",true),201);
      guest.request("/api/admin/task-workbench","GET",null,404);
      assertFalse(rows(admin.get("/api/admin/task-workbench").get("tasks")).isEmpty());
      var body=obj("items",List.of(obj("id",topic.get("id"),"revision",1)),"action","schedule","publishAt",Instant.now().plusSeconds(60).toString(),"unpublishAt",Instant.now().plusSeconds(120).toString());
      var preview=admin.send("/api/admin/task-workbench/topic-batch/preview","POST",body,200);
      assertEquals(1,rows(guest.get("/api/topics").get("items")).size());
      body.put("confirmation","incorrect");admin.send("/api/admin/task-workbench/topic-batch/apply","POST",body,409);
      body.put("confirmation",preview.get("confirmation"));admin.send("/api/admin/task-workbench/topic-batch/apply","POST",body,200);
      assertTrue(rows(guest.get("/api/topics").get("items")).isEmpty());
      try(var files=Files.list(app.directory.resolve("data/maintenance-backups/topic-batches"))){assertEquals(2,files.count());}
      admin.send("/api/admin/task-workbench/topic-batch/apply","POST",body,409);
      app.advance(90000);assertEquals(1,rows(guest.get("/api/topics").get("items")).size());
      app.advance(90000);assertTrue(rows(guest.get("/api/topics").get("items")).isEmpty());
      var stale=obj("items",List.of(obj("id",topic.get("id"),"revision",2),obj("id",UUID.randomUUID().toString(),"revision",1)),"action","publish");
      admin.send("/api/admin/task-workbench/topic-batch/preview","POST",stale,404);
      assertEquals(2,integer(rows(admin.get("/api/admin/topics").get("items")).getFirst().get("revision")));
    }
  }
  @Test void timelineIsPrivatePagedNativeAccessibleAndRemovedPhotoDisappears() throws Exception {
    try(var app=new ApiFixture(temporary)){
      var a=app.user();a.register("timeline_alice","");var b=app.user();b.register("timeline_bob","");
      var point=rows(a.get("/api/catalog").get("points")).stream().filter(p->yes(p.get("open"))).findFirst().orElseThrow();
      String photo="data:image/jpeg;base64,"+Base64.getEncoder().encodeToString(Files.readAllBytes(app.root.resolve("dist/shared/nmu-library.jpg")));
      var upload=a.send("/api/media","POST",obj("photo",photo),201);
      var record=a.send("/api/checkins","POST",obj("submissionId",UUID.randomUUID().toString(),"pointId",point.get("id"),"note","只属于我的留言","mediaId",upload.get("id")),201);
      var timeline=a.get("/api/my/passport/timeline?point="+point.get("id"));
      assertEquals(1,rows(timeline.get("items")).size());assertTrue(write(timeline).contains("只属于我的留言"));
      assertFalse(write(timeline).contains("ownerId"));assertFalse(write(timeline).contains("location"));
      assertTrue(rows(b.get("/api/my/passport/timeline?record="+record.get("id")).get("items")).isEmpty());
      var login=a.send("/api/mini/auth/login","POST",obj("username","timeline_alice","password",ApiFixture.PASSWORD),200);
      var nativeClient=app.user();var nativeResult=map(nativeClient.request("/api/mini/my/passport/timeline?point="+point.get("id"),"GET",null,200,Map.of("Authorization","Bearer "+str(login.get("token")))));
      assertEquals(1,rows(nativeResult.get("items")).size());
      a.request("/api/my/passport/timeline?page=0","GET",null,400);
      a.request("/api/checkins/"+record.get("id"),"DELETE",null,200);
      assertTrue(rows(a.get("/api/my/passport/timeline").get("items")).isEmpty());
    }
  }
}
