# 微信小程序维护说明（v7.1.2）

v7.1.2新增collections私人收藏分组、plan-share分享快照与导入；plans可生成7天链接并撤销，topics可订阅站内提醒。notifications与admin消息增加分类 / 批量已读 / 免打扰。用户图片请求会话内短暂复用、失败可重试，配图可打开完整预览，上传尝试编号随本机草稿保存。不是微信系统订阅推送，平台公开发布仍独立操作。维护见[加载消息与拍摄计划维护](../加载消息与拍摄计划维护.md)。

v7.1.1 同步统一顶栏与分体玻璃dock、图文通知独立详情、站内链接与联系管理员。pages/admin提供独立管理员登录、消息与待办、联系指定用户、私密回复和公告维护；与用户令牌隔离，其他旧管理模块仍在网页管理端维护。消息配图每次鉴权，不使用公开媒体绕过权限；外部链接受微信域名规则限制，明确展示后可复制。详细边界见[消息与移动布局维护](../消息与移动布局维护.md)。

v7.1 原生社区包含发现 / 机位，活动独立dock，中央＋发布，头部通知。pages/publish为照片优先编辑器，pages/scout为30题题库的资格小测；勋章弹窗、分享卡换样式及整图适配与网页一致。共用后端权限和进度，不在客户端计算资格。小程序编译 / 预览不等于微信平台公开发布。

v6.10 机位页增加校园拍照助手，原生页面在 `pages/assistant`，与网页共用 Java 公开知识检索与可选模型整理。v7.0 后端已按本次授权同步云端，可使用 Phone 调试；Local 仅供电脑模拟器，真实手机不能连接 127.0.0.1。模型密钥仅在 Java 配置，不能放小程序。详见[数据库与助手维护](../数据库迁移与校园助手维护.md)。

v7.0 新增 `pages/framing` 取景辅助、`pages/plans` 私人拍摄清单、`pages/topics` 季节活动；经验卡在公开投稿内选填。公开资料离线缓存和私人图片草稿分别维护，功能开关由顶级管理员配置，使用 / 修改位置见[拍摄工具与顶级管理员维护](../拍摄工具与顶级管理员维护.md)。


原生小程序使用 WXML / WXSS / JavaScript，Java 后端与网页共用，不嵌套整站网页。AppID `wxd52e9ecd6a2b1693` 是公开标识；AppSecret 不属于前端配置。

## 本机运行

1. 安装 JDK 21+、Node 20+ 和微信开发者工具，微信扫码登录并启用「设置 → 安全设置 → 服务端口」。
2. 项目根目录运行 `npm ci`、`npm run mini:check`。
3. 手机调试运行 `npm run mini:start -- -CliPath 'D:/微信web开发者工具/cli.bat'`，默认Phone模式，从仓库外部署配置读取公开HTTPS地址，先检查后端再打开工具。新克隆没有部署配置时显式传 `-ApiBase https://你的后端域名`。
4. 电脑本机模拟器使用 `npm run mini:start -- -Target Local -CliPath 'D:/微信web开发者工具/cli.bat'`，才启动电脑Java并连接127.0.0.1；此配置不用于手机扫码。
5. 开发脚本写入被Git忽略的 `config.local.js` 和 `project.private.config.json`。切换配置后重新编译并重新扫描二维码，旧会话会清除，需要重新登录。截图中调试器「已连接」只表示远程调试通道连接，并不说明业务后端连接成功。
6. Phone模式用于开发调试；当前IP后端测试需在微信打开调试模式，关闭调试的普通预览 / 体验版可能仍被合法域名限制。正式包使用 `-Target Production -ApiBase https://已登记的后端域名`，该模式拒绝IP / HTTP并启用平台域名校验，不修改或绕过服务器TLS。

`config.js` 的默认后端为空，避免新克隆误连正式用户数据。独立验收可传 `-Target Local -ApiBase http://127.0.0.1:4194 -NoBackend`，须自行启动隔离数据后端。绝不能把验收数据导入服务器。

## 已有功能与边界

首屏发现，底部社区 / 活动 / 中央发布 / 出行 / 我的；社区内切换发现与机位。支持条件与距离筛选、真实站位详情、喜欢 / 不喜欢确认、收藏、打卡压缩上传、作品公开申请 / 撤回 / 举报、私人足迹、通知和主题护照 / 逐栋点亮 / 本机保存分享卡片。照片默认私密；公开仍由后台审核，不改变原私人媒体权限。

出行使用微信原生 map 和 openLocation；不复制网页三维WebGL或网页逐步语音导航，不声称已实现后台持续导航。底图和真实定位受设备、平台资质和网络影响，需要真机验收。网页管理端继续维护全部内容与权限。

v6.8 起客户端和网页只提供中文，移除所有语言切换、内容翻译和词典依赖；字号 / 动画 / 导航语音与用户原文保留。

## 登录与服务配置

已有账号可直接用账号密码登录。注册邀请码选填：没有为普通用户，有效码为探索官，无效码明确拒绝。

微信绑定为可选能力。先登录已有账号再绑定，微信 code 换取身份仅由 Java 调用官方接口；不会根据昵称合并账户或生成虚构邮箱。未绑定微信不能直接登录。解除绑定需要当前密码，并撤销该账号原生会话，网页会话独立。

仅需要本机微信登录时，在项目根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/configure-wechat.ps1 -AppId wxd52e9ecd6a2b1693
```

按本机隐藏提示输入 AppSecret，不发到聊天。脚本使用当前Windows账号DPAPI加密，存于仓库外 `../explore-shoot-部署配置/wechat.local.json`；配置不能跨Windows账号直接解密。服务只在启动时读取解密值，配置不存在时隐藏微信入口，账号密码登录不受影响。

服务器由管理员通过受保护环境配置 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` 后重启服务，不能将本机DPAPI文件上传Linux。v6.8.0未配置真实微信登录；v6.8.2已按单次授权启用云端test模式并验收真实一键登录，原正式账号微信绑定不因此自动创建。

## 发布与更新

源码、中文日志、固定标签与 GitHub Release 同仓库维护。共享Java接口 / 数据更新直接服务网页与小程序；WXML / WXSS、设备能力或界面变化需要同步修改并用微信开发者工具编译。GitHub发布不会自动提交微信审核，也不会替代微信客户端版本发布。

正式微信发布前需配置自己的已备案HTTPS合法域名、request / downloadFile域名、隐私保护指引与实际使用的定位 / 选图权限，完成当前账号类目和接口资质检查，再由账号所有者提交审核。现有IP地址可用于受控开发检查，不作为正式合法域名配置。AppSecret未配置时不展示微信绑定按钮。

## 按目录修改

| 位置 | 内容 |
|---|---|
| pages | 机位列表、详情、打卡、地图、护照、通知、登录与设置的四件套 |
| components | 鉴权懒加载图片和加载 / 错误状态 |
| services/api.js | 唯一后端请求、Bearer会话、私人照片与跨账号响应隔离 |
| services/photo.js | 最长边1600的JPEG压缩与上传准备 |
| services/model.js | 条件、个人点踩置底、距离与定位 |
| services/atlas.js | 原图 / 编号图逐栋遮罩、灰色未完成、院落留空 |
| services/coordinates.js | 复制既有坐标模块，运行 npm run mini:sync 同步，不手改两份 |
| ../backend/src/main/java/cn/campus/miniprogram | 原生路径白名单、微信身份交换与绑定 |

页面请求继续调用统一 api.request，不直接拼接令牌URL。用户私人图片须走带Bearer下载并在切换账号时删除临时文件；不得把管理员接口加入客户端白名单。后端接口及会话隔离测试位于 MiniProgramContractTest、MiniProgramServiceTest、WechatIdentityClientTest，前端运行 `npm run mini:check`；官方编译和真机验收不能由静态测试替代。

## v6.8.1 网络与玻璃材质

真实设备发现回环地址时不再继续无效请求，给出明确切换指引；服务器域名限制、TLS证书、请求超时分开提示，禁止显示Bearer或私人照片路径。登录会话绑定所用后端，切换到不同服务后清除旧会话与私人临时下载，不跨环境携带凭据。

`custom-tab-bar`为原生自定义四入口dock，使用半透明渐变、高光边缘和柔和阴影，支持的环境再叠加backdrop-filter；pageOptions在页面显示时同步选中项。卡片保留可读背景，不给全部滚动卡片施加实时模糊。不能承诺完全复刻iOS系统材质折射，不切换整站渲染引擎换效果；地图与Canvas页面继续保留性能余量。

联网与样式兼容现有v6.8.0 API；新增微信测试登录需v6.8.1后端和受保护AppSecret配置，服务器发布以本次明确授权和部署维护记录为准，不能迁入本机业务数据。GitHub源码发布与微信平台发布仍是独立流程。

依据：[微信网络规范](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)、[微信样式支持列表](https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/wxss.html)。

## 微信一键测试登录与正式数据隔离

在本机隐藏输入中配置测试模式：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/configure-wechat.ps1 -TestLogin
```

密钥通过Windows DPAPI加密，当前用户可解密，源码脚本带UTF-8 BOM以兼容Windows PowerShell中文目录。工具不依赖安全模块自动加载，AppSecret不出现在参数、源码或聊天。服务器需在固定版本部署之后，另经授权运行 `tools/deploy/configure-wechat-server.ps1`；密钥只经已核验SSH标准输入写入自己的服务器root专用600权限环境文件，不上传Windows加密文件。

模式由 `WECHAT_LOGIN_MODE` 控制：`test` 允许不预先注册 / 绑定的一键测试登录，创建普通测试账号；`bound` 保留已有正式绑定登录；`off` 关闭微信入口；`production` 在保留正式绑定登录前强制检查无测试数据。测试账号使用独立wechatTestBindings和明确账号标记，不能转为正式账号，不能合并到已有账号；测试会话只在test模式的原生通道有效。

测试期间可使用私人打卡、照片和护照；不向社区提交公开作品、共创或举报，不计入全站点赞数。正式上线前停服、核对数据目录，运行：

```powershell
java -jar backend/target/explore-shoot-backend.jar --tool=retire-wechat-test --check
java -jar backend/target/explore-shoot-backend.jar --tool=retire-wechat-test --apply
```

工具先在当前data/maintenance-backups生成完整数据ZIP并逐文件验证，再清理测试账号、测试身份映射、会话、打卡、照片、头像、通知和测试评价；其余账号 / 正式绑定 / 真实记录不删除。照片被其他内容引用会拒绝，文件被占用时队列保留，解除占用后重复执行。保留必要维护备份与审计；备份受控保管，不能迁入正式活跃数据。生产模式发现任何测试账号 / 映射 / 待清理队列即拒绝启动，不会静默带入正式账号数据。

## v6.8.2 测试账号检索

微信测试账号可执行只读POST机位搜索，支持综合 / 热门 / 附近 / 收藏及分页。此例外只对应/api/points/search，不开放公开作品、举报、机位投稿或探索官申请；网页账号及普通注册规则保留。后台修复复用同一Java搜索服务，客户端无需另写筛选逻辑。本版按用户确认同步服务器，实际部署与验收见tools/deploy/README.md，未来版本不自动同步。

云端真实微信登录及四种筛选已在官方开发者工具通过，使用独立测试身份，加载16个点位且运行异常为空。预览包82474字节，手机需使用最新二维码并保持微信调试模式；本次不等同微信平台公开发布，实际iPhone网络、相册和定位继续由持有设备的用户复测。

## v6.9站点内容与开屏公告

pageOptions统一接入公开内容与公告查询 / 展示许可；site-overlay全局组件负责公告、帮助和环境标识。后台发布文案后下次页面加载读取，字段按纯文本显示。公告按channel=mini和实际页面过滤，后端决定是否可显示，关闭后恢复page-meta滚动。

开发 / 测试数据由tools/start-environment.ps1单独启动；模拟器可显式使用-Target Local -ApiBase http://127.0.0.1:4354 -NoBackend连接测试服务，不用于手机扫码。正常Phone仍连接云端试点。正式发布只接受合法HTTPS域名和production服务；IP仍仅供微信调试模式，源码Release不等于微信平台审核发布。


## v6.9.1地点封面与参考图

services/model.js 的 pointView 统一机位列表、发现和详情图片：地点cover优先，其次为已发布matchingSpots的示例照片，最后采用网页已有的同校参考配图（图书馆 / 建筑 / 校园）。参考图必须标明非机位实拍，不将任意私人打卡当作公共封面。详情预览与可见主图共用point.photo；列表缩略图 / 懒加载和私有图片Bearer下载不变。当前客户端兼容云端v6.9.0，无需为本修复重启服务器。
