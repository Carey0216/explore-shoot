# Java 后端维护说明（v6.7.0）

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

v6.3 的建筑展示接口为 `GET /api/maps/buildings`，位于 maps/CampusBuildingService；公开轮廓与Java估算高度由腾讯浏览器SDK绘制，导航仍使用原在线算路。Java离线导入命令为 `--tool=buildings <OSM文件路径>`，数据与维护步骤见 [三维校园维护说明](../三维校园维护说明.md)。不修改运行中的账号数据库。

代码按功能分包，完整入口与前端对应见 [源码导览](../源码导览.md)。

| 包（src/main/java/cn/campus） | 内容 |
|---|---|
| auth / auth/dto | 注册、登录、密码、头像、会话与注册 DTO |
| point / point/dto | 点位、共创、收藏、检索与检索 DTO |
| checkin | 私有打卡、足迹、收藏 / 手记汇总 |
| exploration / exploration/dto | 偏好 DTO、路线预算 / 搜索、任务、轨迹、会话展示与导出 |
| admin | 审核、邀请码、管理统计、永久删除与审计 |
| maps | 校园范围、地图 SDK 配置、代理入口 |
| ai | AiController / AiService 入口，VoiceService 与 TranslationService 的独立队列和模型进程 |
| storage | JSON 数据、文件锁、原子保存、私有照片 |
| web | ApiContext、统一来源 / 权限 / 事务调度及静态页面 |
| common / settings | JSON、异常、频率限制、时钟和设置白名单 |
| tools | 手机代理 / QR、发布 / 历史、开发监测、译文生成调度 |

启动类 ExploreApplication 仍在包根；浏览器和模型请求沿用已有 API。POST /api/plan 新增可选 query，Java 检索路线及公开途经点位；空 query 返回完整结果。GET /api/my/library 补充本人 savedPoints、overview 与统一 SessionViews，保留下线阻断提示及任务 / 照片统计。管理概览 summary 由 AdminDashboard 使用服务端时钟汇总，不包含浏览量、精确轨迹或私人照片。

前台地图位置跟随、距离 / 方向和即时 DOM 筛选仍在设备；不上传 GPS 只为排序。注册 / 点位检索 / 探索偏好请求使用明确 DTO，其余兼容历史 JSON 的对象仍逐步整理，未为改语言丢弃未知数据字段。旧实现通过固定标签查看；当前已删除不用的 Leaflet、OSM 算路、道路资料和导入工具。

tools/voice-worker.py 与 tools/translation-worker.py 仅负责现成免费模型推理，Java 管理接口、并发、优先级、缓存及生命周期。接口代码不依赖 Node。

## 数据与回退

已有数据启动时读取而不重写；scrypt 与旧 Node 参数兼容（N=16384，r=8，p=1，64 字节，十六进制盐以 UTF-8 字符串处理），已有会话继续识别。API 写入共用事务锁；失败且未落盘的变更回滚。删除先保存移除、审计与媒体清理队列再删文件，失败重试，其他内容引用的照片不删除。所有权限、SDK 和统计脱敏在服务端处理。

升级前停止服务并完整备份 data，校验文件；回退前再备份最新数据，使用所需版本的固定源码标签及对应运行方式。不得让旧 Node 与 Java 同时写同一目录。Java 文件锁防止多个 Java 写入进程；源码回退不能恢复已经永久删除的内容。

## 工具与验证

前端开发 / 测试先安装 Node.js 20+ 并运行 `npm ci`。`npm test` 先运行 JUnit 实际 HTTP / 单元检查，再运行浏览器侧测试；`npm run backend:test` 单独后端检查。测试数据隔离，接口测试位于 src/test/java/cn/campus/testing，模型调度测试位于 cn/campus/ai。安装有模型时验证真实六音色、36 缓存及三种译文；没有模型明确跳过可选模型检查，业务 API 仍可运行。

`npm run dev` 由 Java 监测界面源码变动并自动生成译文；后端修改后重新运行 start.ps1，自动构建新 JAR；`npm run i18n:generate` / `i18n:check` 由 Java 调度，Node 解析浏览器源码，Python 生成免费译文。机器译文需人工校对。`npm run release -- --check` 校验维护文档，`npm run history -- list` / `history:check` 导出 / 隔离验证固定历史标签。无 Node 的运行机器可以直接调用 `tools/project-tool.ps1 -Tool release --check` 等命令。手机脚本入口沿用，代理与二维码均由 Java 提供。

环境变量：PORT、ADMIN_PORT、EXPLORE_DATA_DIR、ADMIN_PASSWORD、EXPLORE_VOICE_WARMUP、EXPLORE_PROJECT_ROOT。测试时钟需 EXPLORE_TEST_MODE=1 与 EXPLORE_TEST_CLOCK 双重开启，HTTP 不能开启。地图 SDK、前台定位及道路数据行为保持；未新增南侧天桥或原生后台导航能力。依赖许可见 [第三方依赖说明](第三方依赖说明.md)。

## v6.2.1 头像与记录契约

PATCH /api/auth/profile 新增 avatarPreset（20 个白名单 ID），与 avatar 字段互斥。选择预设时移除旧上传照片；上传新照片或 avatar:null 时清除预设。昵称单独修改保留原头像，双端均限定为当前登录账号。SVG 是仓库内原创静态素材。

GET /api/admin/records：kind=audit|planning、category=all|account|community|content|deletion|security|settings|other、role=all|super|normal|user、q（最多100字符）、from / to（YYYY-MM-DD、北京时间起止日）、limit（1—100）、before（最后记录ID）。先脱敏，再检索；仅管理端已登录可访问。路线校验返回统计字段白名单，不返回轨迹。GET /api/admin/audit 旧参数保留兼容。ConsoleContractTest 使用独立临时数据验证。

## v6.2.2 照片生命周期

MediaService 负责上传和所有权；MediaReferences 收集当前内容与 store.json 旧数据的照片引用；MediaCleanupService 共用 StoreRepository.mutex。上传暂未关联时保留24小时，启动30秒后首次检查、之后每5分钟整理。过期检查与正式关联都在同一锁内；已下线点位和私人记录仍是有效引用。无法读取旧数据引用时暂停回收，避免误删。

GET /api/media/{UUID}：仅照片所有者读取是否 attached 及 expiresAt；临时图片过期返回410。DELETE 同地址：仅所有者可释放未引用图片，已被引用返回409，不泄漏别人的图片存在情况。POST /api/media 兼容旧参数并返回临时期限。后台清理同时移除未登记、超过24小时且无引用的标准UUID JPEG；不跟随符号链接，不扫描头像或备份。

pendingUnusedMediaDeletes 在实际文件删除前落盘；失败重试，文件已删除但最终存储失败时，下次处理保留的队列。不把浏览器关闭事件当可靠删除凭据。默认拍摄建议空字符串按未指定处理，新客户端提交null。新增 MediaCleanupTest 和 TemporaryMediaContractTest 覆盖回收、引用保护、故障与重启、所有权和可选拍法。

校园本地化和三维模型：`maps/CampusLocalizationService` 负责受保护地点维护，`maps/CampusModelService` 负责建筑部件生成，默认资料在 `resources/campus-places.json`。接口、校准和限制见根目录三维校园维护说明；v6.4按用户要求暂停云端同步。

v6.6.0默认独立展示接口 `/api/maps/photo-model` 由 `maps/CampusPhotoModelService` 生成；管理端对应 `/api/admin/campus-map/photo-model` 需登录。`resources/campus-photo-roofs.json` 保存同一原图中的80处像素屋面 / 院落及估算高度；照片原字节与哈希入库，坐标未地理配准，不自动发布为导航模型。`PhotoSurfaceProjection` 保留原全景墙面的透视投影工具，原编号场景用于兼容及核对。修改资料后运行几何和实际HTTP回归，不能把影像编号当正式楼宇编号。


## v6.5 校园展示

`CampusModelService`转坐标并生成模型部件，`CampusAppearanceService`按ID读取每栋楼的楼层 / 屋顶 / 材质，返回连续未取模UV；浏览器只负责绘制。资料独立于账号和已发布校园地点，不把展示天桥接入算路。

`powershell -File tools/project-tool.ps1 -Tool campus-assets <本机素材目录>`由Java先验证完整素材，再打包透明PNG / JPEG和GLB，写入网页与后端的同一哈希清单；不发送网络请求，不执行AI模型，不覆盖原始素材。新克隆直接使用仓库内最终展示资源即可，无需重新调用外部生成服务。来源、可编辑字段与精度边界见三维校园维护说明.md。

真实机位、作品墙及站内通知分别位于point/ShootingSpotService、checkin/WorkWallService、notification/NotificationService；新增集合保持旧数据兼容，公开DTO与私密照片入口分离。字段、状态迁移与接口见根目录机位作品与通知维护说明.md。v6.6.0按用户要求不连接或更新服务器。

v6.7的护照规则与所有者进度在`checkin/PassportProgressService`，缩略图和上传图处理在`storage/PhotoVariants`；两个模块均为Java。规则 / 站位 / 隐私契约见根目录校园护照与照片性能维护说明.md。
