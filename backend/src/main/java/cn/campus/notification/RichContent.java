package cn.campus.notification;

import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.web.ApiContext;
import java.net.URI;
import java.util.*;

/** Plain text and explicit links, never administrator-supplied executable HTML. */
public final class RichContent {
  public static String link(Object value) {
    String s = str(value).trim();
    if (s.isEmpty()) return "";
    if (s.matches(
        "#(?:discover|shots|topics|map|navigate|routes|me|settings|passport|publish|notifications|my-works|contact|support|plans|collections|guides|updates|(?:place|spot|topic|conversation|notice|shared-plan|guide)/[a-z0-9-]+)"))
      return s;
    try {
      URI u = URI.create(s);
      if (s.length() <= 1000
          && u.getScheme().equals("https")
          && u.getHost() != null
          && u.getUserInfo() == null) return s;
    } catch (Exception ignored) {
    }
    throw new ApiException("链接须为有效站内窗口或HTTPS地址");
  }

  public static Map<String, Object> read(ApiContext c, Map<String, Object> b) {
    String image = str(b.get("imageId"));
    if (!image.isEmpty()) {
      boolean reused =
          c.audience.equals("admin")
              && c.path.startsWith("/api/admin/announcements")
              && c.store.rows("announcements").stream()
                  .anyMatch(
                      r ->
                          !yes(r.get("deleted"))
                              && (eq(map(r.get("draft")).get("imageId"), image)
                                  || eq(map(r.get("published")).get("imageId"), image)));
      if (!reused) c.ownedMedia(image);
    }
    List<Object> links = new ArrayList<>();
    if (b.containsKey("links") && !(b.get("links") instanceof List<?>))
      throw new ApiException("链接列表无效");
    if (list(b.get("links")).size() > 5) throw new ApiException("最多添加5个链接");
    for (Object item : list(b.get("links"))) {
      var row = map(item);
      String label = str(row.get("label")).trim(), href = link(row.get("href"));
      if (label.isEmpty() || label.length() > 60 || href.isEmpty())
        throw new ApiException("请填写链接名称与地址");
      links.add(obj("label", label, "href", href));
    }
    return obj("imageId", image, "links", links);
  }

  public static Map<String, Object> view(Map<String, Object> b) {
    var out = copy(b);
    String image = str(out.get("imageId"));
    out.remove("imageId");
    out.remove("userId");
    if (!image.isEmpty()) out.put("image", "/api/messages/media/" + image);
    return out;
  }
}
