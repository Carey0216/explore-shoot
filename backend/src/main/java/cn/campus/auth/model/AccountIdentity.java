package cn.campus.auth.model;

import static cn.campus.common.Json.*;

import java.util.Map;

/** Authentication identity, deliberately separate from passwords and public profile DTOs. */
public record AccountIdentity(
    String id, String username, boolean enabled, boolean deleted, String role) {
  public static AccountIdentity from(Map<String, Object> row) {
    return new AccountIdentity(
        str(row.get("id")),
        str(row.get("username")),
        yes(row.get("enabled")),
        yes(row.get("deleted")),
        str(row.get("role")));
  }

  public boolean active() {
    return enabled && !deleted;
  }
}
