# 项目后端约定

当前 v6.2.2 的业务后端位于 `backend/src/main/java/cn/campus`，使用 Java / Spring Boot。根目录 PowerShell 脚本直接启动 Java；项目命令在 `cn/campus/tools`。Java 按 auth / point / checkin / exploration / admin / maps / ai / storage / web / common / settings 分类；前端大页面在 user/pages 与 admin/pages，修改入口见 源码导览.md。当前分支不再保留重复 Node 后端、lib、Leaflet 或 OSM 算路；历史实现从固定版本标签查阅。产品规则变更应修改 Java 服务并通过实际 Java API 测试。

前端保留 `dist/user`、`dist/admin`、`dist/shared` 的 HTML / CSS / JavaScript。页面改动同时检查桌面与手机；保留 API、私有数据、权限、四语文案与定位契约。AI 模型继续使用本机 Python 工作者，Java 负责请求、调度和生命周期。Node 只用于浏览器侧测试与 Acorn / parse5 文案提取，不能在其中新增业务 API。

`npm test` 先编译 Java 并执行 JUnit（含隔离实际 HTTP 检查），再执行前端回归。测试不可使用真实用户数据或正式管理员凭据。JAR、Maven、模型和运行数据不跟踪。维护说明见 `backend/README.md`。

继承上级 AGENTS.md 的本地学习资料规则：个人讲解只放仓库外的 `explore-shoot-学习笔记`，更新索引并给绝对文件链接；可复现的启动、接口、部署、验收与回退说明仍在仓库。已发布历史标签不可移动。

## 云端部署与更新

用户已授权部署到自己的阿里云 Ubuntu 服务器，并要求以后每次产品更新同步服务器。连接配置位于仓库外 `../explore-shoot-部署配置/server.json`，专用私钥与核对过的 known_hosts 同目录；不得提交密钥、连接凭据、迁移包或运行数据。另一台服务器的 CareyVPS 密钥不属于此部署。

云端数据是迁移后的主副本。后续修改先通过相应测试、同步 GitHub 固定源码标签与 Release，再运行 `tools/deploy/publish-to-server.ps1 -Ref <固定标签>`：停服备份云端最新数据、切换独立程序目录、核对双端 / 公网版本与构建哈希。绝不能再次导入本机旧数据覆盖云端新增账号、记录、照片或配置。保留现有产品版本号与历史标签；部署维护无需另造版本。云端管理端只通过 `tools/deploy/admin-tunnel.ps1` 的专用连接访问，勿公开转发管理员端口。
