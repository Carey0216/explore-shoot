package cn.campus.point;
import static cn.campus.common.Json.*;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class SearchLanguageTest {
  @Test void spokenNamesAndPinyinDoNotRequireExactTitles() {
    var library = obj("name", "北方民族大学图书馆", "aliases", java.util.List.of("图书楼"), "theme", "建筑");
    assertTrue(PointSearchService.friendlyMatch(library, "我想看看图书管附近"));
    assertTrue(PointSearchService.friendlyMatch(library, "想找图书楼拍一下"));
    assertTrue(PointSearchService.friendlyMatch(library, "tushuguan"));
    assertFalse(PointSearchService.friendlyMatch(library, "完全无关的地点"));
    assertTrue(SearchLanguage.score(obj("name", "明湖", "theme", "自然"), "想找个湖边拍花的地方") > 0);
  }
  @Test void exactBuildingRanksBeforeBroadTheme() {
    String q = "想拍图书馆的建筑";
    assertTrue(SearchLanguage.score(obj("name", "图书馆", "theme", "建筑"), q)
        > SearchLanguage.score(obj("name", "体育馆", "theme", "建筑"), q));
    assertEquals(0, SearchLanguage.score(obj("name", "图书馆"), ""));
  }
  @Test void retiredMotionFlagCannotDisableAnimations() {
    assertFalse(cn.campus.settings.Preferences.normalize(obj("motion", "reduce")).containsKey("motion"));
    assertTrue(cn.campus.settings.Preferences.validate(obj("motion", "reduce")).isEmpty());
  }
}
