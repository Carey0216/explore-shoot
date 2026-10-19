package cn.campus.storage.sql;

import java.util.*;

/** A bounded database result; total is a COUNT query, not a materialized collection size. */
public record DatabasePage(List<Map<String, Object>> items, long total, int page, int pageSize) {
  public boolean hasMore() {
    return (long) page * pageSize < total;
  }
}
