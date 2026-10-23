package cn.campus.checkin;
import static org.junit.jupiter.api.Assertions.*;
import static cn.campus.common.Json.*;
import cn.campus.common.ApiException;
import java.util.*;
import org.junit.jupiter.api.Test;
class AtlasGeometryTest {
  @Test void acceptsConcaveRoofsAndCourtyardsButRejectsInvalidMasks() {
    Object outer=List.of(List.of(10,10),List.of(100,10),List.of(100,100),List.of(10,100));
    Object courtyard=List.of(List.of(20,20),List.of(30,20),List.of(30,30),List.of(20,30));
    assertEquals(1,list(AtlasGeometry.validate(outer,List.of(courtyard),1280,854).get("holes")).size());
    assertThrows(ApiException.class,()->AtlasGeometry.validate(List.of(List.of(0,0),List.of(20,20),List.of(0,20),List.of(20,0)),List.of(),1280,854));
    assertThrows(ApiException.class,()->AtlasGeometry.validate(outer,List.of(outer),1280,854));
    assertThrows(ApiException.class,()->AtlasGeometry.validate(outer,List.of(courtyard,courtyard),1280,854));
    assertThrows(ApiException.class,()->AtlasGeometry.validate(outer,List.of(),50,50));
    assertThrows(ApiException.class,()->AtlasGeometry.validate(List.of(List.of(0,0),List.of(Double.NaN,20),List.of(20,0)),List.of(),1280,854));
  }
}
