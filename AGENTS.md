# 项目后端约定

当前 v6.2 的业务后端位于 `backend/src/main/java/cn/campus`，使用 Java / Spring Boot。根目录 PowerShell 脚本直接启动 Java；项目命令在 `cn/campus/tools`。Java 按 auth / point / checkin / exploration / admin / maps / ai / storage / web / common / settings 分类；前端大页面在 user/pages 与 admin/pages，修改入口见 源码导览.md。当前分支不再保留重复 Node 后端、lib、Leaflet 或 OSM 算路；历史实现从固定版本标签查阅。产品规则变更应修改 Java 服务并通过实际 Java API 测试。

前端保留 `dist/user`、`dist/admin`、`dist/shared` 的 HTML / CSS / JavaScript。页面改动同时检查桌面与手机；保留 API、私有数据、权限、四语文案与定位契约。AI 模型继续使用本机 Python 工作者，Java 负责请求、调度和生命周期。Node 只用于浏览器侧测试与 Acorn / parse5 文案提取，不能在其中新增业务 API。

`npm test` 先编译 Java 并执行 JUnit（含隔离实际 HTTP 检查），再执行前端回归。测试不可使用真实用户数据或正式管理员凭据。JAR、Maven、模型和运行数据不跟踪。维护说明见 `backend/README.md`。

继承上级 AGENTS.md 的本地学习资料规则：个人讲解只放仓库外的 `explore-shoot-学习笔记`，更新索引并给绝对文件链接；可复现的启动、接口、部署、验收与回退说明仍在仓库。已发布历史标签不可移动。
