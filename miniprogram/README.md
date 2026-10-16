# 微信小程序维护说明（v6.8）

原生小程序使用 WXML / WXSS / JavaScript，Java 后端与网页共用，不嵌套整站网页。AppID `wxd52e9ecd6a2b1693` 是公开标识；AppSecret 不属于前端配置。

## 本机运行

1. 安装 JDK 21+、Node 20+ 和微信开发者工具，微信扫码登录并启用「设置 → 安全设置 → 服务端口」。
2. 项目根目录运行 `npm ci`、`npm run mini:check`。
3. 运行 `npm run mini:start -- -CliPath 'D:/微信web开发者工具/cli.bat'`，启动本机 Java 并打开本目录。也可在工具中直接导入此目录。
4. 开发脚本写入被 Git 忽略的 `config.local.js` 和 `project.private.config.json`，默认接本机4174；开发者工具的模拟器可使用回环HTTP。手机无法访问电脑的127.0.0.1，真机须使用可达HTTPS后端，并按微信平台要求配置合法域名。

`config.js` 的默认后端为空，避免新克隆误连正式用户数据。独立验收可传 `-ApiBase http://127.0.0.1:4194 -NoBackend`，须自行启动隔离数据后端。绝不能把验收数据导入服务器。

## 已有功能与边界

首屏机位，底部机位 / 发现 / 出行 / 我的。支持条件与距离筛选、真实站位详情、喜欢 / 不喜欢确认、收藏、打卡压缩上传、作品公开申请 / 撤回 / 举报、私人足迹、通知和主题护照 / 逐栋点亮 / 本机保存分享卡片。照片默认私密；公开仍由后台审核，不改变原私人媒体权限。

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

服务器由管理员通过受保护环境配置 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` 后重启服务，不能将本机DPAPI文件上传Linux。当前版本验收不代表真实微信绑定已经配置或通过。

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
