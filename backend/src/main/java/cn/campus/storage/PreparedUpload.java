package cn.campus.storage;

import cn.campus.auth.Security;
import cn.campus.common.*;
import java.util.*;

/** Decoding and compression happen before acquiring the business write lock. */
public record PreparedUpload(String submissionId, String digest, byte[] jpeg) {
  public static PreparedUpload from(Map<String, Object> body) throws Exception {
    RequestValues.fields(body, "photo", "submissionId");
    String id = Objects.toString(body.getOrDefault("submissionId", ""), "");
    if (!id.isEmpty() && !id.matches(MediaReferences.UUID)) throw new ApiException("上传编号无效");
    String photo = Objects.toString(body.get("photo"), "");
    return new PreparedUpload(
        id,
        Security.digest(photo),
        PhotoVariants.jpeg(Security.photo(body.get("photo"), 5 * 1024 * 1024), 1920, .84f));
  }
}
