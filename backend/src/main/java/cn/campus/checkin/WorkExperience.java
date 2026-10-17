package cn.campus.checkin;

import static cn.campus.common.Json.*;

import cn.campus.common.*;
import java.time.Instant;
import java.util.*;

/** Explicitly volunteered text only. Never derives public fields from private notes or EXIF. */
public final class WorkExperience {
  private WorkExperience() {}

  public static Map<String, Object> from(Object value) {
    if (value == null) return obj();
    if (!(value instanceof Map<?, ?>)) throw new ApiException("作品经验卡格式无效");
    var b = map(value);
    RequestValues.fields(b, "takenAt", "device", "focalLength", "tips");
    var out = obj();
    for (var key : List.of("takenAt", "device", "focalLength", "tips")) {
      String text =
          RequestValues.text(
              b, key, "", key.equals("tips") ? 1000 : key.equals("device") ? 100 : 50, false);
      if (key.equals("takenAt") && !text.isEmpty()) {
        try {
          text = Instant.parse(text).toString();
        } catch (Exception e) {
          throw new ApiException("拍摄时间格式无效");
        }
      }
      if (!text.isEmpty()) out.put(key, text);
    }
    return out;
  }
}
