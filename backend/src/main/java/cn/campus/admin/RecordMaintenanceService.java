package cn.campus.admin;

import static cn.campus.common.Json.*;

import cn.campus.auth.Security;
import cn.campus.common.ApiException;
import cn.campus.web.ApiContext;
import java.util.*;
import org.springframework.stereotype.Service;

/** Remove selected records from the console without destroying business data or the audit trail. */
@Service
public final class RecordMaintenanceService {
  public boolean handle(ApiContext c) throws Exception {
    if (!c.audience.equals("admin") || !c.route("/api/admin/records", "DELETE")) return false;
    AdminPermissions.ownerOnly(c);
    if (!Security.verifyPassword(c.body.get("currentPassword"), c.account.get("passwordHash")))
      throw new ApiException("当前密码不正确", 403);
    String kind = str(c.body.get("kind"));
    if (!Set.of("audit", "planning").contains(kind)) throw new ApiException("记录类型无效");
    var ids = list(c.body.get("ids"));
    if (ids.isEmpty() || ids.size() > 100 || ids.stream().anyMatch(id -> !(id instanceof String)))
      throw new ApiException("请选择1—100条记录");
    var records = c.store.rows(kind.equals("audit") ? "audit" : "logs");
    for (var id : ids)
      if (find(records, "id", id) == null) throw new ApiException("记录已更新，请刷新", 409);
    for (var record : records)
      if (ids.contains(record.get("id"))) {
        record.put("hidden", true);
        record.put("hiddenAt", cn.campus.storage.StoreRepository.now());
      }
    c.audit("删除控制台记录", "records", kind + " · " + ids.size() + "条；原始审计留存");
    c.store.save();
    c.send(obj("ok", true));
    return true;
  }
}
