package cn.campus.checkin;

import static cn.campus.common.Json.*;
import cn.campus.common.ApiException;
import cn.campus.auth.Security;
import cn.campus.web.ApiContext;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Owner-only previews of individual atlas edits, never a general filesystem or database restore. */
final class AtlasHistory {
  static Path directory(ApiContext c) { return c.store.directory.resolve("maintenance-backups/passport-atlas"); }
  static void owner(ApiContext c) {
    c.need();
    if (!cn.campus.admin.AdminPermissions.owner(c.account)) throw new ApiException("仅顶级管理员可查看和恢复楼宇历史",403);
  }
  static Map<String,Object> read(ApiContext c,String id) throws Exception {
    owner(c);
    if (!id.matches("[a-f0-9-]{36}")) throw new ApiException("备份不存在",404);
    Path dir=directory(c).toAbsolutePath().normalize(),file=dir.resolve(id+".json");
    if(Files.isSymbolicLink(dir)||Files.isSymbolicLink(file)||!Files.isRegularFile(file)||Files.size(file)>1024*1024)
      throw new ApiException("备份不存在或不可读取",404);
    String raw=Files.readString(file,StandardCharsets.UTF_8),digest=Security.digest(raw);
    Path checksum=dir.resolve(id+".sha256");
    if(Files.exists(checksum)&&(Files.isSymbolicLink(checksum)||!Files.readString(checksum).trim().equals(digest)))
      throw new ApiException("备份校验失败，请检查维护记录",409);
    var row=parse(raw);
    if(map(row.get("before")).isEmpty()||map(row.get("after")).isEmpty())throw new ApiException("备份内容不完整",409);
    row.put("snapshotId",id);row.put("checksum",digest);return row;
  }
  static boolean handle(ApiContext c) throws Exception {
    if(!c.path.startsWith("/api/admin/passport/history"))return false;
    owner(c);
    if(!c.method.equals("GET"))throw new ApiException("接口不存在",404);
    String prefix="/api/admin/passport/history";
    if(c.path.equals(prefix)){
      var result=new ArrayList<Map<String,Object>>();Path dir=directory(c);
      if(Files.isDirectory(dir)&&!Files.isSymbolicLink(dir))try(var files=Files.list(dir)){
        for(Path f:files.filter(p->p.getFileName().toString().matches("[a-f0-9-]{36}\\.json")).sorted(Comparator.comparingLong((Path p)->p.toFile().lastModified()).reversed()).limit(100).toList()){
          try {var row=read(c,f.getFileName().toString().replace(".json",""));var before=map(row.get("before"));var after=map(row.get("after"));
            var actor=find(c.store.rows("admins"),"id",row.get("actorId"));
            result.add(obj("snapshotId",row.get("snapshotId"),"buildingId",row.get("id"),"name",after.get("name"),"savedAt",row.get("savedAt"),
              "actorName",row.getOrDefault("actorName",actor==null?"历史管理员":actor.getOrDefault("name","管理员")),
              "fromRevision",before.getOrDefault("revision",0),"toRevision",after.get("revision")));
          }catch(ApiException ignored){ /* Invalid snapshots cannot be previewed or restored. */ }
        }
      }
      c.send(obj("items",result));return true;
    }
    String id=c.path.substring(prefix.length()+1);var row=read(c,id);row.remove("actorId");c.send(row);return true;
  }
  static void prepareRestore(ApiContext c) throws Exception {
    if(!c.body.containsKey("restoreFrom"))return;
    owner(c);
    cn.campus.common.RequestValues.fields(c.body,"id","revision","restoreFrom","checksum");
    var snapshot=read(c,str(c.body.get("restoreFrom")));
    if(!eq(snapshot.get("id"),c.body.get("id"))||!eq(snapshot.get("checksum"),c.body.get("checksum")))
      throw new ApiException("备份预览已变化，请重新检查",409);
    var before=map(snapshot.get("before"));Object revision=c.body.get("revision"),id=c.body.get("id");
    c.body.clear();c.body.putAll(obj("id",id,"revision",revision,"name",before.get("name"),"pointIds",before.getOrDefault("pointIds",List.of()),
      "area",before.getOrDefault("area",""),"outline",before.get("outline"),"holes",before.getOrDefault("holes",List.of())));
  }
}
