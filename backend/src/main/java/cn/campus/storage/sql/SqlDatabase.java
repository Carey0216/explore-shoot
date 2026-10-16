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
                          + " KEY(group_name,row_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)")) {
                p.setString(1, name);
                p.setString(2, row.key);
                p.setInt(3, position);
                p.setString(4, str(m.getOrDefault("id", m.get("hash"))));
                p.setString(5, str(m.get("ownerId")));
                p.setString(6, str(m.get("pointId")));
                p.setString(7, str(m.get("username")));
                p.setString(8, str(m.getOrDefault("status", m.get("state"))));
                p.setBoolean(9, yes(m.get("published")));
                p.setString(10, str(m.get("createdAt")));
                p.setString(11, write(m));
                // There are eleven persisted columns, deliberately explicit for review.
                p.executeUpdate();
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
      connection.commit();
      state.clean();
      return changed;
    } catch (Exception e) {
      connection.rollback();
      if (e instanceof SQLException s) throw s;
      throw new SQLException("SQL transaction failed", e);
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
