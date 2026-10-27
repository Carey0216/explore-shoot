package cn.campus.testing;
import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class MessageFilesContractTest {
 @TempDir Path temp;
 @Test void privateBinaryAttachmentsAreBidirectionalIdempotentScopedAndSurviveRestart() throws Exception {
  String attachmentId;
  byte[] bytes="<html>Private attachment, download only.</html>".getBytes(StandardCharsets.UTF_8);
  try(var app=new ApiFixture(temp)){
   var admin=app.admin();admin.login("admin");
   var alice=app.user();Object user=alice.register("file_alice","");
   var bob=app.user();bob.register("file_bob","");
   var guest=app.user();
   String submission=UUID.randomUUID().toString();
   var upload=obj("name","取景说明.pdf","content",Base64.getEncoder().encodeToString(bytes),
       "userId",map(user).get("id"),"submissionId",submission);
   var file=admin.send("/api/admin/messages/files","POST",upload,201);
   attachmentId=str(file.get("id"));
   assertEquals(attachmentId,admin.send("/api/admin/messages/files","POST",upload,201).get("id"));
   var conflict=copy(upload);conflict.put("content",Base64.getEncoder().encodeToString(new byte[]{1,2}));
   admin.request("/api/admin/messages/files","POST",conflict,409);
   alice.request("/api/messages/files/"+attachmentId,"GET",null,404);
   guest.request("/api/messages/files/"+attachmentId,"GET",null,401);
   bob.request("/api/messages/files/"+attachmentId,"GET",null,404);
   var conversation=map(admin.send("/api/admin/conversations","POST",
       obj("userId",map(user).get("id"),"body","","fileIds",List.of(attachmentId),
           "submissionId",UUID.randomUUID().toString()),201).get("conversation"));
   String thread=str(conversation.get("id"));
   var messages=alice.get("/api/conversations/"+thread);
   var item=rows(messages.get("items")).getFirst();
   assertEquals("取景说明.pdf",map(list(item.get("files")).getFirst()).get("name"));
   assertFalse(write(item).contains("uploaderId"));
   assertArrayEquals(bytes,(byte[])alice.request("/api/messages/files/"+attachmentId,"GET",null,200));
   var response=alice.http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+app.userPort+
       "/api/messages/files/"+attachmentId)).header("Cookie",alice.cookie).build(),
       HttpResponse.BodyHandlers.ofByteArray());
   assertEquals("application/octet-stream",response.headers().firstValue("Content-Type").orElse(""));
   assertEquals("nosniff",response.headers().firstValue("X-Content-Type-Options").orElse(""));
   assertTrue(response.headers().firstValue("Content-Disposition").orElse("").startsWith("attachment;"));
   assertTrue(response.headers().firstValue("Cache-Control").orElse("").contains("no-store"));
   var userFile=alice.send("/api/messages/files","POST",
       obj("conversationId",thread,"name","场地反馈.txt","content",Base64.getEncoder().encodeToString(bytes),
           "submissionId",UUID.randomUUID().toString()),201);
   String replyFile=str(userFile.get("id"));
   admin.request("/api/admin/messages/files/"+replyFile,"GET",null,404);
   alice.send("/api/conversations/"+thread+"/messages","POST",
       obj("body","","fileIds",List.of(replyFile),"submissionId",UUID.randomUUID().toString()),201);
   assertArrayEquals(bytes,(byte[])admin.request("/api/admin/messages/files/"+replyFile,"GET",null,200));
   bob.request("/api/messages/files","POST",obj("conversationId",thread,"name","x.txt",
       "content","eA==","submissionId",UUID.randomUUID().toString()),404);
   var bad=copy(upload);bad.put("name","../escape.html");bad.put("submissionId",UUID.randomUUID().toString());
   admin.request("/api/admin/messages/files","POST",bad,400);
   byte[] maximum=new byte[10*1024*1024];maximum[maximum.length-1]=42;
   var maximumUpload=copy(upload);maximumUpload.put("content",Base64.getEncoder().encodeToString(maximum));
   maximumUpload.put("submissionId",UUID.randomUUID().toString());
   var maximumFile=admin.send("/api/admin/messages/files","POST",maximumUpload,201);
   assertEquals(maximum.length,integer(maximumFile.get("size")));
   assertArrayEquals(maximum,(byte[])admin.request("/api/admin/messages/files/"+maximumFile.get("id"),"GET",null,200));
   bad=copy(upload);bad.put("content",Base64.getEncoder().encodeToString(new byte[10*1024*1024+1]));
   bad.put("submissionId",UUID.randomUUID().toString());
   admin.request("/api/admin/messages/files","POST",bad,413);
   var nativeClient=app.user();
   var login=nativeClient.send("/api/mini/auth/login","POST",
       obj("username","file_alice","password",ApiFixture.PASSWORD),200);
   assertArrayEquals(bytes,(byte[])nativeClient.request("/api/mini/messages/files/"+attachmentId,
       "GET",null,200,Map.of("Authorization","Bearer "+login.get("token"))));
   var unread=alice.get("/api/notifications?category=message");
   assertTrue(rows(unread.get("items")).stream().anyMatch(n->
       !str(n.get("target")).isEmpty() && list(n.get("files")).size()==1));
  }
  try(var restarted=new ApiFixture(temp)){
   var alice=restarted.user();alice.login("file_alice");
   assertArrayEquals(bytes,(byte[])alice.request("/api/messages/files/"+attachmentId,"GET",null,200));
  }
 }
}
