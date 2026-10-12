package cn.campus.checkin;

import static cn.campus.auth.Security.*;
import static cn.campus.common.Json.*;

import cn.campus.common.ApiException;
import cn.campus.common.RateLimiter;
import cn.campus.common.TimeSource;
import cn.campus.maps.Campus;
import cn.campus.storage.MediaService;
import cn.campus.storage.StoreRepository;
import cn.campus.web.ApiContext;
import java.util.*;
import java.util.regex.*;
import org.springframework.stereotype.Service;

@Service
public class CheckinService {
  private final RateLimiter limits;
  private final MediaService media;

  public CheckinService(RateLimiter limits, MediaService media) {
    this.limits = limits;
    this.media = media;
  }

  public boolean handle(ApiContext context) throws Exception {
    if (!context.audience.equals("user")) return false;
    StoreRepository store = context.store;
    Map<String, Object> body = context.body, account = context.account;
    if (context.route("/api/checkins", "GET")) {
      context.need();
      context.send(
          store.rows("checkins").stream()
              .filter(x -> eq(x.get("ownerId"), account.get("id")))
              .toList());
      return true;
    }
    if (context.route("/api/checkins", "POST")) {
      context.need();
      if (body.get("accountId") != null && !eq(body.get("accountId"), account.get("id")))
        throw new ApiException("登录账号已改变，请重新打开打卡页面", 403);
      if (body.containsKey("note") && !(body.get("note") instanceof String))
        throw new ApiException("打卡感受格式无效");
      if (!str(body.get("submissionId")).matches("[a-f0-9-]{36}"))
        throw new ApiException("提交编号无效，请重新打开打卡页面");
      Map<String, Object> old =
          store.rows("checkins").stream()
              .filter(
                  x ->
                      eq(x.get("ownerId"), account.get("id"))
                          && eq(x.get("submissionId"), body.get("submissionId")))
              .findFirst()
              .orElse(null);
      if (old != null) {
        context.send(old);
        return true;
      }
      Map<String, Object> p =
          store.rows("points").stream()
              .filter(
                  x ->
                      eq(x.get("id"), body.get("pointId"))
                          && yes(x.get("published"))
                          && yes(x.get("open")))
              .findFirst()
              .orElse(null);
      if (p == null) throw new ApiException("点位已关闭或下线，暂不能新增打卡", 409);
      String note = text(body.get("note"), 1000);
      if (str(body.get("note")).trim().length() > 1000) throw new ApiException("感受请控制在 1000 字以内");
      Map<String, Object> m =
          body.get("mediaId") == null
              ? null
              : store.rows("media").stream()
                  .filter(
                      x ->
                          eq(x.get("id"), body.get("mediaId"))
                              && eq(x.get("ownerId"), account.get("id"))
                              && !yes(x.get("deleted"))
                              && !yes(x.get("public")))
                  .findFirst()
                  .orElse(null);
      if (body.get("mediaId") != null && m == null) throw new ApiException("请使用自己上传的私人照片", 403);
      if (m != null && cn.campus.storage.MediaCleanupService.expired(store, m, TimeSource.now()))
        throw new ApiException("照片临时存储已过期，请重新上传", 410);
      if (note.isEmpty() && m == null) throw new ApiException("留一张照片或写一点感受，再收下这次打卡");
      Object templateId = str(body.get("templateId")).isBlank() ? null : body.get("templateId");
      Map<String, Object> t =
          templateId == null
              ? null
              : store.rows("templates").stream()
                  .filter(
                      x ->
                          eq(x.get("id"), templateId)
                              && eq(x.get("pointId"), p.get("id"))
                              && yes(x.get("approved")))
                  .findFirst()
                  .orElse(null);
      if (templateId != null && t == null) throw new ApiException("拍摄建议已更新，请重新选择", 409);
      Map<String, Object> location = null;
      if (body.get("location") != null) {
        Map<String, Object> l = map(body.get("location"));
        double lng = num(l.get("lng")),
            lat = num(l.get("lat")),
            accuracy = num(l.get("accuracy")),
            at = num(l.get("at"));
        long now = TimeSource.now();
        if (!Double.isFinite(lng)
            || !Double.isFinite(lat)
            || !Double.isFinite(accuracy)
            || !Double.isFinite(at)
            || Math.abs(lng) > 180
            || Math.abs(lat) > 90
            || accuracy < 0
            || accuracy > 80
            || now - at > 30000
            || at > now + 1000) throw new ApiException("定位已过期或精度不足，请重新定位或不使用定位");
        long distance = Math.round(Campus.distance(l, p));
        location =
            obj("distance", distance, "accuracy", Math.round(accuracy), "nearby", distance <= 150);
      }
      Map<String, Object> record =
          obj(
              "id",
              id(),
              "ownerId",
              account.get("id"),
              "submissionId",
              body.get("submissionId"),
              "pointId",
              p.get("id"),
              "pointName",
              p.get("name"),
              "theme",
              p.get("theme"),
              "templateId",
              t == null ? null : t.get("id"),
              "shotTitle",
              t == null ? "" : t.get("title"),
              "note",
              note,
              "mediaId",
              m == null ? null : m.get("id"),
              "location",
              location,
              "createdAt",
              StoreRepository.now());
      limits.check(account.get("id") + ":checkin", 20);
      store.rows("checkins").add(record);
      store.save();
      context.send(record, 201);
      return true;
    }
    Matcher match = Pattern.compile("^/api/checkins/([a-f0-9-]+)$").matcher(context.path);
    if (match.matches() && context.method.equals("DELETE")) {
      context.need();
      Map<String, Object> record =
          store.rows("checkins").stream()
              .filter(
                  x -> eq(x.get("id"), match.group(1)) && eq(x.get("ownerId"), account.get("id")))
              .findFirst()
              .orElse(null);
      if (record == null) throw new ApiException("打卡记录不存在", 404);
      store.rows("checkins").remove(record);
      store.save();
      media.purge(store, record.get("mediaId"));
      store.save();
      context.send(obj("ok", true));
      return true;
    }
    return false;
  }
}
