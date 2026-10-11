# 项目后端约定

自 v6.0 起业务后端位于 `backend/src/main/java/cn/campus`，使用 Java / Spring Boot。根目录 `server.cjs` 仅为兼容启动器，不在其中新增业务逻辑。`lib/` 与 `legacy/node-backend.cjs` 是旧实现与测试对照；产品规则变更应修改 Java 服务并通过实际 Java API 测试。

前端保留 `dist/user`、`dist/admin`、`dist/shared` 的 HTML / CSS / JavaScript。页面改动同时检查桌面与手机；保留 API、私有数据、权限、四语文案与定位契约。AI 模型继续使用本机 Python 工作者，Java 负责请求、调度和生命周期。

运行 `npm test` 会先构建 Java 并执行 JUnit，再执行前端及实际 JAR 接口回归。测试使用独立数据目录；不可用真实用户数据或真实管理员凭据做 QA。JAR、Maven、模型和运行数据不跟踪。维护说明见 `backend/README.md`。

继承上级 AGENTS.md 的本地学习资料规则：个人讲解只放仓库外的 `explore-shoot-学习笔记`，更新索引并给绝对文件链接；可复现的启动、接口、部署、验收与回退说明仍在仓库。已发布历史标签不可移动。
