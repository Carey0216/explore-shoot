package cn.campus.content;

import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.util.*;
import org.springframework.stereotype.Service;

/** Editable public copy has a draft and an independently published snapshot. */
@Service
public class SiteContentService {
  public static final List<String> CATEGORIES = List.of("建筑", "自然", "人文", "运动");
  public static final List<String> CONDITIONS =
      List.of("night", "portrait", "architecture", "rain", "solo");

  public static Map<String, Object> defaults() {
    var value =
        obj(
            "siteName",
            "探索与拍摄",
            "campusName",
            "北方民族大学",
            "notice",
            "",
            "about",
            "校园机位、拍摄建议与私人打卡。",
            "help",
            "选择机位，查看站位与拍摄朝向，再记录自己的照片。",
            "shootingGuide",
            "请遵守现场开放时间，避免影响通行；拍摄他人前征得同意。");
    value.put(
        "categories",
        CATEGORIES.stream().map(id -> obj("id", id, "label", id, "description", "")).toList());
    var labels = List.of("夜景", "人像", "建筑", "雨天", "独自拍");
    var conditions = new ArrayList<Map<String, Object>>();
    for (int i = 0; i < CONDITIONS.size(); i++)
      conditions.add(obj("id", CONDITIONS.get(i), "label", labels.get(i), "description", ""));
    value.put("conditions", conditions);
    return value;
  }

  public static String text(Map<String, Object> input, String key, int max, boolean required) {
    if (!(input.get(key) instanceof String s) || s.length() > max || required && s.isBlank())
      throw new ApiException("请检查字段：" + key);
    return s.trim();
  }

  private Map<String, Object> validate(Map<String, Object> input) {
    var standard = defaults();
    if (!input.keySet().equals(standard.keySet())) throw new ApiException("站点内容字段无效");
    var result = obj();
    for (String field :
        List.of("siteName", "campusName", "notice", "about", "help", "shootingGuide"))
      result.put(
          field, text(input, field, field.endsWith("Name") ? 40 : 4000, field.endsWith("Name")));
    for (String field : List.of("categories", "conditions")) {
      List<String> ids = field.equals("categories") ? CATEGORIES : CONDITIONS;
      if (!(input.get(field) instanceof List<?> values)
          || values.size() != ids.size()
          || values.stream().anyMatch(value -> !(value instanceof Map<?, ?>)))
        throw new ApiException("分类或拍摄条件无效");
      var output = new ArrayList<Map<String, Object>>();
      for (String id : ids) {
        var rows = rows(input.get(field)).stream().filter(row -> eq(row.get("id"), id)).toList();
        if (rows.size() != 1
            || !rows.getFirst().keySet().equals(Set.of("id", "label", "description")))
          throw new ApiException("分类标识不可更改；只可编辑名称和说明");
        output.add(
            obj(
                "id",
                id,
                "label",
                text(rows.getFirst(), "label", 20, true),
                "description",
                text(rows.getFirst(), "description", 500, false)));
      }
      result.put(field, output);
    }
    return result;
  }

  public static Map<String, Object> publicContent(StoreRepository store) {
    var saved = map(store.db.get("siteContent"));
    var published = map(saved.get("published"));
    return published.isEmpty() ? defaults() : cn.campus.common.Json.clone(published);
  }

  public boolean handle(ApiContext c) throws Exception {
    if (c.audience.equals("user") && c.route("/api/site-content", "GET")) {
      c.send(publicContent(c.store));
      return true;
    }
    if (!c.audience.equals("admin") || !c.path.equals("/api/admin/site-content")) return false;
    c.need();
    var saved = map(c.store.db.get("siteContent"));
    if (c.method.equals("GET")) {
      c.send(
          obj(
              "revision",
              integer(saved.get("revision")),
              "draft",
              saved.getOrDefault("draft", publicContent(c.store)),
              "published",
              publicContent(c.store),
              "publishedAt",
              saved.get("publishedAt")));
      return true;
    }
    if (!c.method.equals("PUT")) return false;
    if (!c.body.keySet().equals(Set.of("revision", "action", "content")))
      throw new ApiException("参数无效");
    if (!whole(c.body.get("revision"))
        || integer(c.body.get("revision")) != integer(saved.get("revision")))
      throw new ApiException("内容已被其他管理员修改，请重新载入后重试", 409);
    String action = str(c.body.get("action"));
    if (!Set.of("draft", "publish", "unpublish").contains(action)) throw new ApiException("操作无效");
    if (!action.equals("draft")) c.superOnly();
    var content = validate(map(c.body.get("content")));
    var next = cn.campus.common.Json.clone(saved);
    next.put("draft", content);
    next.put("revision", integer(saved.get("revision")) + 1);
    if (action.equals("publish")) {
      next.put("published", cn.campus.common.Json.clone(content));
      next.put("publishedAt", StoreRepository.now());
    } else if (action.equals("unpublish")) {
      next.remove("published");
      next.remove("publishedAt");
    }
    c.store.db.put("siteContent", next);
    c.audit("站点内容" + action, "site-content", "修订 " + next.get("revision"));
    c.store.save();
    c.send(obj("ok", true, "revision", next.get("revision")));
    return true;
  }
}
