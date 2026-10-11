package cn.campus.dto;

import cn.campus.ApiException;
import cn.campus.Json;
import cn.campus.Security;
import java.util.Locale;
import java.util.Map;

/** Only registration fields are read; an account's role is always assigned by the server. */
public record RegistrationRequest(
    String username, String password, String nickname, String inviteCode) {
  public static RegistrationRequest from(Map<String, Object> body) {
    String name = Security.username(body.get("username"));
    String password = Security.password(body.get("password"));
    String nickname = Security.text(body.get("nickname"), 24);
    if (nickname.isEmpty()) throw new ApiException("请填写昵称");
    if (body.containsKey("inviteCode") && !(body.get("inviteCode") instanceof String))
      throw new ApiException("邀请码格式无效");
    String invite = Json.str(body.get("inviteCode")).trim().toUpperCase(Locale.ROOT);
    if (invite.length() > 30) throw new ApiException("邀请码格式无效");
    return new RegistrationRequest(name, password, nickname, invite);
  }
}
