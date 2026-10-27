package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Release813ContractTest {
 @TempDir Path temp;
 @Test void atlasHistoryPreviewRestoreAndCreditResetAreScopedReversibleAndBackedUp()throws Exception{
  try(var app=new ApiFixture(temp)){
   app.promoteFixtureOwner();
   var admin=app.admin();admin.login("admin");var anon=app.admin();var user=app.user();user.register("atlas_demo","");
   var catalog=user.get("/api/catalog");Object point=rows(catalog.get("points")).getFirst().get("id");
   var atlas=map(admin.get("/api/admin/passport").get("atlas"));
   var b=rows(atlas.get("buildings")).stream().filter(r->eq(r.get("frame"),"photo")).findFirst().orElseThrow();
   Object id=b.get("id");String name=str(b.get("name"));
   admin.send("/api/admin/passport/buildings","PUT",obj("id",id,"revision",0,"name",name,"pointIds",List.of(point)),200);
   admin.send("/api/admin/passport/buildings","PUT",obj("id",id,"revision",1,"name","历史验收建筑","pointIds",List.of(point)),200);
   var history=rows(admin.get("/api/admin/passport/history").get("items"));assertEquals(2,history.size());assertFalse(str(history.getFirst().get("actorName")).isBlank());
   var snap=admin.get("/api/admin/passport/history/"+history.getFirst().get("snapshotId"));
   assertFalse(snap.containsKey("actorId"));assertEquals(name,map(snap.get("before")).get("name"));
   var restore=obj("id",id,"revision",2,"restoreFrom",snap.get("snapshotId"),"checksum",snap.get("checksum"));
   var saved=admin.send("/api/admin/passport/buildings","PUT",restore,200);assertEquals(name,saved.get("name"));assertEquals(3,integer(saved.get("revision")));
   admin.request("/api/admin/passport/buildings","PUT",restore,409);
   anon.request("/api/admin/passport/history","GET",null,401);
   var record=user.send("/api/checkins","POST",obj("pointId",point,"note","PRIVATE TEST NOTE","submissionId",UUID.randomUUID().toString()),201);
   assertNotNull(map(record.get("passportEvents")).get("atlas"));
   var retried=user.send("/api/checkins","POST",obj("pointId",point,"note","PRIVATE TEST NOTE","submissionId",record.get("submissionId")),200);
   assertEquals(record.get("id"),retried.get("id"));assertNotNull(map(retried.get("passportEvents")).get("revisit"));assertTrue(rows(map(retried.get("passportEvents")).get("buildings")).isEmpty());
   var revisit=user.send("/api/checkins","POST",obj("pointId",point,"note","又一次足迹","submissionId",UUID.randomUUID().toString()),201);
   assertTrue(rows(map(revisit.get("passportEvents")).get("buildings")).isEmpty());
   assertNotNull(map(revisit.get("passportEvents")).get("revisit"),"Repeat real check-ins replay honestly without inventing a new unlock");
   var participants=rows(admin.get("/api/admin/passport/point-checkins?pointId="+point).get("items"));assertEquals(1,participants.size());assertFalse(write(participants).contains("PRIVATE TEST NOTE"));
   var row=participants.getFirst();var reset=obj("pointId",point,"userId",row.get("userId"),"marker",row.get("marker"),"action","reset");
   admin.send("/api/admin/passport/point-checkins","POST",reset,200);admin.request("/api/admin/passport/point-checkins","POST",reset,409);
   var progress=user.get("/api/my/passport");assertFalse(yes(find(rows(map(progress.get("atlas")).get("buildings")),"id",id).get("collected")));
   assertTrue(write(app.data()).contains("PRIVATE TEST NOTE"));
   var replay=user.send("/api/checkins","POST",obj("pointId",point,"note","new visit","submissionId",UUID.randomUUID().toString()),201);
   assertNotNull(map(replay.get("passportEvents")).get("atlas"),"A new real check-in must produce the building drop again");
   row=rows(admin.get("/api/admin/passport/point-checkins?pointId="+point).get("items")).getFirst();
   admin.send("/api/admin/passport/point-checkins","POST",obj("pointId",point,"userId",row.get("userId"),"marker",row.get("marker"),"action","restore"),200);
   assertEquals(3,rows(admin.get("/api/admin/passport/history").get("items")).size());
  }
 }
 @Test void nativeMultipartUsesTheSamePrivateAttachmentOwnershipAndIdempotency()throws Exception{
  try(var app=new ApiFixture(temp)){
   var user=app.user();var account=user.register("multipart_user","");var admin=app.admin();admin.login("admin");
   var conversation=map(admin.send("/api/admin/conversations","POST",obj("userId",map(account).get("id"),"body","hello","submissionId",UUID.randomUUID().toString()),201).get("conversation"));
   var nativeClient=app.user();var auth=nativeClient.send("/api/mini/auth/login","POST",obj("username","multipart_user","password",ApiFixture.PASSWORD),200);
   String boundary="JingyuTest813",submission=UUID.randomUUID().toString();
   var fields=obj("name","取景安排.pdf","conversationId",conversation.get("id"),"submissionId",submission);
   byte[] file=new byte[10*1024*1024];file[file.length-1]=42;
   var stream=new java.io.ByteArrayOutputStream();
   for(var e:fields.entrySet())stream.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\""+e.getKey()+"\"\r\n\r\n"+e.getValue()+"\r\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
   stream.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.pdf\"\r\nContent-Type: application/octet-stream\r\n\r\n").getBytes());stream.write(file);stream.write(("\r\n--"+boundary+"--\r\n").getBytes());
   var request=java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://127.0.0.1:"+app.userPort+"/api/mini/messages/files")).header("Authorization","Bearer "+auth.get("token")).header("Content-Type","multipart/form-data; boundary="+boundary).POST(java.net.http.HttpRequest.BodyPublishers.ofByteArray(stream.toByteArray())).build();
   var response=nativeClient.http.send(request,java.net.http.HttpResponse.BodyHandlers.ofString());assertEquals(201,response.statusCode(),response.body());
   var saved=parse(response.body());assertEquals(file.length,integer(saved.get("size")));
   var retry=nativeClient.http.send(request,java.net.http.HttpResponse.BodyHandlers.ofString());assertEquals(201,retry.statusCode(),retry.body());assertEquals(saved.get("id"),parse(retry.body()).get("id"));
   assertArrayEquals(file,(byte[])user.request("/api/messages/files/"+saved.get("id"),"GET",null,200));
   var other=app.user();other.register("multipart_other","");other.request("/api/messages/files/"+saved.get("id"),"GET",null,404);
  }
 }
 @Test void diagnosticContextIsBoundedAndRejectsPrivateFreeText()throws Exception{
  try(var app=new ApiFixture(temp)){
   app.promoteFixtureOwner();
   var user=app.user();user.send("/api/client-health","POST",obj("kind","image-decode","platform","web","page","shots","resource","image@abcdef12","status",200),200);
   user.request("/api/client-health","POST",obj("kind","image-failed","platform","web","page","shots","resource","private?token=secret"),400);
   var admin=app.admin();admin.login("admin");var metrics=admin.get("/api/admin/performance/runtime");assertTrue(write(metrics).contains("image@abcdef12"));assertFalse(write(metrics).contains("secret"));
  }
 }
}
