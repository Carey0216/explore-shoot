package cn.campus.admin;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.web.ApiContext;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
public final class OwnerAccountService {
  public boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("admin")) return false;
    if (c.route("/api/admin/permissions", "GET")) {
      AdminPermissions.ownerOnly(c);
      c.send(obj("features", AdminPermissions.FEATURES, "keys", AdminPermissions.keys()));
      return true;
    }
    if (!c.route("/api/admin/owner-account", "PUT")) return false;
    AdminPermissions.ownerOnly(c);
    cn.campus.common.RequestValues.fields(c.body, "username", "password", "currentPassword");
    if (!Security.verifyPassword(
        Security.text(c.body.get("currentPassword"), 129), c.account.get("passwordHash")))
      throw new ApiException("当前密码不正确", 403);
    String name = Security.username(c.body.get("username"));
    if (c.store.rows("admins").stream()
        .anyMatch(
            a ->
                !eq(a.get("id"), c.account.get("id"))
                    && eq(a.get("username"), name)
                    && !yes(a.get("deleted")))) throw new ApiException("账号已存在", 409);
    c.account.put("username", name);
    if (!str(c.body.get("password")).isEmpty())
      c.account.put(
          "passwordHash", Security.hashPassword(Security.password(c.body.get("password"))));
    c.store.rows("auth").removeIf(s -> eq(s.get("accountId"), c.account.get("id")));
    c.audit("修改顶级管理员登录资料", c.account.get("id"), "登录会话已撤销");
    c.store.save();
    c.clearCookie();
    c.send(obj("ok", true, "loginRequired", true));
    return true;
  }
}
