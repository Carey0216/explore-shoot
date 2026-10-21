package cn.campus.ai.knowledge;

import static cn.campus.common.Json.*;

import cn.campus.admin.AdminPermissions;
import cn.campus.common.*;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.text.Normalizer;
import java.util.*;

/** Public help text; provider credentials remain in the separate encrypted settings. */
public record SupportPolicy(
    long revision, boolean furtherEnabled, String modelLabel, List<Preset> presets) {
  public record Preset(String id, String title, List<String> keywords, String answer, String path) {
    Map<String, Object> value() {
      return obj("id", id, "title", title, "keywords", keywords, "answer", answer, "path", path);
    }
  }

  private static Preset preset(String id, String title, String keys, String answer, String path) {
    return new Preset(id, title, List.of(keys.split("、")), answer, path);
  }

  private static final List<Preset> DEFAULTS =
      List.of(
          preset(
              "start",
              "第一次来，怎么开始？",
              "第一次来、刚入学、新生、从哪里开始",
              "可以先看新生拍摄指南，再选择离自己近的一处地点。点位详情里查看导航、机位和拍摄建议；现场开放情况请再确认。",
              "#guides"),
          preset(
              "login",
              "如何注册和登录？",
              "注册、登录不上、如何登录、怎么登录",
              "点击右上角头像区域的“登录 / 注册”。已有账号直接登录；账号处理或密码问题可联系管理员，请不要在助手里发送密码。",
              "#contact"),
          preset(
              "draft",
              "退出编辑，草稿还在吗？",
              "草稿、退出编辑、没写完、未发送",
              "未完成的发布内容和助手输入保存在当前浏览器，并按账号隔离。返回后可继续；清除浏览器数据或换设备不会带走本机草稿。提交失败时先保留页面内容再重试。",
              "#publish"),
          preset(
              "camera",
              "相机打不开怎么办？",
              "相机打不开、摄像头、拍照失败、无法拍照",
              "先检查浏览器的相机权限，并使用HTTPS打开网页。系统拍照不可用时可选内建相机；相机启动后点击“拍一张”。也可以选择自己拍摄的照片。",
              "#publish"),
          preset(
              "bookmark",
              "收藏在哪里查看？",
              "收藏、取消收藏",
              "点地点卡片的爱心即可收藏，再次点击取消；登录后在“我的 → 收藏”查看，也可用收藏分组整理。收藏本身不会公开私人拍摄清单。",
              "#me"),
          preset(
              "plan",
              "怎样安排拍摄清单？",
              "拍摄清单、拍摄计划、路线排序、出发清单",
              "在机位详情加入拍摄清单，再在“我的 → 拍摄清单”调整顺序、出发时间和停留时长，检查开放冲突。助手可先预览安排，只有确认后才保存。",
              "#plans"),
          preset(
              "checkin",
              "打卡照片会公开吗？",
              "打卡、私人照片、照片公开、隐私",
              "打卡照片和感受默认仅自己可见。只有你主动申请公开、且审核通过的作品才进入作品墙。地点坐标不等于精确站位，自主打卡也不代表实地认证。",
              "#passport"),
          preset(
              "spot",
              "地点和机位有什么区别？",
              "机位、站位、拍摄朝向",
              "地点是校园里的一个位置；真实机位会进一步说明站在哪里、朝向哪里、适合时段和核验日期。未核实的资料会提示待确认，不应当作实时开放保证。",
              "#shots"),
          preset(
              "theme",
              "怎样切换深色模式？",
              "深色、浅色、黑色模式、跟随系统",
              "打开“我的 → 账户设置 → 外观”，可选跟随系统、浅色或深色。默认跟随系统；登录后的手动选择随账号保存。",
              "#settings"),
          preset(
              "messages",
              "怎样联系管理员？",
              "管理员、消息、通知、反馈问题",
              "在“我的 → 联系管理员”留言。管理员回应并建立联系后，可以在消息中心通过聊天气泡继续对话；通知中的已读只表示看过，不代表问题已经处理。",
              "#contact"),
          preset(
              "share",
              "怎样分享校园地点？",
              "分享、二维码、复制链接",
              "打开地点详情，点右上角分享。可以复制直达详情的链接，或生成带二维码的分享图片。接收者无需登录即可浏览仍在公开展示的地点。",
              "#discover"));

  public static SupportPolicy load(StoreRepository store) {
    var row = map(store.settings().get("supportPolicy"));
    if (row.isEmpty()) return new SupportPolicy(0, true, "AI", DEFAULTS);
    return new SupportPolicy(
        integer(row.get("revision")),
        yes(row.get("furtherEnabled")),
        str(row.get("modelLabel")),
        rows(row.get("presets")).stream()
            .map(
                p ->
                    new Preset(
                        str(p.get("id")),
                        str(p.get("title")),
                        list(p.get("keywords")).stream().map(Object::toString).toList(),
                        str(p.get("answer")),
                        str(p.get("path"))))
            .toList());
  }

  private static String normalized(String s) {
    return Normalizer.normalize(s, Normalizer.Form.NFKC)
        .toLowerCase(Locale.ROOT)
        .replaceAll("[\\s\\p{Punct}，。？！、]", "");
  }

  public Optional<Preset> match(String question) {
    String text = normalized(question);
    return presets.stream()
        .filter(p -> p.keywords().stream().anyMatch(k -> text.contains(normalized(k))))
        .max(
            Comparator.comparingInt(
                p ->
                    p.keywords().stream()
                        .mapToInt(k -> text.contains(normalized(k)) ? normalized(k).length() : 0)
                        .max()
                        .orElse(0)));
  }

  public Map<String, Object> value() {
    return obj(
        "revision",
        revision,
        "furtherEnabled",
        furtherEnabled,
        "modelLabel",
        modelLabel,
        "presets",
        presets.stream().map(Preset::value).toList());
  }

  public static boolean handleAdmin(ApiContext c) throws Exception {
    if (!c.audience.equals("admin") || !c.path.equals("/api/admin/support-settings")) return false;
    AdminPermissions.ownerOnly(c);
    var old = load(c.store);
    if (c.method.equals("GET")) {
      c.send(old.value());
      return true;
    }
    if (!c.method.equals("PUT")) return false;
    RequestValues.fields(c.body, "revision", "furtherEnabled", "modelLabel", "presets");
    if (!whole(c.body.get("revision")) || integer(c.body.get("revision")) != old.revision())
      throw new ApiException("客服预设已变化，请重新载入", 409);
    boolean enabled = RequestValues.flag(c.body, "furtherEnabled", false);
    String label = RequestValues.text(c.body, "modelLabel", "AI", 30, true);
    if (!(c.body.get("presets") instanceof List<?>)
        || list(c.body.get("presets")).isEmpty()
        || list(c.body.get("presets")).size() > 20) throw new ApiException("请保留1至20条预设");
    var values = new ArrayList<Preset>();
    var ids = new HashSet<String>();
    for (var item : list(c.body.get("presets"))) {
      if (!(item instanceof Map<?, ?>)) throw new ApiException("预设格式无效");
      var row = map(item);
      RequestValues.fields(row, "id", "title", "keywords", "answer", "path");
      String id = RequestValues.text(row, "id", "", 40, true);
      if (!id.matches("[a-z0-9-]{1,40}") || !ids.add(id)) throw new ApiException("预设编号无效或重复");
      if (!(row.get("keywords") instanceof List<?>)
          || list(row.get("keywords")).isEmpty()
          || list(row.get("keywords")).size() > 8) throw new ApiException("每条预设填写1至8个关键词");
      var keywords = new ArrayList<String>();
      for (Object key : list(row.get("keywords"))) {
        if (!(key instanceof String s) || normalized(s).length() < 2 || s.length() > 30)
          throw new ApiException("关键词需要2至30个字");
        keywords.add(str(key).trim());
      }
      String path = RequestValues.text(row, "path", "", 80, false);
      if (!path.isEmpty()
          && !Set.of(
                  "#discover",
                  "#guides",
                  "#settings",
                  "#contact",
                  "#publish",
                  "#me",
                  "#plans",
                  "#passport",
                  "#shots",
                  "#notifications")
              .contains(path)) throw new ApiException("预设入口无效");
      values.add(
          new Preset(
              id,
              RequestValues.text(row, "title", "", 50, true),
              List.copyOf(keywords),
              RequestValues.text(row, "answer", "", 1200, true),
              path));
    }
    var policy = new SupportPolicy(old.revision() + 1, enabled, label, List.copyOf(values));
    c.store.settings().put("supportPolicy", policy.value());
    c.audit("更新客服预设", "assistant", "预设条数：" + values.size());
    c.store.save();
    c.send(obj("ok", true, "revision", policy.revision()));
    return true;
  }
}
