package cn.campus.storage.sql;

import static cn.campus.common.Json.*;

import cn.campus.checkin.PassportService;
import cn.campus.common.ApiException;
import java.sql.*;
import java.time.*;
import java.util.*;

/** Transactional read projections: private journeys, bounded map results and authorised inbox. */
public final class JourneyQueries {
  private final String url;

  JourneyQueries(String url) {
    this.url = url;
  }

  static void schema(Connection c) throws SQLException {
    try (var s = c.createStatement()) {
      s.execute(
          "CREATE TABLE IF NOT EXISTS journey_records(id VARCHAR(100) PRIMARY KEY,source_group"
              + " VARCHAR(40),source_key VARCHAR(36),owner_id VARCHAR(100),point_id"
              + " VARCHAR(100),created_at VARCHAR(40),has_photo BOOLEAN,is_night BOOLEAN,payload"
              + " CLOB)");
      s.execute(
          "CREATE INDEX IF NOT EXISTS ix_journey_owner ON journey_records(owner_id,created_at,id)");
      s.execute(
          "CREATE INDEX IF NOT EXISTS ix_journey_point ON"
              + " journey_records(owner_id,point_id,has_photo,is_night)");
      s.execute(
          "CREATE TABLE IF NOT EXISTS map_points(id VARCHAR(100) PRIMARY KEY,source_key"
              + " VARCHAR(36),lng DOUBLE,lat DOUBLE,published BOOLEAN,payload CLOB)");
      s.execute("CREATE INDEX IF NOT EXISTS ix_map_bounds ON map_points(published,lng,lat)");
      s.execute(
          "CREATE TABLE IF NOT EXISTS inbox_entries(id VARCHAR(150) PRIMARY KEY,source_group"
              + " VARCHAR(40),source_key VARCHAR(36),feature VARCHAR(40),category VARCHAR(20),title"
              + " VARCHAR(200),message CLOB,target VARCHAR(150),created_at VARCHAR(40),request_id"
              + " VARCHAR(100),user_id VARCHAR(100),admin_id VARCHAR(100),conversation_id"
              + " VARCHAR(100),conversation_read_at VARCHAR(40))");
      s.execute(
          "CREATE INDEX IF NOT EXISTS ix_inbox_page ON"
              + " inbox_entries(feature,category,created_at,id)");
      s.execute(
          "CREATE INDEX IF NOT EXISTS ix_inbox_conversation ON inbox_entries(conversation_id)");
      s.execute(
          "CREATE TABLE IF NOT EXISTS work_dates(id VARCHAR(100) PRIMARY KEY,source_key"
              + " VARCHAR(36),spot_id VARCHAR(100),point_id VARCHAR(100),owner_id"
              + " VARCHAR(100),checkin_id VARCHAR(100),season VARCHAR(20),time_band VARCHAR(20))");
      s.execute(
          "CREATE INDEX IF NOT EXISTS ix_work_compare ON work_dates(spot_id,season,time_band)");
    }
  }

  private static final Map<String, String> FEATURES =
      Map.of(
          "applications",
          "applications",
          "reports",
          "reports",
          "workReports",
          "work-reports",
          "works",
          "works",
          "shootingSpots",
          "shooting-spots",
          "contactRequests",
          "messages");
  private static final Map<String, String> TITLES =
      Map.of(
          "applications",
          "探索官申请",
          "reports",
          "点位反馈",
          "workReports",
          "作品举报",
          "works",
          "作品待审核",
          "shootingSpots",
          "机位待审核",
          "contactRequests",
          "用户联系留言");

  static void refresh(Connection c, TrackedDocument state, boolean rebuild) throws SQLException {
    for (String group :
        List.of(
            "checkins",
            "sessions",
            "points",
            "applications",
            "reports",
            "workReports",
            "works",
            "shootingSpots",
            "contactRequests",
            "directMessages",
            "conversations")) {
      if (!(state.get(group) instanceof TrackedDocument.Records records)) continue;
      if (records.structureDirty && !rebuild) {
        for (String key : records.removed()) delete(c, group, key);
      }
      for (var row : rebuild || records.structureDirty ? records.records() : records.modified) {
        if (!rebuild && !row.dirty) continue;
        var value = row.data;
        delete(c, group, row.key);
        if (group.equals("works")) {
          String season = "unknown", band = "unknown";
          try {
            var taken =
                Instant.parse(
                        str(cn.campus.common.Json.map(value.get("experience")).get("takenAt")))
                    .atZone(ZoneId.of("Asia/Shanghai"));
            int month = taken.getMonthValue(), hour = taken.getHour();
            season =
                month >= 3 && month <= 5
                    ? "spring"
                    : month >= 6 && month <= 8
                        ? "summer"
                        : month >= 9 && month <= 11 ? "autumn" : "winter";
            band =
                hour >= 6 && hour < 10
                    ? "morning"
                    : hour >= 10 && hour < 17
                        ? "day"
                        : hour >= 17 && hour < 20 ? "evening" : "night";
          } catch (RuntimeException ignored) {
          }
          try (var p =
              c.prepareStatement("MERGE INTO work_dates KEY(id) VALUES(?,?,?,?,?,?,?,?)")) {
            bind(
                p,
                List.of(
                    str(value.get("id")),
                    row.key,
                    str(value.get("spotId")),
                    str(value.get("pointId")),
                    str(value.get("ownerId")),
                    str(value.get("checkinId")),
                    season,
                    band));
            p.executeUpdate();
          }
        }
        if (group.equals("checkins") || group.equals("sessions")) {
          var values =
              group.equals("checkins")
                  ? PassportService.records(List.of(value), List.of())
                  : PassportService.records(List.of(), List.of(value));
          for (var r : values) {
            boolean photo = !str(r.get("mediaId")).isBlank(), night = false;
            try {
              int h =
                  Instant.parse(str(r.get("createdAt")))
                      .atZone(ZoneId.of("Asia/Shanghai"))
                      .getHour();
              night = !yes(r.get("legacyTime")) && (h >= 18 || h < 6);
            } catch (RuntimeException ignored) {
            }
            try (var p =
                c.prepareStatement(
                    "MERGE INTO journey_records KEY(id) VALUES(?,?,?,?,?,?,?,?,?)")) {
              bind(
                  p,
                  List.of(
                      str(r.get("id")),
                      group,
                      row.key,
                      str(value.get("ownerId")),
                      str(r.get("pointId")),
                      str(r.get("createdAt")),
                      photo,
                      night,
                      write(r)));
              p.executeUpdate();
            }
          }
        } else if (group.equals("points")) {
          try (var p = c.prepareStatement("MERGE INTO map_points KEY(id) VALUES(?,?,?,?,?,?)")) {
            bind(
                p,
                List.of(
                    str(value.get("id")),
                    row.key,
                    num(value.get("lng")),
                    num(value.get("lat")),
                    yes(value.get("published")),
                    write(value)));
            p.executeUpdate();
          }
          if (value.get("authorId") != null
              && eq(value.get("trust"), "community")
              && yes(value.get("published")))
            inbox(
                c,
                "point:" + value.get("id"),
                group,
                row.key,
                "points",
                "review",
                "社区点位待认证",
                str(value.get("name")),
                "#points",
                str(value.get("createdAt")),
                "",
                "",
                "",
                "",
                "");
        } else if (FEATURES.containsKey(group) && eq(value.get("status"), "pending")) {
          String feature = FEATURES.get(group),
              request = group.equals("contactRequests") ? str(value.get("id")) : "";
          inbox(
              c,
              group + ":" + value.get("id"),
              group,
              row.key,
              feature,
              request.isEmpty() ? "review" : "message",
              TITLES.get(group),
              request.isEmpty() ? "有一条请求等待处理" : str(value.get("body")),
              "#" + (feature.equals("messages") ? "messages" : feature),
              str(value.get("createdAt")),
              request,
              str(value.get("userId")),
              "",
              "",
              "");
        } else if (group.equals("directMessages") && eq(value.get("from"), "user")) {
          var t = find(rows(state.get("conversations")), "id", value.get("conversationId"));
          if (t != null)
            inbox(
                c,
                "message:" + value.get("id"),
                group,
                row.key,
                "messages",
                "message",
                "用户回复 · " + str(t.get("userName")),
                str(value.get("body")),
                "#messages/" + t.get("id"),
                str(value.get("createdAt")),
                "",
                str(t.get("userId")),
                str(t.get("adminId")),
                str(t.get("id")),
                str(t.get("adminReadAt")));
        } else if (group.equals("conversations")) {
          try (var p =
              c.prepareStatement(
                  "UPDATE inbox_entries SET admin_id=?,conversation_read_at=? WHERE"
                      + " conversation_id=?")) {
            bind(
                p,
                List.of(
                    str(value.get("adminId")),
                    str(value.get("adminReadAt")),
                    str(value.get("id"))));
            p.executeUpdate();
          }
        }
      }
    }
  }

  private static void delete(Connection c, String group, String key) throws SQLException {
    for (String table : List.of("journey_records", "inbox_entries"))
      try (var p =
          c.prepareStatement("DELETE FROM " + table + " WHERE source_group=? AND source_key=?")) {
        bind(p, List.of(group, key));
        p.executeUpdate();
      }
    if (group.equals("points"))
      try (var p = c.prepareStatement("DELETE FROM map_points WHERE source_key=?")) {
        p.setString(1, key);
        p.executeUpdate();
      }
    if (group.equals("works"))
      try (var p = c.prepareStatement("DELETE FROM work_dates WHERE source_key=?")) {
        p.setString(1, key);
        p.executeUpdate();
      }
  }

  private static void inbox(Connection c, String... values) throws SQLException {
    try (var p =
        c.prepareStatement(
            "MERGE INTO inbox_entries KEY(id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")) {
      bind(p, Arrays.asList(values));
      p.executeUpdate();
    }
  }

  private static void bind(PreparedStatement p, List<?> values) throws SQLException {
    for (int i = 0; i < values.size(); i++) p.setObject(i + 1, values.get(i));
  }

  private Connection reader() throws SQLException {
    return DriverManager.getConnection(url, "sa", "");
  }

  public Map<String, Object> summary(String owner) {
    try (var c = reader()) {
      long visits, photos, total, current;
      try (var p =
          c.prepareStatement(
              "SELECT COUNT(*),COUNT(CASE WHEN has_photo THEN 1 END) FROM journey_records WHERE"
                  + " owner_id=?")) {
        p.setString(1, owner);
        try (var r = p.executeQuery()) {
          r.next();
          visits = r.getLong(1);
          photos = r.getLong(2);
        }
      }
      var ids = new ArrayList<String>();
      try (var p =
          c.prepareStatement(
              "SELECT DISTINCT point_id FROM journey_records WHERE owner_id=? ORDER BY point_id")) {
        p.setString(1, owner);
        try (var r = p.executeQuery()) {
          while (r.next()) ids.add(r.getString(1));
        }
      }
      try (var p =
          c.prepareStatement(
              "SELECT COUNT(*),COUNT(CASE WHEN EXISTS(SELECT 1 FROM journey_records j WHERE"
                  + " j.owner_id=? AND j.point_id=p.entity_id) THEN 1 END) FROM campus_points p"
                  + " WHERE p.group_name='points' AND p.published=TRUE")) {
        p.setString(1, owner);
        try (var r = p.executeQuery()) {
          r.next();
          total = r.getLong(1);
          current = r.getLong(2);
        }
      }
      return obj(
          "visits",
          visits,
          "photos",
          photos,
          "total",
          total,
          "current",
          current,
          "unique",
          ids.size(),
          "ids",
          ids);
    } catch (SQLException e) {
      throw new IllegalStateException("Journey summary failed", e);
    }
  }

  public Map<String, Object> achievement(String owner, Map<String, Object> rule) {
    String kind = str(rule.get("kind"));
    var args = new ArrayList<Object>();
    args.add(owner);
    var where = new StringBuilder(" WHERE owner_id=?");
    var points = list(rule.get("pointIds"));
    if (!points.isEmpty()) {
      where.append(
          " AND point_id IN (" + String.join(",", Collections.nCopies(points.size(), "?")) + ")");
      args.addAll(points);
    }
    if (kind.equals("photos") || kind.equals("night")) where.append(" AND has_photo=TRUE");
    if (kind.equals("night")) where.append(" AND is_night=TRUE");
    try (var c = reader();
        var p =
            c.prepareStatement(
                "SELECT "
                    + (kind.equals("collection") ? "COUNT(DISTINCT point_id)" : "COUNT(*)")
                    + " FROM journey_records"
                    + where)) {
      bind(p, args);
      try (var r = p.executeQuery()) {
        r.next();
        long n = r.getLong(1), target = integer(rule.get("target"));
        var out = obj();
        for (String k : List.of("id", "title", "description", "symbol", "kind", "target"))
          out.put(k, rule.get(k));
        out.put("badgePreset", rule.getOrDefault("badgePreset", "badge-01"));
        out.put("progress", Math.min(n, target));
        out.put("earned", n >= target);
        return out;
      }
    } catch (SQLException e) {
      throw new IllegalStateException("Journey achievement failed", e);
    }
  }

  public DatabasePage records(String owner, int page, int size) {
    try (var c = reader()) {
      long total;
      try (var p = c.prepareStatement("SELECT COUNT(*) FROM journey_records WHERE owner_id=?")) {
        p.setString(1, owner);
        try (var r = p.executeQuery()) {
          r.next();
          total = r.getLong(1);
        }
      }
      var items = new ArrayList<Map<String, Object>>();
      try (var p =
          c.prepareStatement(
              "SELECT payload FROM journey_records WHERE owner_id=? ORDER BY created_at DESC,id"
                  + " LIMIT ? OFFSET ?")) {
        bind(p, List.of(owner, size, (long) (page - 1) * size));
        try (var r = p.executeQuery()) {
          while (r.next()) items.add(parse(r.getString(1)));
        }
      }
      return new DatabasePage(items, total, page, size);
    } catch (SQLException e) {
      throw new IllegalStateException("Journey page failed", e);
    }
  }

  public DatabasePage map(
      double west, double south, double east, double north, int page, int size) {
    var args = List.of(west, east, south, north);
    String where = " WHERE published=TRUE AND lng BETWEEN ? AND ? AND lat BETWEEN ? AND ?";
    try (var c = reader()) {
      long total;
      try (var p = c.prepareStatement("SELECT COUNT(*) FROM map_points" + where)) {
        bind(p, args);
        try (var r = p.executeQuery()) {
          r.next();
          total = r.getLong(1);
        }
      }
      var items = new ArrayList<Map<String, Object>>();
      try (var p =
          c.prepareStatement(
              "SELECT payload FROM map_points" + where + " ORDER BY id LIMIT ? OFFSET ?")) {
        var all = new ArrayList<Object>(args);
        all.add(size);
        all.add((long) (page - 1) * size);
        bind(p, all);
        try (var r = p.executeQuery()) {
          while (r.next()) items.add(parse(r.getString(1)));
        }
      }
      return new DatabasePage(items, total, page, size);
    } catch (SQLException e) {
      throw new IllegalStateException("Map bounds query failed", e);
    }
  }

  public record InboxPage(List<Map<String, Object>> items, long unread, String next) {}

  public DatabasePage compare(String spot, String season, String band, int page) {
    String from =
        " FROM work_dates d JOIN extension_records w ON w.group_name='works' AND w.entity_id=d.id"
            + " JOIN extension_records s ON s.group_name='shootingSpots' AND s.entity_id=d.spot_id"
            + " JOIN campus_points p ON p.group_name='points' AND p.entity_id=d.point_id JOIN"
            + " user_accounts u ON u.group_name='users' AND u.entity_id=d.owner_id JOIN"
            + " checkin_records r ON r.group_name='checkins' AND r.entity_id=d.checkin_id AND"
            + " r.owner_id=d.owner_id WHERE d.spot_id=? AND w.state_name='approved' AND"
            + " s.state_name='published' AND p.published=TRUE AND u.state_name='enabled'";
    var args = new ArrayList<Object>();
    args.add(spot);
    if (!season.equals("all")) {
      from += " AND d.season=?";
      args.add(season);
    }
    if (!band.equals("all")) {
      from += " AND d.time_band=?";
      args.add(band);
    }
    try (var c = reader()) {
      long total;
      try (var p = c.prepareStatement("SELECT COUNT(*)" + from)) {
        bind(p, args);
        try (var r = p.executeQuery()) {
          r.next();
          total = r.getLong(1);
        }
      }
      var items = new ArrayList<Map<String, Object>>();
      try (var p =
          c.prepareStatement(
              "SELECT w.payload"
                  + from
                  + " ORDER BY w.created_at DESC,w.entity_id LIMIT 12 OFFSET ?")) {
        var values = new ArrayList<>(args);
        values.add((long) (page - 1) * 12);
        bind(p, values);
        try (var r = p.executeQuery()) {
          while (r.next()) items.add(parse(r.getString(1)));
        }
      }
      return new DatabasePage(items, total, page, 12);
    } catch (SQLException e) {
      throw new IllegalStateException("Work comparison failed", e);
    }
  }

  public InboxPage inbox(
      Set<String> features,
      String admin,
      boolean owner,
      Collection<?> read,
      String category,
      String before) {
    if (features.isEmpty()) return new InboxPage(List.of(), 0, null);
    var args = new ArrayList<Object>(features);
    var where =
        new StringBuilder(
            " WHERE feature IN ("
                + String.join(",", Collections.nCopies(features.size(), "?"))
                + ") AND (conversation_id='' OR (created_at>conversation_read_at AND EXISTS(SELECT"
                + " 1 FROM extension_records cv WHERE cv.group_name='conversations' AND"
                + " cv.entity_id=conversation_id)))");
    if (!owner) {
      where.append(" AND (admin_id='' OR admin_id=?)");
      args.add(admin);
    }
    try (var c = reader()) {
      long unread;
      var unreadWhere = new StringBuilder(where);
      var unreadArgs = new ArrayList<>(args);
      if (!read.isEmpty()) {
        unreadWhere.append(
            " AND id NOT IN (" + String.join(",", Collections.nCopies(read.size(), "?")) + ")");
        unreadArgs.addAll(read);
      }
      try (var p = c.prepareStatement("SELECT COUNT(*) FROM inbox_entries" + unreadWhere)) {
        bind(p, unreadArgs);
        try (var r = p.executeQuery()) {
          r.next();
          unread = r.getLong(1);
        }
      }
      if (!category.equals("all")) {
        where.append(" AND category=?");
        args.add(category);
      }
      if (!before.isEmpty()) {
        try (var p =
            c.prepareStatement("SELECT created_at FROM inbox_entries" + where + " AND id=?")) {
          var cursor = new ArrayList<>(args);
          cursor.add(before);
          bind(p, cursor);
          try (var r = p.executeQuery()) {
            if (!r.next()) throw new ApiException("待办已处理，请刷新列表", 409);
            String at = r.getString(1);
            where.append(" AND (created_at<? OR (created_at=? AND id>?))");
            args.addAll(List.of(at, at, before));
          }
        }
      }
      var items = new ArrayList<Map<String, Object>>();
      try (var p =
          c.prepareStatement(
              "SELECT * FROM inbox_entries" + where + " ORDER BY created_at DESC,id LIMIT 51")) {
        bind(p, args);
        try (var r = p.executeQuery()) {
          while (r.next())
            items.add(
                obj(
                    "id",
                    r.getString("id"),
                    "title",
                    r.getString("title"),
                    "message",
                    r.getString("message"),
                    "target",
                    r.getString("target"),
                    "createdAt",
                    r.getString("created_at"),
                    "category",
                    r.getString("category"),
                    "requestId",
                    r.getString("request_id").isEmpty() ? null : r.getString("request_id"),
                    "userId",
                    r.getString("user_id"),
                    "readAt",
                    read.contains(r.getString("id")) ? "read" : null));
        }
      }
      boolean more = items.size() > 50;
      if (more) items.removeLast();
      return new InboxPage(items, unread, more ? str(items.getLast().get("id")) : null);
    } catch (SQLException e) {
      throw new IllegalStateException("Inbox query failed", e);
    }
  }

  public Set<String> availableInboxIds(
      Set<String> features, String admin, boolean owner, Collection<?> ids) {
    if (ids.isEmpty() || features.isEmpty()) return Set.of();
    var args = new ArrayList<Object>(features);
    args.addAll(ids);
    String where =
        " WHERE feature IN ("
            + String.join(",", Collections.nCopies(features.size(), "?"))
            + ") AND id IN ("
            + String.join(",", Collections.nCopies(ids.size(), "?"))
            + ") AND (conversation_id='' OR (created_at>conversation_read_at AND EXISTS(SELECT 1"
            + " FROM extension_records cv WHERE cv.group_name='conversations' AND"
            + " cv.entity_id=conversation_id)))";
    if (!owner) {
      where += " AND (admin_id='' OR admin_id=?)";
      args.add(admin);
    }
    try (var c = reader();
        var p = c.prepareStatement("SELECT id FROM inbox_entries" + where)) {
      bind(p, args);
      var out = new HashSet<String>();
      try (var r = p.executeQuery()) {
        while (r.next()) out.add(r.getString(1));
      }
      return out;
    } catch (SQLException e) {
      throw new IllegalStateException("Inbox selection failed", e);
    }
  }
}
