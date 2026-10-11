# Java 后端维护说明

自 v6.0 起，业务后端由 Java 21+ / Spring Boot 4.1.1 执行。HTML、CSS、JavaScript 前端与浏览器地图 SDK 保留；Node.js 只用于前端文案生成、测试、手机代理及兼容启动入口，不再处理业务 API。

## 构建与启动

安装 JDK 21+ 和 Node.js 20+，在项目根目录运行：

```powershell
npm ci
npm run backend:build
npm start
```

也可继续调用根目录 `start.ps1`（源码较新时自动编译）、`stop.ps1` 和手机测试脚本。启动器使用内容哈希命名的独立 JAR 副本，避免 Windows 运行期间占用构建产物；重新启动后使用新副本。Maven 未安装时构建脚本从 Maven Central 下载官方 3.9.16 并验证 SHA-512，保存在忽略的 `tools/bin/`；首次构建需要联网。JAR、Maven 工具、模型与运行数据均不提交 Git。

IDEA 可直接打开 `backend/pom.xml`。从 IDE 启动 `cn.campus.ExploreApplication` 时，将工作目录设置为项目根目录，或设置 `EXPLORE_PROJECT_ROOT` 为根目录绝对路径。构建目标为 Java 21，本机 JDK 25 已通过验证。

直接运行不依赖 Node 启动器（Windows 下重新编译前先停止此直接启动的进程）：

```powershell
java -Dfile.encoding=UTF-8 -jar backend/target/explore-shoot-backend.jar
```

同一 Java 进程的两个 Tomcat Connector 只监听 127.0.0.1：用户 4174，管理员 4176。端口决定端身份，Host 与修改请求的 Origin 继续验证，管理接口不会出现在用户服务中。手机代理继续只连接用户端。

## 代码入口

| 文件（src/main/java/cn/campus） | 维护职责 |
|---|---|
| ExploreApplication.java | Spring Boot 启动、双端端口、父启动器退出监测 |
| ExploreController.java | 请求大小与来源校验、接口分发、静态文件、异步 AI 响应、高德代理 |
| AuthService.java / ApiContext.java / Security.java | 登录、注册、密码、会话、头像、权限及 JPEG 元数据清除 |
| PointService.java / CheckinService.java | 点位共创、收藏、反馈、私有统计及打卡 |
| ExplorationService.java | 路线预算、任务、暂停 / 结束、轨迹与手记导出 |
| AdminService.java | 管理员、邀请码、审核、内容维护及脱敏操作日志 |
| MapConfigService.java / DeletionService.java | SDK 二次验证、永久删除确认与持久化清理队列 |
| Preferences.java / Campus.java | 设置白名单、校园范围与距离规则 |
| StoreRepository.java | 兼容 JSON 存储、单进程事务锁、文件占用锁和原子替换 |
| AiService.java | Python 模型进程、36 段语音预热、优先队列、缓存及一次性翻译 |

保留 `store-v2.json` 字段、ID、scrypt 参数和私有照片目录，不做 SQL 数据迁移。暂用 Map 表达历史 JSON，以便不丢弃已有字段；后续可逐个引入明确 DTO / 实体，数据库迁移应另行验证。业务代码的核心路径已经迁入 Java，并非把旧 Node 服务代理在 Java 后面。

`legacy/node-backend.cjs` 与 `lib/` 保留为 v4.3.5 行为参考及部分旧单元测试的对照，不参与当前 HTTP 业务服务。正式历史体验仍使用固定标签，不依赖这个参考副本。Python 工作者仍在 `tools/voice-worker.py` 和 `tools/translation-worker.py`，无需换成 Java 模型库或购买云服务。

## 数据与回退

现有数据启动时直接读取，不重写已有文件；未知字段保留。密码使用 Node 兼容的 scrypt（N=16384，r=8，p=1，64 字节，十六进制盐作为 UTF-8 字符串）。原会话 Cookie 与服务器会话记录继续识别。所有 API 写入在同一事务锁中，邀请码最后一个名额只能消费一次；验证失败且未落盘的修改回滚。

删除先保存内容移除、永久审计和媒体清理队列，再删文件；删除失败按队列重试。私人手记、打卡或其他点位仍引用的照片保留。管理员统计和 SDK 安全密钥继续在服务端脱敏。

完整备份包含 `data` 全部内容。回退前停止服务、另备份最新数据，再使用 v4.3.5 固定源码；不得让旧 Node 与 Java 同时写同一数据目录。Java 文件锁只负责避免多个 Java 实例并发写入。源码回退不会恢复已经永久删除的数据。

## 验证

`npm run backend:test` 编译并运行 Java JUnit 测试；`npm test` 的实际 API 测试直接启动 JAR，前端测试仍在 Node 运行；`npm run i18n:check` 检查四语文案。独立数据目录由测试自行创建，不使用本机真实账号。语音模型未安装时业务 API 仍可运行，语音请求明确返回不可用。

环境变量沿用 `PORT`、`ADMIN_PORT`、`EXPLORE_DATA_DIR`、`ADMIN_PASSWORD`、`EXPLORE_VOICE_WARMUP`；新增 `EXPLORE_PROJECT_ROOT` 指向包含 dist / tools / package.json 的根目录。测试时钟仅在 `EXPLORE_TEST_MODE=1` 并显式配置 `EXPLORE_TEST_CLOCK` 时生效，HTTP 参数不能开启。

官方依赖参考：[Spring Boot 要求](https://docs.spring.io/spring-boot/system-requirements.html)、[Maven 下载](https://maven.apache.org/download.cgi)。本版保持现有地图和前台定位行为，未新增南侧天桥数据或原生后台导航能力。
