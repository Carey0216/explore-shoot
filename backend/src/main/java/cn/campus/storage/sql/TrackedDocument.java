package cn.campus.storage.sql;

import cn.campus.common.Json;
import java.util.*;

/**
 * Compatibility adapter with record-level dirty tracking. Failed units reload committed SQL data.
 */
public final class TrackedDocument extends AbstractMap<String, Object> {
  private final LinkedHashMap<String, Object> values = new LinkedHashMap<>();
  private final Set<String> dirty = new HashSet<>(), removed = new HashSet<>();

  public static TrackedDocument from(Map<String, Object> data) {
    var state = new TrackedDocument();
    data.forEach(state::put);
    return state;
  }

  private void touch(Row row) {
    row.dirty = true;
    row.owner.modified.add(row);
  }

  private void structure(Records list) {
    list.structureDirty = true;
  }

  private void metadata(String name) {
    dirty.add(name);
  }

  private Object wrapGroup(String name, Object value) {
    if (value instanceof List<?> list && list.stream().allMatch(v -> v instanceof Map<?, ?>)) {
      var records = new Records(name);
      for (Object row : list) records.loaded(UUID.randomUUID().toString(), Json.map(row));
      records.items.forEach(this::touch);
      records.structureDirty = true;
      return records;
    }
    return node(value, () -> metadata(name));
  }

  public void loaded(String name, Object value) {
    values.put(name, node(value, () -> metadata(name)));
  }

  public Records newRecords(String name) {
    var r = new Records(name);
    values.put(name, r);
    return r;
  }

  public Object get(Object key) {
    return values.get(key);
  }

  public boolean containsKey(Object key) {
    return values.containsKey(key);
  }

  public Object computeIfAbsent(
      String key, java.util.function.Function<? super String, ?> factory) {
    Object value = get(key);
    if (value == null) {
      Object made = factory.apply(key);
      if (made != null) {
        put(key, made);
        value = get(key);
      }
    }
    return value;
  }

  public Set<Entry<String, Object>> entrySet() {
    return Collections.unmodifiableMap(values).entrySet();
  }

  public Object put(String name, Object value) {
    if (name.length() > 200) throw new IllegalArgumentException("Stored field name too long");
    boolean added = !values.containsKey(name);
    Object prior = values.put(name, wrapGroup(name, value));
    dirty.add(name);
    if (prior instanceof Records) removed.add(name);
    if (added) dirty.addAll(values.keySet());
    return prior;
  }

  public Object remove(Object key) {
    if (!(key instanceof String name) || !values.containsKey(name)) return null;
    removed.add(name);
    Object prior = values.remove(name);
    dirty.addAll(values.keySet());
    return prior;
  }

  public Set<String> removedGroups() {
    return removed;
  }

  public boolean dirtyGroup(String name) {
    return dirty.contains(name);
  }

  public void replaceExisting(Set<String> groups) {
    removed.addAll(groups);
    dirty.addAll(values.keySet());
  }

  public void clean() {
    dirty.clear();
    removed.clear();
    for (Object value : values.values())
      if (value instanceof Records rows) {
        if (rows.structureDirty) {
          rows.baseline.clear();
          rows.lookup.clear();
          int position = 0;
          for (Row row : rows.items) {
            row.position = position++;
            row.dirty = false;
            rows.baseline.add(row.key);
            rows.lookup.put(row.key, row);
          }
        } else rows.modified.forEach(row -> row.dirty = false);
        rows.modified.clear();
        rows.structureDirty = false;
      }
  }

  public final class Records extends AbstractList<Map<String, Object>> {
    private final String name;
    private final List<Row> items = new ArrayList<>();
    private final Set<String> baseline = new HashSet<>();
    final Set<Row> modified = new HashSet<>();
    private final Map<String, Row> lookup = new HashMap<>();

    public Map<String, Object> byStorageKey(String key) {
      var row = lookup.get(key);
      return row == null ? null : row.data;
    }

    boolean structureDirty;

    Records(String name) {
      this.name = name;
    }

    void loaded(String key, Map<String, Object> data) {
      var row = new Row(this, key, data);
      row.position = items.size();
      items.add(row);
      lookup.put(key, row);
      baseline.add(key);
    }

    List<Row> records() {
      return items;
    }

    Set<String> removed() {
      if (!structureDirty) return Set.of();
      var keys = new HashSet<>(baseline);
      items.forEach(r -> keys.remove(r.key));
      return keys;
    }

    public int size() {
      return items.size();
    }

    public Map<String, Object> get(int index) {
      return items.get(index).data;
    }

    public void add(int index, Map<String, Object> value) {
      structure(this);
      var row = new Row(this, UUID.randomUUID().toString(), value);
      row.dirty = true;
      row.owner.modified.add(row);
      items.add(index, row);
      modCount++;
    }

    public Map<String, Object> remove(int index) {
      structure(this);
      modCount++;
      return items.remove(index).data;
    }

    public Map<String, Object> set(int index, Map<String, Object> value) {
      if (items.get(index).data == value) return value;
      structure(this);
      Row found = items.stream().filter(r -> r.data == value).findFirst().orElse(null);
      if (found == null) {
        found = new Row(this, UUID.randomUUID().toString(), value);
        found.dirty = true;
      }
      return items.set(index, found).data;
    }
  }

  final class Row {
    final Records owner;
    int position = -1;
    final String key;
    Map<String, Object> data;
    boolean dirty;

    Row(Records owner, String key, Map<String, Object> data) {
      this.owner = owner;
      this.key = key;
      this.data = mapNode(data, () -> touch(this));
    }
  }

  private static Object node(Object value, Runnable before) {
    if (value instanceof Map<?, ?> map) return mapNode(Json.map(map), before);
    if (value instanceof List<?> list) return new NodeList(list, before);
    return value;
  }

  private static Map<String, Object> mapNode(Map<String, Object> value, Runnable before) {
    return new NodeMap(value, before);
  }

  private static final class NodeMap extends AbstractMap<String, Object> {
    private final Map<String, Object> values = new LinkedHashMap<>();
    private final Runnable before;

    NodeMap(Map<String, Object> initial, Runnable before) {
      this.before = before;
      initial.forEach((key, value) -> values.put(key, node(value, before)));
    }

    public Object get(Object key) {
      return values.get(key);
    }

    public boolean containsKey(Object key) {
      return values.containsKey(key);
    }

    public Object computeIfAbsent(
        String key, java.util.function.Function<? super String, ?> factory) {
      Object value = get(key);
      if (value == null) {
        Object made = factory.apply(key);
        if (made != null) {
          put(key, made);
          value = get(key);
        }
      }
      return value;
    }

    public Object put(String key, Object value) {
      if (values.containsKey(key) && Objects.equals(values.get(key), value)) return values.get(key);
      before.run();
      return values.put(key, node(value, before));
    }

    public Object remove(Object key) {
      if (!values.containsKey(key)) return null;
      before.run();
      return values.remove(key);
    }

    public Set<Entry<String, Object>> entrySet() {
      return new AbstractSet<>() {
        public int size() {
          return values.size();
        }

        public Iterator<Entry<String, Object>> iterator() {
          var it = values.entrySet().iterator();
          return new Iterator<>() {
            public boolean hasNext() {
              return it.hasNext();
            }

            public Entry<String, Object> next() {
              var e = it.next();
              return new SimpleEntry<>(e) {
                public Object setValue(Object value) {
                  Object old = NodeMap.this.put(getKey(), value);
                  super.setValue(NodeMap.this.get(getKey()));
                  return old;
                }
              };
            }

            public void remove() {
              before.run();
              it.remove();
            }
          };
        }
      };
    }
  }

  private static final class NodeList extends AbstractList<Object> {
    private final List<Object> values = new ArrayList<>();
    private final Runnable before;

    NodeList(List<?> source, Runnable before) {
      this.before = before;
      source.forEach(v -> values.add(node(v, before)));
    }

    public int size() {
      return values.size();
    }

    public Object get(int i) {
      return values.get(i);
    }

    public Object set(int i, Object v) {
      if (Objects.equals(values.get(i), v)) return values.get(i);
      before.run();
      return values.set(i, node(v, before));
    }

    public void add(int i, Object v) {
      before.run();
      values.add(i, node(v, before));
      modCount++;
    }

    public Object remove(int i) {
      before.run();
      modCount++;
      return values.remove(i);
    }
  }
}
