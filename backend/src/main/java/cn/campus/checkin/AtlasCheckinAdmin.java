package cn.campus.checkin;

import static cn.campus.common.Json.*;
import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.web.ApiContext;
import cn.campus.storage.StoreRepository;
import java.util.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;

/** Reversible collection credit controls. Original check-ins, private photos and notes stay owned by their user. */
final class AtlasCheckinAdmin {
  static Map<String,Object> row(ApiContext c,Map<String,Object> user,String pointId){
    Object owner=user.get("id");var reset=find(c.store.rows("passportCheckinResets"),"id",owner+":"+pointId);
    var records=PassportProgressService.recordsFor(c,owner).stream().filter(r->eq(r.get("pointId"),pointId)).toList();
    String marker=Security.digest(write(records.stream().map(r->obj("id",r.get("id"),"at",r.get("createdAt"))).toList())+write(reset));
    return obj("userId",owner,"username",user.get("username"),"nickname",user.get("nickname"),"activeCount",records.size(),
      "lastAt",records.stream().map(r->str(r.get("createdAt"))).max(String::compareTo).orElse(""),"reset",reset!=null&&!str(reset.get("cutoff")).isEmpty(),"marker",marker);
  }
  static boolean handle(ApiContext c)throws Exception{
    if(!c.path.equals("/api/admin/passport/point-checkins"))return false;
    AtlasHistory.owner(c);
    String pointId=c.method.equals("GET")?Objects.toString(c.request.getParameter("pointId"),""):str(c.body.get("pointId"));
    if(find(c.store.rows("points"),"id",pointId)==null)throw new ApiException("点位不存在",404);
    if(c.method.equals("GET")){
      var users=c.store.rows("users").stream().filter(u->!yes(u.get("deleted"))).map(u->row(c,u,pointId))
        .filter(r->integer(r.get("activeCount"))>0||yes(r.get("reset"))).sorted(Comparator.comparing(r->str(r.get("nickname")))).toList();
      c.send(obj("items",users,"pointId",pointId));return true;
    }
    if(!c.method.equals("POST"))throw new ApiException("接口不存在",404);
    cn.campus.common.RequestValues.fields(c.body,"pointId","userId","marker","action");
    var user=find(c.store.rows("users"),"id",c.body.get("userId"));if(user==null)throw new ApiException("用户不存在",404);
    var current=row(c,user,pointId);if(!eq(current.get("marker"),c.body.get("marker")))throw new ApiException("打卡统计已变化，请刷新后重试",409);
    String action=str(c.body.get("action"));if(!Set.of("reset","restore").contains(action))throw new ApiException("请选择有效操作");
    Object id=user.get("id")+":"+pointId;var old=find(c.store.rows("passportCheckinResets"),"id",id);
    var next=obj("id",id,"ownerId",user.get("id"),"pointId",pointId,"cutoff",action.equals("reset")?StoreRepository.now():"",
      "revision",old==null?1:integer(old.get("revision"))+1,"updatedAt",StoreRepository.now(),"actorId",c.account.get("id"));
    Path dir=c.store.directory.resolve("maintenance-backups/passport-checkins");Files.createDirectories(dir);
    Path file=dir.resolve(Security.id()+".json");String content=write(obj("before",old,"after",next,"action",action));
    Files.writeString(file,content,StandardCharsets.UTF_8,StandardOpenOption.CREATE_NEW);
    if(!Files.readString(file).equals(content))throw new ApiException("备份校验失败",503);
    try{Files.setPosixFilePermissions(file,java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));}catch(UnsupportedOperationException ignored){}
    if(old==null)c.store.rows("passportCheckinResets").add(next);else{old.clear();old.putAll(next);}
    c.audit(action.equals("reset")?"取消点位收集统计":"恢复点位收集统计",pointId,"用户 "+user.get("id")+"；原始记录保留");c.store.save();c.send(row(c,user,pointId));return true;
  }
}
