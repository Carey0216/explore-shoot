package cn.campus.testing;

import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class NativeParityContractTest {
 @TempDir Path temp;
 private Map<String,String> bearer(Map<String,Object> login){return Map.of("Authorization","Bearer "+login.get("token"));}
 @Test void nativeParityKeepsAudiencePrivacyAndIdentityRetryRules() throws Exception {
  try(var app=new ApiFixture(temp)){
   var admin=app.admin();var user=app.user();
   var a=bearer(admin.send("/api/mini/admin/auth/login","POST",obj("username","admin","password",ApiFixture.PASSWORD),200));
   var login=user.send("/api/mini/auth/register","POST",obj("username","native_parity","nickname","原生隔离验收","password",ApiFixture.PASSWORD),201);var u=bearer(login);var id=map(login.get("account")).get("id");
   for(String path:List.of("guides","my/notes","my/passport/scene","my/records","my/content","sessions","navigation/voices","updates","maps/places","maps/map-models")) user.request("/api/mini/"+path,"GET",null,200,u);
   var catalog=map(user.request("/api/mini/catalog","GET",null,200,u));assertFalse(write(catalog).contains("viewCount"));assertFalse(write(catalog).contains("popularity"));
   var plan=user.request("/api/mini/plan","POST",obj("budget",30,"people",1,"intensity","适中","theme","全部","mode","fixed","query",""),200,u);assertFalse(list(plan).isEmpty());
   var route=rows(plan).stream().filter(r->yes(r.get("available"))).findFirst().orElseThrow();
   var session=map(user.request("/api/mini/sessions","POST",obj("routeId",route.get("id"),"preferences",obj("budget",30,"people",1,"intensity","适中","theme","全部","mode","fixed")),201,u));
   user.request("/api/mini/sessions/"+session.get("id"),"GET",null,200,u);
   var other=app.user();var otherHeader=bearer(other.send("/api/mini/auth/register","POST",obj("username","native_other","nickname","另一个账号","password",ApiFixture.PASSWORD),201));
   other.request("/api/mini/sessions/"+session.get("id"),"GET",null,404,otherHeader);
   assertNull(map(admin.request("/api/mini/admin/auth/me","GET",null,200,u)).get("account"));assertNull(map(user.request("/api/mini/auth/me","GET",null,200,a)).get("account"));
   for(String path:List.of("overview","scout-quiz","passport","guides","topics","campus-map","review-queue?kind=works&status=pending&page=1")) admin.request("/api/mini/admin/"+path,"GET",null,200,a);
   var safe=admin.request("/api/mini/admin/overview","GET",null,200,a);assertFalse(write(safe).contains("passwordHash"));assertFalse(write(safe).contains("quizPaper"));
   admin.request("/api/mini/admin/features","GET",null,403,a);
   var old=map(user.request("/api/mini/scout/quiz/start","POST",obj(),200,u));
   admin.request("/api/mini/admin/users/"+id,"PATCH",obj("scoutStatus","approved"),200,a);
   admin.request("/api/mini/admin/users/"+id,"PATCH",obj("scoutStatus","none"),200,a);
   user.request("/api/mini/scout/quiz","GET",null,401,u);
   u=bearer(user.send("/api/mini/auth/login","POST",obj("username","native_parity","password",ApiFixture.PASSWORD),200));
   assertEquals(5,integer(map(user.request("/api/mini/scout/quiz","GET",null,200,u)).get("remaining")));
   user.request("/api/mini/scout/quiz/submit","POST",obj("id",old.get("id"),"answers",obj()),409,u);
   assertTrue(list(map(user.request("/api/mini/celebrations/claim","POST",obj("event","scout-passed","page","publish"),200,u)).get("items")).isEmpty());
   user.request("/api/mini/auth/me","GET",null,403,Map.of("Authorization",u.get("Authorization"),"Origin","https://example.test"));
  }
 }
 @Test void hiddenEntryDisablesFunctionForBothTransportsButMaintainedEntryStaysVisible() throws Exception {
  try(var app=new ApiFixture(temp)){
   app.promoteFixtureOwner();var owner=app.admin();owner.login("admin");
   var user=app.user();user.register("feature_reader","");
   var current=owner.get("/api/admin/features");var flags=map(current.get("features"));
   flags.put("plans",obj("enabled",true,"visible",false));flags.put("topics",obj("enabled",false,"visible",true));flags.put("publishing",obj("enabled",false,"visible",true));
   owner.send("/api/admin/features","PUT",obj("revision",current.get("revision"),"features",flags),200);
   var web=map(user.get("/api/features").get("features"));var nativeFlags=map(map(user.request("/api/mini/features","GET",null,200)).get("features"));assertEquals(web,nativeFlags);
   assertEquals(obj("enabled",false,"visible",false),map(web.get("plans")));
   assertEquals(obj("enabled",false,"visible",true),map(web.get("topics")));
   assertEquals("功能正在维护中，敬请期待…",user.send("/api/my/plans","POST",obj("title","不能保存","items",List.of()),403).get("error"));
   assertEquals("功能正在维护中，敬请期待…",map(user.request("/api/mini/topics","GET",null,403)).get("error"));
   assertEquals("功能正在维护中，敬请期待…",map(user.request("/api/mini/shooting-spots","POST",obj(),403)).get("error"));
   owner.send("/api/admin/features","PUT",obj("revision",current.get("revision"),"features",flags),409);
   var saved=owner.get("/api/admin/features");flags=map(saved.get("features"));flags.put("plans",obj("enabled",true,"visible",true));
   owner.send("/api/admin/features","PUT",obj("revision",saved.get("revision"),"features",flags),200);user.get("/api/my/plans");
  }
 }
 @Test void ownerRedrawIsSharedRevisionCheckedAndBackedUpBeforeReplacement() throws Exception {
  try(var app=new ApiFixture(temp)) {
   var ordinary=app.admin(); ordinary.login("admin");
   var atlas=map(ordinary.get("/api/admin/passport").get("atlas"));
   var b=rows(atlas.get("buildings")).stream().filter(r->eq(r.get("frame"),"plan")).findFirst().orElseThrow();
   var shape=List.of(List.of(100,150),List.of(160,150),List.of(160,210),List.of(100,210));
   var update=obj("id",b.get("id"),"name",b.get("name"),"pointIds",List.of(),"revision",b.get("revision"),"outline",shape,"holes",List.of());
   ordinary.send("/api/admin/passport/buildings","PUT",update,403);
   app.promoteFixtureOwner();var owner=app.admin();owner.login("admin");
   var beforeFiles=java.nio.file.Files.walk(temp).filter(p->p.toString().contains("passport-atlas")&&p.toString().endsWith(".json")).count();
   var saved=owner.send("/api/admin/passport/buildings","PUT",update,200);
   assertEquals(integer(b.get("revision"))+1,integer(saved.get("revision")));
   owner.send("/api/admin/passport/buildings","PUT",update,409);
   var nativeLogin=owner.send("/api/mini/admin/auth/login","POST",obj("username","admin","password",ApiFixture.PASSWORD),200);
   var nativeAtlas=map(map(owner.request("/api/mini/admin/passport","GET",null,200,bearer(nativeLogin))).get("atlas"));
   var nativeB=find(rows(nativeAtlas.get("buildings")),"id",b.get("id"));
   assertEquals(write(saved.get("outline")),write(nativeB.get("outline")));
   var snapshots=java.nio.file.Files.walk(temp).filter(p->p.toString().contains("passport-atlas")&&p.toString().endsWith(".json")).toList();
   assertEquals(beforeFiles+1,snapshots.size());
   var backup=parse(java.nio.file.Files.readString(snapshots.getLast()));
   assertEquals(b.get("outline"),map(backup.get("before")).get("outline"));
   // An ordinary metadata edit must retain an owner's drawing.
   owner.send("/api/admin/passport/buildings","PUT",obj("id",b.get("id"),"name","核实后的楼宇名称","pointIds",List.of(),"revision",saved.get("revision")),200);
   var user=app.user();user.register("atlas_reader","");
   var publicAtlas=map(user.get("/api/my/passport").get("atlas"));
   assertEquals(write(saved.get("outline")),write(find(rows(publicAtlas.get("buildings")),"id",b.get("id")).get("outline")));
  }
 }

}
