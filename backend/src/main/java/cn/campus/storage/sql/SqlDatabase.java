package cn.campus.storage.sql;

import static cn.campus.common.Json.*;

import cn.campus.common.Json;
import java.nio.file.*;
import java.sql.*;
import java.util.*;

/**
 * JDBC persistence. Payload preserves historical extension fields; indexed columns are queryable.
 */
public final class SqlDatabase implements AutoCloseable {
  private final Connection connection;
  private final String jdbcUrl;
  public static final Map<String, String> TABLES =
      Map.ofEntries(
          Map.entry("users", "user_accounts"), Map.entry("admins", "administrator_accounts"),
          Map.entry("auth", "auth_sessions"), Map.entry("points", "campus_points"),
          Map.entry("checkins", "checkin_records"), Map.entry("applications", "scout_applications"),
          Map.entry("reports", "content_reports"),
              Map.entry("notifications", "user_notifications"));

  public SqlDatabase(Path base) throws SQLException {
    jdbcUrl =
        "jdbc:h2:file:"
            + base.toAbsolutePath().toString().replace('\\', '/')
            + ";DB_CLOSE_ON_EXIT=FALSE;WRITE_DELAY=0;LOCK_TIMEOUT=5000";
    connection = DriverManager.getConnection(jdbcUrl, "sa", "");
    try (var s = connection.createStatement()) {
      s.execute(
          "CREATE TABLE IF NOT EXISTS schema_versions(version INT PRIMARY KEY, applied_at"
              + " VARCHAR(40) NOT NULL)");
      s.execute(
          "CREATE TABLE IF NOT EXISTS store_groups(group_name VARCHAR(200) PRIMARY KEY, ordinal_no"
              + " INT NOT NULL, is_records BOOLEAN NOT NULL, payload CLOB)");
      var tables = new HashSet<>(TABLES.values());
      tables.add("extension_records");
      for (String table : tables) {
        s.execute(
            "CREATE TABLE IF NOT EXISTS "
                + table
                + " (group_name VARCHAR(200) NOT NULL,row_key VARCHAR(36) NOT NULL,ordinal_no INT"
                + " NOT NULL,entity_id VARCHAR(200),owner_id VARCHAR(200),point_id"
                + " VARCHAR(200),account_name VARCHAR(200),state_name VARCHAR(80),published"
                + " BOOLEAN,created_at VARCHAR(40),payload CLOB NOT NULL,PRIMARY"
                + " KEY(group_name,row_key))");
        s.execute(
            "CREATE INDEX IF NOT EXISTS ix_"
                + table
                + "_owner ON "
                + table
                + "(group_name,owner_id)");
        s.execute(
            "CREATE INDEX IF NOT EXISTS ix_"
                + table
                + "_id ON "
                + table
                + "(group_name,entity_id)");
        s.execute(
            "CREATE INDEX IF NOT EXISTS ix_"
                + table
                + "_name ON "
                + table
                + "(group_name,account_name)");
        s.execute(
            "CREATE INDEX IF NOT EXISTS ix_"
                + table
                + "_point ON "
                + table
                + "(group_name,point_id)");
      }
      s.execute(
          "INSERT INTO schema_versions SELECT 1,CURRENT_TIMESTAMP WHERE NOT EXISTS(SELECT 1 FROM"
              + " schema_versions WHERE version=1)");
    }
    try (var s = connection.createStatement()) {
      s.execute(
          "CREATE TABLE IF NOT EXISTS point_search (entity_id VARCHAR(200) PRIMARY KEY, theme"
              + " VARCHAR(80), search_text CLOB, conditions VARCHAR(2000), popularity BIGINT,"
              + " published BOOLEAN, ordinal_no INT)");
      s.execute(
          "CREATE INDEX IF NOT EXISTS ix_point_search_theme ON"
              + " point_search(published,theme,ordinal_no)");
      s.execute(
          "CREATE INDEX IF NOT EXISTS ix_point_search_popular ON"
              + " point_search(published,popularity)");
      for (String table : new HashSet<>(TABLES.values()))
        s.execute(
            "CREATE INDEX IF NOT EXISTS ix_"
                + table
                + "_queue ON "
                + table
                + "(group_name,state_name,created_at,entity_id)");
      s.execute(
          "CREATE INDEX IF NOT EXISTS ix_extension_queue ON"
              + " extension_records(group_name,state_name,created_at,entity_id)");
    }
    try (var s = connection.createStatement()) {
      s.execute(
          "ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS category_name VARCHAR(40)");
      s.execute("ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS read_at VARCHAR(40)");
      s.execute(
          "CREATE INDEX IF NOT EXISTS ix_notification_category ON"
              + " user_notifications(group_name,owner_id,category_name,ordinal_no)");
      s.execute(
          "CREATE INDEX IF NOT EXISTS ix_notification_unread ON"
              + " user_notifications(group_name,owner_id,read_at)");
    }
    connection.setAutoCommit(false);
  }

  static String table(String group) {
    return TABLES.getOrDefault(group, "extension_records");
  }

  public boolean initialized() throws SQLException {
    try (var s = connection.createStatement();
        var r = s.executeQuery("SELECT COUNT(*) FROM store_groups")) {
      r.next();
      return r.getInt(1) > 0;
    }
  }

  public TrackedDocument load() throws SQLException {
    var result = new TrackedDocument();
    try (var s = connection.createStatement();
        var groups = s.executeQuery("SELECT * FROM store_groups ORDER BY ordinal_no")) {
      while (groups.next()) {
        String name = groups.getString("group_name");
        if (groups.getBoolean("is_records")) {
          var list = result.newRecords(name);
          try (var p =
              connection.prepareStatement(
                  "SELECT row_key,payload FROM "
                      + table(name)
                      + " WHERE group_name=? ORDER BY ordinal_no")) {
            p.setString(1, name);
            try (var rows = p.executeQuery()) {
              while (rows.next()) list.loaded(rows.getString(1), parse(rows.getString(2)));
            }
          }
        } else
          result.loaded(name, Json.MAPPER.readValue(groups.getString("payload"), Object.class));
      }
    } catch (java.io.IOException e) {
      throw new SQLException("Invalid stored JSON extension", e);
    }
    result.clean();
    return result;
  }

  public int save(TrackedDocument state) throws SQLException {
    int changed = 0;
    try {
      for (String name : state.removedGroups()) {
        try (var p =
            connection.prepareStatement("DELETE FROM " + table(name) + " WHERE group_name=?")) {
          p.setString(1, name);
          p.executeUpdate();
        }
        try (var p = connection.prepareStatement("DELETE FROM store_groups WHERE group_name=?")) {
          p.setString(1, name);
          p.executeUpdate();
        }
      }
      int ordinal = 0;
      for (var entry : state.entrySet()) {
        String name = entry.getKey();
        Object value = entry.getValue();
        boolean records = value instanceof TrackedDocument.Records;
        if (state.dirtyGroup(name)) {
          try (var p =
              connection.prepareStatement(
                  "MERGE INTO store_groups KEY(group_name) VALUES(?,?,?,?)")) {
            p.setString(1, name);
            p.setInt(2, ordinal);
            p.setBoolean(3, records);
            p.setString(4, records ? null : write(value));
            p.executeUpdate();
            changed++;
          }
        }
        if (records) {
          var rows = (TrackedDocument.Records) value;
          if (!rows.structureDirty && rows.modified.isEmpty()) {
            ordinal++;
            continue;
          }
          for (String removed : rows.removed())
            try (var p =
                connection.prepareStatement(
                    "DELETE FROM " + table(name) + " WHERE group_name=? AND row_key=?")) {
              p.setString(1, name);
              p.setString(2, removed);
              p.executeUpdate();
              changed++;
            }
          int cursor = 0;
          for (var row : rows.structureDirty ? rows.records() : rows.modified) {
            int position = rows.structureDirty ? cursor++ : row.position;
            if (row.dirty) {
              Map<String, Object> m = row.data;
              try (var p =
                  connection.prepareStatement(
                      "MERGE INTO "
                          + table(name)
                          + " (group_name,row_key,ordinal_no,entity_id,owner_id,point_id,account_name,state_name,published,created_at,payload)"
                          + " KEY(group_name,row_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)")) {
                p.setString(1, name);
                p.setString(2, row.key);
                p.setInt(3, position);
                p.setString(4, str(m.getOrDefault("id", m.get("hash"))));
                p.setString(
                    5,
                    str(
                        name.equals("directMessages")
                            ? m.get("conversationId")
                            : m.getOrDefault(
                                "ownerId", m.getOrDefault("userId", m.get("authorId")))));
                p.setString(6, str(m.get("pointId")));
                p.setString(7, str(m.get("username")));
                p.setString(
                    8,
                    str(
                        m.getOrDefault(
                            "status",
                            m.getOrDefault("state", m.getOrDefault("from", m.get("value"))))));
                p.setBoolean(9, yes(m.get("published")));
                p.setString(10, str(m.get("createdAt")));
                p.setString(11, write(m));
                // Extension columns are maintained separately; legacy payload columns stay
                // explicit.
                p.executeUpdate();
                if (name.equals("notifications"))
                  try (var projection =
                      connection.prepareStatement(
                          "UPDATE user_notifications SET category_name=?,read_at=? WHERE"
                              + " group_name=? AND row_key=?")) {
                    projection.setString(1, cn.campus.notification.NotificationService.category(m));
                    projection.setString(2, m.get("readAt") == null ? null : str(m.get("readAt")));
                    projection.setString(3, name);
                    projection.setString(4, row.key);
                    projection.executeUpdate();
                  }
                changed++;
              }
            } else if (rows.structureDirty && row.position != position) {
              try (var p =
                  connection.prepareStatement(
                      "UPDATE "
                          + table(name)
                          + " SET ordinal_no=? WHERE group_name=? AND row_key=?")) {
                p.setInt(1, position);
                p.setString(2, name);
                p.setString(3, row.key);
                p.executeUpdate();
              }
            }
          }
        }
        ordinal++;
      }
      refreshSearch(state);
      connection.commit();
      state.clean();
      return changed;
    } catch (Exception e) {
      connection.rollback();
      if (e instanceof SQLException s) throw s;
      throw new SQLException("SQL transaction failed", e);
    }
  }

  // Search documents are maintained with the same transaction as source rows.
  // Only changed points are projected; related editorial changes invalidate their own points.
  private void refreshSearch(TrackedDocument state) throws SQLException {
    Set<String> affected = new HashSet<>();
    for (String group : List.of("points", "templates", "shootingSpots")) {
      Object value = state.get(group);
      if (!(value instanceof TrackedDocument.Records records)) continue;
      if (records.structureDirty) {
        // Deletion/reordering is infrequent; backfill also removes stale search documents.
        try (var s = connection.createStatement()) {
          s.executeUpdate("DELETE FROM point_search");
        }
        affected.addAll(rows(state.get("points")).stream().map(p -> str(p.get("id"))).toList());
        break;
      }
      for (var row : records.modified)
        affected.add(str(row.data.get(group.equals("points") ? "id" : "pointId")));
    }
    if (affected.isEmpty()) return;
    for (var point : rows(state.get("points"))) {
      if (!affected.contains(str(point.get("id")))) continue;
      StringBuilder text = new StringBuilder();
      for (String key : List.of("name", "description", "theme", "address"))
        text.append(' ').append(str(point.get(key)));
      var conditions = new TreeSet<String>();
      for (var template : rows(state.get("templates")))
        if (eq(template.get("pointId"), point.get("id")) && yes(template.get("approved")))
          text.append(' ').append(str(template.get("title")));
      for (var spot : rows(state.get("shootingSpots")))
        if (eq(spot.get("pointId"), point.get("id"))
            && eq(spot.get("status"), "published")
            && !yes(spot.get("deleted"))) {
          text.append(' ')
              .append(str(spot.get("title")))
              .append(' ')
              .append(str(spot.get("standDescription")));
          list(spot.get("conditions")).forEach(x -> conditions.add(str(x)));
        }
      try (var p =
          connection.prepareStatement(
              "MERGE INTO point_search KEY(entity_id) VALUES(?,?,?,?,?,?,?)")) {
        p.setString(1, str(point.get("id")));
        p.setString(2, str(point.get("theme")));
        p.setString(3, cn.campus.point.PointSearchService.normalize(text.toString()));
        p.setString(4, "|" + String.join("|", conditions) + "|");
        p.setLong(5, integer(cn.campus.point.PointService.stats(point).get("popularity")));
        p.setBoolean(6, yes(point.get("published")));
        p.setInt(7, rows(state.get("points")).indexOf(point));
        p.executeUpdate();
      }
    }
  }

  public void initializeSearch(TrackedDocument state) throws SQLException {
    try (var s = connection.createStatement();
        var r = s.executeQuery("SELECT COUNT(*) FROM point_search")) {
      r.next();
      if (r.getLong(1) > 0 || rows(state.get("points")).isEmpty()) return;
    }
    // A derived index can be rebuilt without touching business payloads.
    var rebuild = TrackedDocument.from(state);
    refreshSearch(rebuild);
    connection.commit();
  }

  private static void in(
      StringBuilder where,
      List<Object> args,
      String column,
      Collection<?> values,
      boolean exclude) {
    if (values.isEmpty()) {
      if (!exclude) where.append(" AND 1=0");
      return;
    }
    where
        .append(" AND ")
        .append(column)
        .append(exclude ? " NOT IN (" : " IN (")
        .append(String.join(",", Collections.nCopies(values.size(), "?")))
        .append(")");
    args.addAll(values);
  }

  private static void bind(PreparedStatement p, List<Object> args) throws SQLException {
    for (int i = 0; i < args.size(); i++) p.setObject(i + 1, args.get(i));
  }

  public DatabasePage searchPoints(
      cn.campus.point.dto.PointSearchRequest request,
      Collection<?> saved,
      Collection<?> visited,
      Set<String> disliked)
      throws SQLException {
    var args = new ArrayList<Object>();
    var where = new StringBuilder(" WHERE s.published=TRUE");
    if (!request.theme().equals("全部")) {
      where.append(" AND s.theme=?");
      args.add(request.theme());
    }
    String query = cn.campus.point.PointSearchService.normalizedQuery(request.query());
    if (!query.isEmpty()) {
      where.append(" AND LOCATE(?,s.search_text)>0");
      args.add(query);
    }
    if (!request.condition().isEmpty()) {
      where.append(" AND LOCATE(?,s.conditions)>0");
      args.add("|" + request.condition() + "|");
    }
    if (request.filter().equals("saved")) in(where, args, "s.entity_id", saved, false);
    if (request.filter().equals("visited")) in(where, args, "s.entity_id", visited, false);
    if (request.filter().equals("unvisited")) in(where, args, "s.entity_id", visited, true);
    String order = "s.ordinal_no";
    if (request.filter().equals("popular")) order = "s.popularity DESC,s.ordinal_no";
    var orderArgs = new ArrayList<Object>();
    if (!disliked.isEmpty()) {
      order =
          "CASE WHEN s.entity_id IN ("
              + String.join(",", Collections.nCopies(disliked.size(), "?"))
              + ") THEN 1 ELSE 0 END,"
              + order;
      orderArgs.addAll(disliked);
    }
    try (var reader = DriverManager.getConnection(jdbcUrl, "sa", "")) {
      long total;
      try (var p = reader.prepareStatement("SELECT COUNT(*) FROM point_search s" + where)) {
        bind(p, args);
        try (var r = p.executeQuery()) {
          r.next();
          total = r.getLong(1);
        }
      }
      var params = new ArrayList<>(args);
      params.addAll(orderArgs);
      params.add(request.pageSize());
      params.add((long) (request.page() - 1) * request.pageSize());
      var result = new ArrayList<Map<String, Object>>();
      try (var p =
          reader.prepareStatement(
              "SELECT p.payload FROM point_search s JOIN campus_points p ON p.group_name='points'"
                  + " AND p.entity_id=s.entity_id"
                  + where
                  + " ORDER BY "
                  + order
                  + " LIMIT ? OFFSET ?")) {
        bind(p, params);
        try (var r = p.executeQuery()) {
          while (r.next()) result.add(parse(r.getString(1)));
        }
      }
      return new DatabasePage(result, total, request.page(), request.pageSize());
    }
  }

  public DatabasePage page(
      String group, String status, String owner, String query, int page, int size)
      throws SQLException {
    if (!Set.of(
            "applications",
            "reports",
            "works",
            "workReports",
            "shootingSpots",
            "notifications",
            "directMessages",
            "contactRequests",
            "points")
        .contains(group)) throw new IllegalArgumentException("Unsupported queue");
    var args = new ArrayList<Object>();
    args.add(group);
    var where = new StringBuilder(" WHERE group_name=?");
    if (!status.isEmpty()) {
      where.append(" AND state_name=?");
      args.add(status);
    }
    if (!owner.isEmpty()) {
      where.append(" AND owner_id=?");
      args.add(owner);
    }
    if (!query.isEmpty()) {
      where.append(" AND LOCATE(?,LOWER(payload))>0");
      args.add(query.toLowerCase(Locale.ROOT));
    }
    try (var reader = DriverManager.getConnection(jdbcUrl, "sa", "")) {
      long total;
      try (var p = reader.prepareStatement("SELECT COUNT(*) FROM " + table(group) + where)) {
        bind(p, args);
        try (var r = p.executeQuery()) {
          r.next();
          total = r.getLong(1);
        }
      }
      args.add(size);
      args.add((long) (page - 1) * size);
      var result = new ArrayList<Map<String, Object>>();
      try (var p =
          reader.prepareStatement(
              "SELECT payload FROM "
                  + table(group)
                  + where
                  + " ORDER BY created_at DESC,entity_id LIMIT ? OFFSET ?")) {
        bind(p, args);
        try (var r = p.executeQuery()) {
          while (r.next()) result.add(parse(r.getString(1)));
        }
      }
      return new DatabasePage(result, total, page, size);
    }
  }

  public record NotificationPage(List<Map<String, Object>> items, long unread, String next) {}

  public NotificationPage notifications(String owner, String category, String before)
      throws SQLException {
    try (var reader = DriverManager.getConnection(jdbcUrl, "sa", "")) {
      long unread;
      try (var p =
          reader.prepareStatement(
              "SELECT COUNT(*) FROM user_notifications WHERE group_name='notifications' AND"
                  + " owner_id=? AND read_at IS NULL")) {
        p.setString(1, owner);
        try (var r = p.executeQuery()) {
          r.next();
          unread = r.getLong(1);
        }
      }
      var args = new ArrayList<Object>();
      args.add(owner);
      var where = new StringBuilder(" WHERE group_name='notifications' AND owner_id=?");
      if (!category.equals("all")) {
        where.append(" AND category_name=?");
        args.add(category);
      }
      if (!before.isEmpty()) {
        try (var p =
            reader.prepareStatement(
                "SELECT ordinal_no FROM user_notifications WHERE group_name='notifications' AND"
                    + " owner_id=? AND entity_id=?")) {
          p.setString(1, owner);
          p.setString(2, before);
          try (var r = p.executeQuery()) {
            if (!r.next()) throw new cn.campus.common.ApiException("通知分页已失效，请刷新", 409);
            where.append(" AND ordinal_no<?");
            args.add(r.getInt(1));
          }
        }
      }
      var items = new ArrayList<Map<String, Object>>();
      try (var p =
          reader.prepareStatement(
              "SELECT payload FROM user_notifications"
                  + where
                  + " ORDER BY ordinal_no DESC LIMIT 31")) {
        bind(p, args);
        try (var r = p.executeQuery()) {
          while (r.next()) items.add(parse(r.getString(1)));
        }
      }
      String next = items.size() > 30 ? str(items.get(29).get("id")) : null;
      return new NotificationPage(
          List.copyOf(items.subList(0, Math.min(30, items.size()))), unread, next);
    }
  }

  public long count(String group, String field, String value) throws SQLException {
    if (!Set.of("status", "published", "all").contains(field))
      throw new IllegalArgumentException("Unsupported count field");
    try (var reader = DriverManager.getConnection(jdbcUrl, "sa", "");
        var p =
            reader.prepareStatement(
                "SELECT COUNT(*) FROM "
                    + table(group)
                    + " WHERE group_name=?"
                    + (field.equals("all")
                        ? ""
                        : field.equals("status") ? " AND state_name=?" : " AND published=?"))) {
      p.setString(1, group);
      if (!field.equals("all"))
        p.setObject(2, field.equals("published") ? Boolean.parseBoolean(value) : value);
      try (var r = p.executeQuery()) {
        r.next();
        return r.getLong(1);
      }
    }
  }

  public record MessagePage(List<Map<String, Object>> items, String next) {}

  public MessagePage messages(String conversation, String before) throws SQLException {
    try (var reader = DriverManager.getConnection(jdbcUrl, "sa", "")) {
      var args = new ArrayList<Object>();
      args.add(conversation);
      var where = new StringBuilder(" WHERE group_name='directMessages' AND owner_id=?");
      if (!before.isEmpty())
        try (var p =
            reader.prepareStatement(
                "SELECT ordinal_no FROM extension_records WHERE group_name='directMessages' AND"
                    + " owner_id=? AND entity_id=?")) {
          p.setString(1, conversation);
          p.setString(2, before);
          try (var r = p.executeQuery()) {
            if (!r.next()) throw new cn.campus.common.ApiException("消息分页已失效，请刷新");
            where.append(" AND ordinal_no<?");
            args.add(r.getInt(1));
          }
        }
      var items = new ArrayList<Map<String, Object>>();
      try (var p =
          reader.prepareStatement(
              "SELECT payload FROM extension_records"
                  + where
                  + " ORDER BY ordinal_no DESC LIMIT 51")) {
        bind(p, args);
        try (var r = p.executeQuery()) {
          while (r.next()) items.add(parse(r.getString(1)));
        }
      }
      boolean more = items.size() > 50;
      if (more) items.removeLast();
      Collections.reverse(items);
      return new MessagePage(List.copyOf(items), more ? str(items.getFirst().get("id")) : null);
    }
  }

  public long unreadMessages(String conversation, String from, String readAt) throws SQLException {
    try (var reader = DriverManager.getConnection(jdbcUrl, "sa", "");
        var p =
            reader.prepareStatement(
                "SELECT COUNT(*) FROM extension_records WHERE group_name='directMessages' AND"
                    + " owner_id=? AND state_name=? AND created_at>?")) {
      p.setString(1, conversation);
      p.setString(2, from);
      p.setString(3, readAt);
      try (var r = p.executeQuery()) {
        r.next();
        return r.getLong(1);
      }
    }
  }

  public void close() throws SQLException {
    connection.close();
  }

  public List<String> findKeys(String group, String column, String value) throws SQLException {
    if (!Set.of("entity_id", "owner_id", "account_name", "point_id").contains(column))
      throw new IllegalArgumentException("Unsupported indexed field");
    try (var reader = DriverManager.getConnection(jdbcUrl, "sa", "");
        var query =
            reader.prepareStatement(
                "SELECT row_key FROM "
                    + table(group)
                    + " WHERE group_name=? AND "
                    + column
                    + "=? ORDER BY ordinal_no")) {
      query.setString(1, group);
      query.setString(2, value);
      var keys = new ArrayList<String>();
      try (var rows = query.executeQuery()) {
        while (rows.next()) keys.add(rows.getString(1));
      }
      return keys;
    }
  }

  public void backup(Path archive) throws SQLException {
    if (Files.exists(archive)) throw new IllegalArgumentException("Backup already exists");
    connection.commit();
    try (var s = connection.createStatement()) {
      s.execute(
          "BACKUP TO '"
              + archive.toAbsolutePath().toString().replace('\\', '/').replace("'", "''")
              + "'");
    }
  }
}
