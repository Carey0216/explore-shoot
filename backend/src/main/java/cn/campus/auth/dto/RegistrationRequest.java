package cn.campus.auth.dto;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.common.Json;
import java.util.Locale;
import java.util.Map;

/** Only registration fields are read; an account's role is always assigned by the server. */
public record RegistrationRequest(String username, String password, String nickname) {
  public static RegistrationRequest from(Map<String, Object> body) {
    String name = Security.username(body.get("username"));
    String password = Security.password(body.get("password"));
    String nickname = Security.text(body.get("nickname"), 24);
    if (nickname.isEmpty()) throw new ApiException("请填写昵称");
    if (body.containsKey("inviteCode") && !(body.get("inviteCode") instanceof String))
      throw new ApiException("邀请码格式无效");
    String invite = Json.str(body.get("inviteCode")).trim().toUpperCase(Locale.ROOT);
    if (!invite.isEmpty()) throw new ApiException("邀请码功能已停用，请清空后直接注册");
    return new RegistrationRequest(name, password, nickname);
  }
}
