package cn.campus;

import static cn.campus.Json.*;
import static cn.campus.Security.*;

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

  public boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("user")) return false;
    StoreRepository s = c.store;
    Map<String, Object> b = c.body, a = c.account;
    if (c.route("/api/checkins", "GET")) {
      c.need();
      c.send(s.rows("checkins").stream().filter(x -> eq(x.get("ownerId"), a.get("id"))).toList());
      return true;
    }
    if (c.route("/api/checkins", "POST")) {
      c.need();
      if (b.get("accountId") != null && !eq(b.get("accountId"), a.get("id")))
        throw new ApiException("登录账号已改变，请重新打开打卡页面", 403);
      if (b.containsKey("note") && !(b.get("note") instanceof String))
        throw new ApiException("打卡感受格式无效");
      if (!str(b.get("submissionId")).matches("[a-f0-9-]{36}"))
        throw new ApiException("提交编号无效，请重新打开打卡页面");
      Map<String, Object> old =
          s.rows("checkins").stream()
              .filter(
                  x ->
                      eq(x.get("ownerId"), a.get("id"))
                          && eq(x.get("submissionId"), b.get("submissionId")))
              .findFirst()
              .orElse(null);
      if (old != null) {
        c.send(old);
        return true;
      }
      Map<String, Object> p =
          s.rows("points").stream()
              .filter(
                  x ->
                      eq(x.get("id"), b.get("pointId"))
                          && yes(x.get("published"))
                          && yes(x.get("open")))
              .findFirst()
              .orElse(null);
      if (p == null) throw new ApiException("点位已关闭或下线，暂不能新增打卡", 409);
      String note = text(b.get("note"), 1000);
      if (str(b.get("note")).trim().length() > 1000) throw new ApiException("感受请控制在 1000 字以内");
      Map<String, Object> m =
          b.get("mediaId") == null
              ? null
              : s.rows("media").stream()
                  .filter(
                      x ->
                          eq(x.get("id"), b.get("mediaId"))
                              && eq(x.get("ownerId"), a.get("id"))
                              && !yes(x.get("deleted"))
                              && !yes(x.get("public")))
                  .findFirst()
                  .orElse(null);
      if (b.get("mediaId") != null && m == null) throw new ApiException("请使用自己上传的私人照片", 403);
      if (note.isEmpty() && m == null) throw new ApiException("留一张照片或写一点感受，再收下这次打卡");
      Map<String, Object> t =
          b.get("templateId") == null
              ? null
              : s.rows("templates").stream()
                  .filter(
                      x ->
                          eq(x.get("id"), b.get("templateId"))
                              && eq(x.get("pointId"), p.get("id"))
                              && yes(x.get("approved")))
                  .findFirst()
                  .orElse(null);
      if (b.get("templateId") != null && t == null) throw new ApiException("拍摄建议已更新，请重新选择", 409);
      Map<String, Object> location = null;
      if (b.get("location") != null) {
        Map<String, Object> l = map(b.get("location"));
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
              a.get("id"),
              "submissionId",
              b.get("submissionId"),
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
      limits.check(a.get("id") + ":checkin", 20);
      s.rows("checkins").add(record);
      s.save();
      c.send(record, 201);
      return true;
    }
    Matcher match = Pattern.compile("^/api/checkins/([a-f0-9-]+)$").matcher(c.path);
    if (match.matches() && c.method.equals("DELETE")) {
      c.need();
      Map<String, Object> record =
          s.rows("checkins").stream()
              .filter(x -> eq(x.get("id"), match.group(1)) && eq(x.get("ownerId"), a.get("id")))
              .findFirst()
              .orElse(null);
      if (record == null) throw new ApiException("打卡记录不存在", 404);
      s.rows("checkins").remove(record);
      s.save();
      media.purge(s, record.get("mediaId"));
      s.save();
      c.send(obj("ok", true));
      return true;
    }
    return false;
  }
}
