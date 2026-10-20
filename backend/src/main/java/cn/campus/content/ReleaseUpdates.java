package cn.campus.content;

import static cn.campus.common.Json.*;

import cn.campus.admin.AdminPermissions;
import cn.campus.common.ApiException;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

/** One draft per shipped release; customer-facing notes require explicit owner publication. */
public final class ReleaseUpdates {
  private static final Map<String, Object> RELEASE;

  static {
    try (var input = ReleaseUpdates.class.getResourceAsStream("/release-updates.json")) {
      RELEASE =
          parse(new String(Objects.requireNonNull(input).readAllBytes(), StandardCharsets.UTF_8));
    } catch (Exception e) {
      throw new ExceptionInInitializerError(e);
    }
  }

  public static boolean seed(StoreRepository store) {
    String version = str(RELEASE.get("version"));
    var existing =
        store.rows("announcements").stream()
            .filter(r -> eq(r.get("releaseVersion"), version))
            .findFirst()
            .orElse(null);
    if (existing != null) {
      if (!existing.containsKey("adminDraft")) {
        existing.put("adminDraft", RELEASE.get("adminBody"));
        return true;
      }
      return false;
    }
    store
        .rows("announcements")
        .add(
            obj(
                "id",
                UUID.nameUUIDFromBytes(("release:" + version).getBytes(StandardCharsets.UTF_8))
                    .toString(),
                "releaseVersion",
                version,
                "adminDraft",
                RELEASE.get("adminBody"),
                "revision",
                1,
                "createdAt",
                StoreRepository.now(),
                "updatedAt",
                StoreRepository.now(),
                "draft",
                obj(
                    "title",
                    "v" + version + " · " + RELEASE.get("title"),
                    "body",
                    RELEASE.get("userBody"),
                    "channels",
                    List.of("web"),
                    "pages",
                    List.of(),
                    "audience",
                    "all",
                    "userIds",
                    List.of(),
                    "startsAt",
                    "",
                    "endsAt",
                    "",
                    "maxTotal",
                    1,
                    "maxDaily",
                    1,
                    "intervalMinutes",
                    0,
                    "priority",
                    100,
                    "imageId",
                    "",
                    "links",
                    List.of(obj("label", "查看本次更新", "href", "#updates")),
                    "delivery",
                    List.of("inbox"))));
    return true;
  }

  public static boolean publicRelease(Map<String, Object> row) {
    var p = map(row.get("published"));
    if (str(row.get("releaseVersion")).isEmpty()
        || yes(row.get("deleted"))
        || p.isEmpty()
        || !eq(p.get("audience"), "all")
        || !list(p.get("channels")).contains("web")) return false;
    try {
      var now = Instant.now();
      return (str(p.get("startsAt")).isEmpty()
              || !Instant.parse(str(p.get("startsAt"))).isAfter(now))
          && (str(p.get("endsAt")).isEmpty() || Instant.parse(str(p.get("endsAt"))).isAfter(now));
    } catch (Exception e) {
      return false;
    }
  }

  public static boolean handle(ApiContext c) throws Exception {
    if (c.audience.equals("user") && c.route("/api/updates", "GET")) {
      c.send(
          obj(
              "items",
              c.store.rows("announcements").stream()
                  .filter(ReleaseUpdates::publicRelease)
                  .sorted(
                      Comparator.comparing((Map<String, Object> r) -> str(r.get("publishedAt")))
                          .reversed())
                  .limit(20)
                  .map(
                      r ->
                          obj(
                              "version",
                              r.get("releaseVersion"),
                              "publishedAt",
                              r.get("publishedAt"),
                              "title",
                              map(r.get("published")).get("title"),
                              "body",
                              map(r.get("published")).get("body"),
                              "links",
                              map(r.get("published")).get("links")))
                  .toList()));
      return true;
    }
    if (c.audience.equals("admin") && c.route("/api/admin/updates", "GET")) {
      c.need();
      var pending =
          AdminPermissions.owner(c.account)
              ? c.store.rows("announcements").stream()
                  .filter(
                      r ->
                          !str(r.get("releaseVersion")).isEmpty()
                              && !yes(r.get("deleted"))
                              && (map(r.get("published")).isEmpty()
                                  || str(r.get("adminPublished")).isEmpty()))
                  .map(
                      r ->
                          obj(
                              "id",
                              r.get("id"),
                              "version",
                              r.get("releaseVersion"),
                              "revision",
                              r.get("revision"),
                              "title",
                              map(r.get("draft")).get("title")))
                  .toList()
              : List.of();
      var current =
          c.store.rows("announcements").stream()
              .filter(r -> eq(r.get("releaseVersion"), RELEASE.get("version")))
              .findFirst()
              .orElse(obj());
      boolean published = publicRelease(current) && !str(current.get("adminPublished")).isEmpty();
      c.send(
          obj(
              "published",
              published,
              "version",
              RELEASE.get("version"),
              "title",
              RELEASE.get("title"),
              "body",
              published ? current.get("adminPublished") : "本次管理端更新说明正在检查。完整操作引导可随时重看；发布后会在这里展示。",
              "pending",
              pending));
      return true;
    }
    return false;
  }

  public static void guardEdit(ApiContext c, Map<String, Object> row) {
    if (str(row.get("releaseVersion")).isEmpty()) return;
    AdminPermissions.ownerOnly(c);
    if (eq(c.body.get("action"), "publish")) {
      SiteContentService.text(c.body, "adminBody", 6000, true);
      var content = map(c.body.get("content"));
      if (!eq(content.get("audience"), "all")
          || !list(content.get("channels")).equals(List.of("web"))
          || !list(content.get("delivery")).contains("inbox"))
        throw new ApiException("版本更新须面向全部网页用户并保留消息中心投递；小程序当前暂停更新");
    }
  }
}
