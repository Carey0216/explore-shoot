# Java 后端维护说明（v6.1）

运行服务、业务规则、后端测试及项目工具使用 Java 21+ / Spring Boot 4.1.1。浏览器仍需 HTML、CSS、JavaScript 与地图 SDK；免费语音 / 翻译模型仍由 Python 推理，Java 调度。Node 仅用于前端测试和 Acorn / parse5 提取界面文案，运行业务服务与手机代理不依赖 Node。

## 构建与启动

在项目根目录的 PowerShell 运行（需要 JDK 21+；首次构建联网）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1 -Admin
powershell -NoProfile -ExecutionPolicy Bypass -File .\stop.ps1
```

三行分别启动用户端、打开管理端、停止服务，按需选用。启动脚本在源码或资源更新后自动构建；`tools/java-runtime.ps1` 使用内容哈希命名的独立 JAR，避免 Windows 占用构建产物。相同构建复用现有进程。Maven 未安装时 `tools/build-backend.ps1` 下载官方 3.9.16 并验证 SHA-512，缓存于忽略的 `tools/bin/`。直接运行也可用 `java -Dfile.encoding=UTF-8 -jar backend/target/explore-shoot-backend.jar`，重新编译前先停止这种直接启动的进程。

IDEA 打开 `backend/pom.xml`，启动 `cn.campus.ExploreApplication`，工作目录设为项目根目录或配置 `EXPLORE_PROJECT_ROOT`。目标 Java 21，本机 JDK 25 验证。双端同一进程：用户 4174、管理员 4176，仅监听 127.0.0.1。端口决定身份，Host / 修改请求 Origin 均验证。手机代理只连接用户端，外部管理接口返回 404。

## 代码入口

| 文件（src/main/java/cn/campus） | 职责 |
|---|---|
| ExploreApplication.java | Spring 启动、双端口与工具入口 |
| Auth / Point / Checkin / Exploration / Admin / PageController.java | 按功能组织入口，统一交给 RequestDispatcher |
| RequestDispatcher.java / ApiContext.java | 来源 / 大小 / 权限校验、事务、静态文件、异步响应与统一错误 |
| dto/RegistrationRequest.java / PointSearchRequest.java | 明确请求字段、类型和合法范围 |
| AuthService.java / Security.java | 注册、登录、密码、会话、头像与 JPEG 元数据清除 |
| PointSearchService.java | 点位 / 拍法检索、四语别名、分页、热门 / 收藏 / 已打卡筛选 |
| PointService.java / CheckinService.java | 点位共创、收藏、反馈、私有统计及打卡 |
| PassportService.java | 私有足迹、独立打卡与旧任务合并、重复到访与统计 |
| ExplorationService.java | 路线预算、任务、暂停 / 结束、轨迹与手记导出 |
| AdminService.java | 管理员、邀请码、审核、内容维护及脱敏日志 |
| MapConfigService.java / DeletionService.java | SDK 二次验证、永久删除及持久化媒体清理队列 |
| Preferences.java / Campus.java | 设置白名单、校园范围与距离 |
| StoreRepository.java | 兼容 JSON、事务锁、文件锁和原子替换 |
| AiService.java / navigation-voices.json | Python 进程、六音色 / 36 段语音预热、优先队列、缓存、一次性翻译 |
| tools/ProjectTools.java | 手机代理 / ZXing 二维码、发布、历史导出与启动、开发监测、地图参考资料更新、开发译文生成 |

新增接口：`POST /api/points/search` 接收 query / filter / theme / page / pageSize，公开结果不带浏览量与热度数字；收藏 / 已打卡等个人筛选必须登录。附近距离排序仍在设备上完成，不上传定位。`GET /api/my/library` 登录后一次返回本人的 checkins / sessions / records / summary，浏览器无需重复计算历史任务和收集进度。

旧后端和 Node 工具已从当前分支移除，源码仍保存在既有标签，未改写历史。保留 JSON 存储而非为改变语言引入数据库；未知字段、ID、账号与媒体继续兼容。部分历史存储对象仍用 Map，外部请求逐步增加明确 DTO。Python 工作者位于 `tools/voice-worker.py`、`tools/translation-worker.py`。

## 数据与回退

已有数据启动时读取而不重写；scrypt 与旧 Node 参数兼容（N=16384，r=8，p=1，64 字节，十六进制盐以 UTF-8 字符串处理），已有会话继续识别。API 写入共用事务锁；失败且未落盘的变更回滚。删除先保存移除、审计与媒体清理队列再删文件，失败重试，其他内容引用的照片不删除。所有权限、SDK 和统计脱敏在服务端处理。

升级前停止服务并完整备份 data，校验文件；回退前再备份最新数据，使用所需版本的固定源码标签及对应运行方式。不得让旧 Node 与 Java 同时写同一目录。Java 文件锁防止多个 Java 写入进程；源码回退不能恢复已经永久删除的内容。

## 工具与验证

前端开发 / 测试先安装 Node.js 20+ 并运行 `npm ci`。`npm test` 先运行 JUnit 实际 HTTP / 单元检查，再运行浏览器侧测试；`npm run backend:test` 单独后端检查。测试数据隔离，后端测试位于 src/test/java/cn/campus。安装有模型时验证真实六音色、36 缓存及三种译文；没有模型明确跳过可选模型检查，业务 API 仍可运行。

`npm run dev` 由 Java 监测界面源码变动并自动生成译文；后端修改后重新运行 start.ps1，自动构建新 JAR；`npm run i18n:generate` / `i18n:check` 由 Java 调度，Node 解析浏览器源码，Python 生成免费译文。机器译文需人工校对。`npm run release -- --check` 校验维护文档，`npm run history -- list` / `history:check` 导出 / 隔离验证固定历史标签。无 Node 的运行机器可以直接调用 `tools/project-tool.ps1 -Tool release --check` 等命令。手机脚本入口沿用，代理与二维码均由 Java 提供。

环境变量：PORT、ADMIN_PORT、EXPLORE_DATA_DIR、ADMIN_PASSWORD、EXPLORE_VOICE_WARMUP、EXPLORE_PROJECT_ROOT。测试时钟需 EXPLORE_TEST_MODE=1 与 EXPLORE_TEST_CLOCK 双重开启，HTTP 不能开启。地图 SDK、前台定位及道路数据行为保持；未新增南侧天桥或原生后台导航能力。依赖许可见 [第三方依赖说明](第三方依赖说明.md)。
