package cn.campus.notification;

import static cn.campus.common.Json.*;
import cn.campus.admin.AdminPermissions;
import cn.campus.auth.Security;
import cn.campus.common.*;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.net.URLEncoder;
import java.util.*;

/** Private conversation attachments. Binary downloads are never executable web content. */
public final class MessageFiles {
  public static final int MAX_BYTES = 10 * 1024 * 1024;
  private static boolean admin(ApiContext c) { return c.audience.equals("admin"); }
  private static Path file(ApiContext c, String id) {
    if (!id.matches("[a-f0-9-]{36}")) throw new ApiException("附件不存在",404);
    Path root=c.store.directory.resolve("message-files").toAbsolutePath().normalize();
    if (Files.isSymbolicLink(root)) throw new ApiException("附件存储不可用",503);
    Path p=root.resolve(id+".bin").normalize();
    if (!p.getParent().equals(root) || Files.isSymbolicLink(p)) throw new ApiException("附件不存在",404);
    return p;
  }
  private static Map<String,Object> view(Map<String,Object> f) {
    return obj("id",f.get("id"),"name",f.get("name"),"size",f.get("size"),
        "url","/api/messages/files/"+f.get("id"));
  }
  public static boolean handle(ApiContext c, RateLimiter limits) throws Exception {
    if (!c.path.matches("/api/(?:admin/)?messages/files(?:/[a-f0-9-]+)?")) return false;
    c.need();
    if (!admin(c)) cn.campus.settings.InteractionFeatures.require(c.store,"messages");
    String base=c.path.startsWith("/api/admin/")?"/api/admin/messages/files":"/api/messages/files";
    if (c.method.equals("POST") && c.path.equals(base)) {
      RequestValues.fields(c.body,"name","content","conversationId","userId","submissionId");
      if (admin(c) && !AdminPermissions.has(c.account,"messages.write"))
        throw new ApiException("无消息管理权限",403);
      var thread=find(c.store.rows("conversations"),"id",c.body.get("conversationId"));
      Object userId;
      if (thread!=null) {
        if (!MessagingService.access(c,thread)) throw new ApiException("对话不存在",404);
        if (!yes(thread.get("open"))) throw new ApiException("对话已关闭，暂不能上传附件",409);
        userId=thread.get("userId");
      } else {
        if (!admin(c) || !str(c.body.get("conversationId")).isEmpty())
          throw new ApiException("请先打开已建立的对话",404);
        var user=find(c.store.rows("users"),"id",c.body.get("userId"));
        if (user==null || yes(user.get("deleted"))) throw new ApiException("用户不存在",404);
        userId=user.get("id");
      }
      String name=str(c.body.get("name")).trim(),content=str(c.body.get("content")),
          submission=str(c.body.get("submissionId"));
      if(name.isEmpty() || name.length()>160 || name.matches(".*[\\p{Cntrl}/\\\\].*"))
        throw new ApiException("文件名无效");
      if(!submission.matches("[a-f0-9-]{36}")) throw new ApiException("上传编号无效");
      if(content.length()>14*1024*1024)throw new ApiException("单个文件不能超过10MB",413);
      byte[] bytes;
      try {bytes=Base64.getDecoder().decode(content);}catch(IllegalArgumentException e){throw new ApiException("文件内容无效");}
      if(bytes.length==0)throw new ApiException("不能发送空文件");
      if(bytes.length>MAX_BYTES)throw new ApiException("单个文件不能超过10MB",413);
      String digest=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
      var old=c.store.rows("messageFiles").stream().filter(f->
          eq(f.get("uploaderId"),c.account.get("id")) && eq(f.get("audience"),c.audience)
          && eq(f.get("submissionId"),submission)).findFirst().orElse(null);
      if(old!=null){
        if(!eq(old.get("digest"),digest)||!eq(old.get("name"),name)||!eq(old.get("userId"),userId))
          throw new ApiException("上传编号与文件不匹配",409);
        if(!Files.isRegularFile(file(c,str(old.get("id")))))throw new ApiException("附件已不可用，请重新选择",410);
        c.send(view(old),201);return true;
      }
      limits.check(c.account.get("id")+":message-file",15);
      String id=Security.id();Path target=file(c,id);
      Files.createDirectories(target.getParent());
      Files.write(target,bytes,StandardOpenOption.CREATE_NEW);
      var saved=obj("id",id,"name",name,"size",bytes.length,"digest",digest,
          "uploaderId",c.account.get("id"),"audience",c.audience,"userId",userId,
          "conversationId",thread==null?"":thread.get("id"),"submissionId",submission,
          "messageId","","createdAt",StoreRepository.now());
      try {c.store.rows("messageFiles").add(saved);c.store.save();}
      catch(Exception e){Files.deleteIfExists(target);throw e;}
      c.send(view(saved),201);return true;
    }
    if(c.method.equals("GET") && c.path.startsWith(base+"/")){
      String id=c.path.substring(base.length()+1);
      var f=find(c.store.rows("messageFiles"),"id",id);
      if(f==null)throw new ApiException("附件不存在",404);
      boolean uploader=eq(f.get("uploaderId"),c.account.get("id"))&&eq(f.get("audience"),c.audience);
      var thread=find(c.store.rows("conversations"),"id",f.get("conversationId"));
      boolean delivered=!str(f.get("messageId")).isEmpty()&&MessagingService.access(c,thread);
      if(!uploader&&!delivered)throw new ApiException("附件不存在",404);
      if(admin(c)&&!AdminPermissions.has(c.account,"messages.read"))throw new ApiException("无消息管理权限",403);
      Path target=file(c,id);if(!Files.isRegularFile(target))throw new ApiException("附件已不可用",410);
      c.response.setContentType("application/octet-stream");
      c.response.setHeader("Cache-Control","private, no-store");
      c.response.setHeader("X-Content-Type-Options","nosniff");
      c.response.setHeader("Content-Security-Policy","sandbox");
      c.response.setHeader("Content-Disposition","attachment; filename=\"attachment\"; filename*=UTF-8''"+
          URLEncoder.encode(str(f.get("name")),StandardCharsets.UTF_8).replace("+","%20"));
      c.response.setContentLengthLong(Files.size(target));
      Files.copy(target,c.response.getOutputStream());return true;
    }
    throw new ApiException("接口不存在",404);
  }
  static List<Object> attach(ApiContext c,Map<String,Object> t) {
    if(c.body.containsKey("fileIds")&&!(c.body.get("fileIds") instanceof List<?>))throw new ApiException("附件列表无效");
    var ids=list(c.body.get("fileIds"));
    if(ids.size()>3||new HashSet<>(ids).size()!=ids.size())throw new ApiException("每条消息最多发送3个不同文件");
    List<Object> result=new ArrayList<>();
    for(Object id:ids){
      var f=find(c.store.rows("messageFiles"),"id",id);
      if(f==null||!eq(f.get("uploaderId"),c.account.get("id"))||!eq(f.get("audience"),c.audience)
          ||!eq(f.get("userId"),t.get("userId"))
          ||!str(f.get("conversationId")).isEmpty()&&!eq(f.get("conversationId"),t.get("id"))
          ||!Files.isRegularFile(file(c,str(id))))throw new ApiException("附件不存在或不属于当前对话",404);
      result.add(view(f));
    }
    return result;
  }
  static void bind(ApiContext c,Map<String,Object> t,Map<String,Object> message,List<Object> files) {
    for(Object value:files){
      var f=find(c.store.rows("messageFiles"),"id",map(value).get("id"));
      f.put("conversationId",t.get("id"));f.put("messageId",message.get("id"));
    }
  }
}
