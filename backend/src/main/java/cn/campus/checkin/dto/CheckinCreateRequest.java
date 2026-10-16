package cn.campus.checkin.dto;

import cn.campus.common.*;
import java.util.Map;

/** Input values only; ownership, availability and media authorization remain in the service. */
public record CheckinCreateRequest(String pointId, String submissionId, String note) {
  public static CheckinCreateRequest from(Map<String, Object> body) {
    String point = RequestValues.text(body, "pointId", "", 100, true);
    String submission = RequestValues.text(body, "submissionId", "", 36, true);
    if (!point.matches("[a-z0-9-]+") || !submission.matches("[a-f0-9-]{36}"))
      throw new ApiException("提交编号或地点无效，请重新打开打卡页面");
    return new CheckinCreateRequest(
        point, submission, RequestValues.text(body, "note", "", 1000, false));
  }
}
