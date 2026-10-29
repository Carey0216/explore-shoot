package cn.campus.web;
import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;
import cn.campus.common.ApiException;
import java.util.*;
import org.junit.jupiter.api.Test;
class ClientExperienceTest {
  private Map<String,Object> sample(String id,double duration){return obj("id",id,"metric","inp","platform","web","device","mobile","os","ios","browser","safari","page","metrics-test","duration",duration,"ok",true);}
  @Test void repeatedVisitUpdatesOneSampleAndP75UsesVisits(){
    String prefix=UUID.randomUUID().toString();
    for(int n=0;n<4;n++)ClientExperienceService.accept(sample(prefix+n,(n+1)*100));
    ClientExperienceService.accept(sample(prefix+3,900));
    var row=rows(ClientExperienceService.snapshot().get("rows")).stream().filter(r->eq(r.get("page"),"metrics-test")).findFirst().orElseThrow();
    assertEquals(4,integer(row.get("samples")));assertEquals(300.0,((Number)row.get("p75Ms")).doubleValue());assertEquals("insufficient",row.get("assessment"));
  }
  @Test void unsafeContextAndMiniInpAreRejected(){
    var b=sample("unsafe",20);b.put("photoURL","/private/user/photo");assertThrows(ApiException.class,()->ClientExperienceService.accept(b));
    b.remove("photoURL");b.put("page","place/private-id");assertThrows(ApiException.class,()->ClientExperienceService.accept(b));
    b.put("page","map");b.put("platform","mini");assertThrows(ApiException.class,()->ClientExperienceService.accept(b));
    b.put("platform","web");b.put("duration",Double.NaN);assertThrows(ApiException.class,()->ClientExperienceService.accept(b));
  }
  @Test void failuresDoNotMakeOneSuccessfulVisitLookRepresentative(){
    String prefix=UUID.randomUUID().toString();
    for(int i=0;i<20;i++){var b=sample(prefix+i,20);b.put("page","failure-test");b.put("ok",false);ClientExperienceService.accept(b);}
    var b=sample(prefix+"success",20);b.put("page","failure-test");ClientExperienceService.accept(b);
    var row=rows(ClientExperienceService.snapshot().get("rows")).stream().filter(r->eq(r.get("page"),"failure-test")).findFirst().orElseThrow();
    assertEquals(20,integer(row.get("failures")));assertEquals(1,integer(row.get("successes")));assertEquals("insufficient",row.get("assessment"));
  }
}
