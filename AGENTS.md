# 项目后端约定

当前 v6.5.3 的业务后端位于 `backend/src/main/java/cn/campus`，使用 Java / Spring Boot。根目录 PowerShell 脚本直接启动 Java；项目命令在 `cn/campus/tools`。Java 按 auth / point / checkin / exploration / admin / maps / ai / storage / web / common / settings 分类；前端大页面在 user/pages 与 admin/pages，修改入口见 源码导览.md。当前分支不再保留重复 Node 后端、lib、Leaflet 或 OSM 算路；历史实现从固定版本标签查阅。产品规则变更应修改 Java 服务并通过实际 Java API 测试。

前端保留 `dist/user`、`dist/admin`、`dist/shared` 的 HTML / CSS / JavaScript。页面改动同时检查桌面与手机；保留 API、私有数据、权限、四语文案与定位契约。AI 模型继续使用本机 Python 工作者，Java 负责请求、调度和生命周期。Node 只用于浏览器侧测试与 Acorn / parse5 文案提取，不能在其中新增业务 API。

v6.3 的建筑轮廓资源与Java高度估算位于 `maps/CampusBuildingService` / `tools/BuildingImporter` / `resources/campus-buildings.json`，浏览器 `shared/building-view.js` 负责腾讯立体绘制。OSM只用于建筑展示，不能恢复旧道路算路；未实测高度和不完整覆盖须明确标注，保留ODbL来源与版权。修改入口见三维校园维护说明.md。

`npm test` 先编译 Java 并执行 JUnit（含隔离实际 HTTP 检查），再执行前端回归。测试不可使用真实用户数据或正式管理员凭据。JAR、Maven、AI推理权重和运行数据不跟踪；网页展示必需的GLB与纹理属于前端资源，可保留来源清单后跟踪。维护说明见 `backend/README.md`。

继承上级 AGENTS.md 的本地学习资料规则：个人讲解只放仓库外的 `explore-shoot-学习笔记`，更新索引并给绝对文件链接；可复现的启动、接口、部署、验收与回退说明仍在仓库。已发布历史标签不可移动。

## 云端部署与更新

用户已授权部署到自己的阿里云 Ubuntu 服务器，但在v6.4任务中明确要求：从现在开始暂时停止服务器同步，待用户明确通知后再部署。暂停期间只更新本机、GitHub源码 / 固定标签 / Release，不运行服务器发布、SSH维护、云端数据写入或自动部署。连接配置位于仓库外 `../explore-shoot-部署配置/server.json`，专用私钥与核对过的 known_hosts 同目录；不得提交密钥、连接凭据、迁移包或运行数据。另一台服务器的 CareyVPS 密钥不属于此部署。

云端数据是迁移后的主副本。用户明确恢复服务器同步后，后续修改先通过相应测试、同步 GitHub 固定源码标签与 Release，再运行 `tools/deploy/publish-to-server.ps1 -Ref <固定标签>`：停服备份云端最新数据、切换独立程序目录、核对双端 / 公网版本与构建哈希。绝不能再次导入本机旧数据覆盖云端新增账号、记录、照片或配置。保留现有产品版本号与历史标签；部署维护无需另造版本。

用户已明确要求云端管理入口使用同一 HTTPS 地址下的 `/admin/`。Nginx 分别转发用户根目录与管理目录，管理 API 使用 `/admin/api/*`，管理员 Cookie 限定 `/admin/`，保留 Java 管理身份校验。4174 / 4176 仍只监听本机，不公开原始端口。管理静态资源及已知图片 URL 的前缀适配由 `tools/deploy/nginx-ip.conf.template` 完成；不要改写任意 JSON 文本。变更后检查双端页面、实际登录 / 普通账号拒绝与来源校验。`admin-tunnel.ps1` 保留为可选维护方式，正常管理无需本机隧道。

v6.4校园本地化由 maps/CampusLocalizationService 与 CampusModelService 管理；地点图示位置默认未确认，只有确认且发布的地点进入正式用户目录。三维示意不参与算路；保留公开轮廓、估算标记和资料来源。浏览器第三方vendor文件保留许可证并排除自有语言统计，不能把渲染依赖误认成新JS业务后端。
