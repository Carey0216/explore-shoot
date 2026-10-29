package cn.campus.admin;

import static cn.campus.common.Json.*;
import cn.campus.auth.Security;
import cn.campus.common.*;
import cn.campus.content.SeasonTopicService;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;

/** Task entry points never grant permissions. Every batch is previewed, revision checked and audited. */
@Service
public final class AdminTaskService {
  private static final String BASE = "/api/admin/task-workbench";
  public boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("admin") || !c.path.startsWith(BASE)) return false;
    c.need();
    if (c.route(BASE, "GET")) { c.send(snapshot(c)); return true; }
    boolean apply = c.route(BASE + "/topic-batch/apply", "POST");
    if (!apply && !c.route(BASE + "/topic-batch/preview", "POST")) return false;
    if (!AdminPermissions.has(c.account, "topics.read") || !AdminPermissions.has(c.account, "topics.write"))
      throw new ApiException("当前账号未获活动专题修改权限", 403);
    RequestValues.fields(c.body, "items", "action", "publishAt", "unpublishAt", "description", "confirmation");
    var changes = prepare(c.store.rows("seasonTopics"), c.body);
    String confirmation = Security.digest(write(changes));
    if (!apply) { c.send(obj("changes", changes, "confirmation", confirmation)); return true; }
    if (!confirmation.equals(str(c.body.get("confirmation")))) throw new ApiException("内容已变化，请重新预览确认", 409);
    Path folder = c.store.directory.resolve("maintenance-backups/topic-batches");
    Files.createDirectories(folder);
    String id = Security.id(), before = write(obj("createdAt", StoreRepository.now(), "actor", c.account.get("username"), "changes", changes));
    Files.writeString(folder.resolve(id + ".json"), before, StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
    Files.writeString(folder.resolve(id + ".sha256"), Security.digest(before), StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
    // All validation happens before any row changes. RequestDispatcher holds the repository write lock.
    for (var change : changes) {
      var row = find(c.store.rows("seasonTopics"), "id", str(change.get("id")));
      row.putAll(map(change.get("after")));
      row.put("revision", integer(row.get("revision")) + 1);
      row.put("updatedAt", StoreRepository.now());
      row.put("updatedBy", c.account.get("username"));
    }
    c.audit("批量维护活动专题", id, changes.size() + "项 · " + str(c.body.get("action")));
    c.store.bump(); c.store.save();
    c.send(obj("ok", true, "updated", changes.size(), "backupId", id));
    return true;
  }

  public static List<Map<String,Object>> prepare(List<Map<String,Object>> topics, Map<String,Object> body) {
    Object raw = body.get("items");
    if (!(raw instanceof List<?> input) || input.isEmpty() || input.size() > 20) throw new ApiException("每次请选择1至20项专题");
    String action = RequestValues.text(body, "action", "", 20, true);
    if (!Set.of("publish", "unpublish", "schedule", "description").contains(action)) throw new ApiException("不支持的批量操作");
    var result = new ArrayList<Map<String,Object>>(); var ids = new HashSet<String>();
    for (Object value : list(raw)) {
      var item = map(value); RequestValues.fields(item, "id", "revision");
      String id = str(item.get("id"));
      if (!ids.add(id)) throw new ApiException("不能重复选择专题");
      var row = find(topics, "id", id);
      if (row == null || yes(row.get("deleted"))) throw new ApiException("专题不存在", 404);
      if (!whole(item.get("revision")) || integer(item.get("revision")) != integer(row.get("revision"))) throw new ApiException("专题已被其他管理员修改，请刷新", 409);
      var before = obj("published", yes(row.get("published")), "publishAt", str(row.get("publishAt")), "unpublishAt", str(row.get("unpublishAt")), "description", str(row.get("description")));
      var after = copy(before);
      switch (action) {
        case "publish" -> after.putAll(obj("published", true, "publishAt", "", "unpublishAt", ""));
        case "unpublish" -> after.put("published", false);
        case "schedule" -> { after.putAll(SeasonTopicService.schedule(body, row)); after.put("published", true); }
        case "description" -> after.put("description", RequestValues.text(body, "description", "", 2000, true));
      }
      result.add(obj("id", id, "title", str(row.get("title")), "revision", row.get("revision"), "before", before, "after", after));
    }
    return result;
  }

  private Map<String,Object> snapshot(ApiContext c) {
    var tasks = new ArrayList<Map<String,Object>>();
    if (AdminPermissions.has(c.account,"topics.read")) tasks.add(task("activity", "发布一次活动", "Publish an activity", List.of(step("topics","准备专题与时间","Prepare topic and dates"), step("passport","关联主题印章","Link collection stamps"),step("preflight","预检图片与文案","Check images and copy"), step("task-workbench","确认定时上架","Review publication schedule")), c));
    if (AdminPermissions.has(c.account,"passport.read")) tasks.add(task("building", "维护一栋建筑", "Maintain a building", List.of(step("passport","关联地点与圈画","Link places and draw outline"),step("points","核对地点开放信息","Check access information"),step("preflight","检查公开展示","Review public content")), c));
    if (AdminPermissions.has(c.account,"messages.read")) tasks.add(task("messages", "处理用户消息", "Handle user messages", List.of(step("inbox","查看未读与待办","Review unread messages"),step("messages","回复并核对附件","Reply and check attachments")), c));
    long now = TimeSource.now(); var topics = new ArrayList<Map<String,Object>>(); var reminders = new ArrayList<Map<String,Object>>();
    if (AdminPermissions.has(c.account,"topics.read")) for (var row:c.store.rows("seasonTopics")) {
      if (yes(row.get("deleted"))) continue;
      String status = !yes(row.get("published")) ? "草稿 / 已下架" : SeasonTopicService.visible(row,now) ? "当前展示" : time(row.get("publishAt")) > now ? "等待定时上架" : "已定时下架";
      topics.add(obj("id",row.get("id"),"title",row.get("title"),"revision",row.get("revision"),"status",status,"published",yes(row.get("published")),"publishAt",str(row.get("publishAt")),"unpublishAt",str(row.get("unpublishAt")),"description",str(row.get("description")),"updatedAt",row.getOrDefault("updatedAt",row.get("createdAt")),"updatedBy",str(row.get("updatedBy"))));
      if (yes(row.get("published")) && time(row.get("endsAt")) > 0 && time(row.get("endsAt")) <= now && SeasonTopicService.visible(row,now)) reminders.add(obj("id",row.get("id"),"title",row.get("title"),"reason","活动已结束，确认归档或下架","reasonEn","The activity has ended; review or unpublish it.","route","topics"));
      else if (yes(row.get("published")) && time(row.get("endsAt")) > now && time(row.get("endsAt")) < now+7*86400000L) reminders.add(obj("id",row.get("id"),"title",row.get("title"),"reason","活动将在7天内结束，检查后续安排","reasonEn","Ends within seven days; check the next steps.","route","topics"));
    }
    if (AdminPermissions.has(c.account,"shooting-spots.read")) for(var row:c.store.rows("shootingSpots")) {
      if (yes(row.get("deleted"))) continue;
      long verified = time(row.get("verifiedAt"));
      if (verified == 0 || verified < now-90*86400000L) reminders.add(obj("id",row.get("id"),"title",row.getOrDefault("title",row.get("name")),"reason","机位资料未核验或超过90天，请确认开放与取景信息","reasonEn","Not verified within 90 days; review access and framing information.","route","shooting-spots"));
    }
    return obj("tasks",tasks,"topics",topics,"reminders",reminders.stream().limit(100).toList(),"canEditTopics",AdminPermissions.has(c.account,"topics.write"),"checkedAt",Instant.ofEpochMilli(now).toString());
  }
  private static long time(Object value) { try { String s=str(value); return (s.length()==10?java.time.LocalDate.parse(s).atStartOfDay(java.time.ZoneOffset.ofHours(8)).toInstant():Instant.parse(s)).toEpochMilli(); } catch(Exception e) { return 0; } }
  private static Map<String,Object> step(String route,String title,String titleEn) {return obj("route",route,"title",title,"titleEn",titleEn);}
  private static Map<String,Object> task(String id,String title,String titleEn,List<Map<String,Object>> steps,ApiContext c) {return obj("id",id,"title",title,"titleEn",titleEn,"steps",steps.stream().filter(s->{String r=str(s.get("route"));return r.equals("task-workbench")||AdminPermissions.has(c.account,(r.equals("inbox")?"messages":r)+".read");}).toList());}
}
