# Ubuntu 云端部署与更新

运行 Java 21、Nginx 和独立数据目录。2026-10-15 按用户单次授权，将已发布的固定标签 v6.5.3 同步到云端；本机、GitHub 与云端业务版本均为 v6.5.3。此次授权不恢复自动同步，后续版本继续等待用户明确部署要求。部署维护不会移动既有源码标签或新增产品版本。

## 目录与入口

| 位置 | 用途 |
|---|---|
| `/opt/explore-shoot/releases/<版本-提交>` | 校验过的不可变程序、前端与部署清单 |
| `/opt/explore-shoot/current` | 当前运行程序的链接 |
| `/var/lib/explore-shoot/data` | 账号、记录、图片及 SDK 配置，后续更新保留 |
| `/var/lib/explore-shoot/runtime/tools-bin` | Linux 模型、环境与导航常用语音缓存 |
| `/etc/explore-shoot/server.env` | 服务环境，root 管理、不提交 Git |
| `/var/backups/explore-shoot` | 每次更新前的停服数据备份与 SHA-256 |
| 仓库外 `explore-shoot-部署配置/server.json` | 本机目标配置、专用密钥路径和已核对的服务器指纹 |

用户通过固定 HTTPS 入口访问；管理入口为同一地址下的 `/admin/`，例如 `https://<服务器IP>/admin/`。无需本机运行程序或开启隧道，原管理员账号与密码继续使用。服务器 Java 用户 / 管理监听仅绑定 127.0.0.1 的4174 / 4176，Nginx分别转发根目录与管理目录，登录和权限仍由 Java 校验。

`/admin` 自动补全结尾斜线。管理静态 HTML / CSS / JavaScript 中的根资源路径、登录跳转及 API 地址在网关响应中加上 `/admin/`，本地双端入口和固定产品标签保持可复现；管理 API 的 JSON 只处理已知图片和校园 GLB 模型 URL 字段，姓名与正文等文本不改写。管理员 Cookie 使用 Secure / HttpOnly，Path 限于 `/admin/`，不会作为用户会话生效。普通用户登录不能获得管理权限，未登录的管理业务请求返回401。

SSH 隧道保留为可选维护入口，指向相同云端数据，与原来的本地管理服务不同：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/deploy/admin-tunnel.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools/deploy/admin-tunnel.ps1 -Close
```

默认从仓库外部署配置读取连接信息；新克隆需要自己的配置和授权密钥。示例字段是 `server`（IPv4）、`username`、`privateKey`、`knownHosts`、`hostFingerprint`、`publicOrigin`、`adminLocalPort`，当前连接使用 SSH 22端口。先通过可信控制台核对服务器指纹，不自动接受陌生主机。

## 首次部署

1. `ubuntu-bootstrap.sh` 安装系统运行依赖、专用低权限服务用户、独立目录和 Certbot；仅没有交换空间时创建2 GiB交换文件。
2. 准备固定源码 ZIP 与测试过的 JAR，部署清单校验全部文件和构建哈希；包中没有账号、图片、模型或密钥。
3. 一次性迁移先停止本机写入并备份。`import-initial-data.py` 验证全部文件摘要，只允许导入空的云端数据目录；之后不再运行此步骤。
4. 安装 `explore-shoot.service`，执行 `deploy-release.sh`。程序以专用账号运行，模型与数据可写，程序目录只读。
5. 安全组仅需为网站放行TCP 80 / 443；4174、4176保持不公开。`enable-ip-https.sh` 使用 Certbot 5.4+ 的 IP / shortlived 支持申请可信证书，并建立每12小时检查续期及 Nginx重载。固定IP变化时需要重新配置和申请。
6. 将本机已有、校验过的五个免费模型档案放进云端incoming，运行 `setup-ai-linux.sh`，重建Linux环境；不要复制Windows虚拟环境。

Nginx只接受配置的域名 / IP与Origin，拒绝无Origin的写请求，验证后将来源转换为对应的内部用户 / 管理端地址。Cookie附加Secure；客户端Forwarded和X-Forwarded-*字段被清空或覆盖。Java只从本机受信任代理读取客户端IP，不把外部Host、协议或端口用于切换管理身份。HTTP/2及文本压缩减少低带宽下的脚本加载量。真实手机定位与拍摄仍需真机实测。

## 后续更新

先完成对应代码测试，并同步GitHub源码 / 固定标签 / Release。再执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/deploy/publish-to-server.ps1 -Ref v6.5.3 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File tools/deploy/publish-to-server.ps1 -Ref v6.5.3
```

更新时换成新版本的固定标签。若相同源码和构建已部署，工具直接返回，不重传、停服或覆盖数据。首次配置以外，更新包永远只带程序；部署脚本在停服后备份服务器最新数据，然后切换current，核对用户 / 管理健康接口，最后本机工具核对外部HTTPS版本和实际JAR哈希。服务重启自动启动，更新失败时回退上一程序目录，保留数据备份；源码回退不恢复已经永久删除的图片，也不能保证跨大版本数据兼容，必要时按迁移说明处理。

Windows PowerShell 5打包时显式创建正斜线ZIP条目，与清单的相对路径一致；不能使用生成反斜线条目的旧`.NET CreateFromDirectory`方式。Linux先验证路径、全部文件摘要和JAR版本，校验失败不会停止旧服务；临时解压目录在退出时清理。该维护工具使用main里的当前版本，发布源码标签始终保持固定。

日常检查：`systemctl status explore-shoot nginx`、`journalctl -u explore-shoot`、`systemctl list-timers explore-shoot-cert-renew.timer`。短期证书必须保留续期计时器及80端口的ACME验证路径。数据备份在服务器磁盘上，仍应定期另存到自己控制的位置。

部署工具的Linux隔离故障检查：`python3 tools/deploy/test-release.py`。测试使用临时目录和模拟systemctl / curl，覆盖成功、坏哈希拒绝、健康失败和启动失败；不连接正式数据库或切换真实服务。

管理目录网关检查：在已经安装本项目、IP证书与Nginx的测试服务器，以root执行 `python3 tools/deploy/test-admin-prefix.py`。它启动独立 Java 数据目录与只监听回环地址的临时Nginx端口，验证资源前缀、实际管理员登录、Cookie路径、普通用户拒绝、用户会话隔离与跨站请求拒绝；结束后清理临时进程与配置。无需正式管理员密码，不访问正式账号数据。正式启用网关前保存原配置，运行 `nginx -t`，成功后重载；失败时恢复原配置。

依据：[Let’s Encrypt IP证书与Certbot说明](https://letsencrypt.org/2026/03/11/shorter-certs-certbot.html)、[Nginx Cookie与代理配置](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)。

## v6.5.3 单次部署验收（2026-10-15）

固定源码提交为 `a4f2f1943796f5f65364eb58239af36be847a146`，程序目录为 `/opt/explore-shoot/releases/v6.5.3-a4f2f194`，JAR SHA-256 为 `70da29593ac6a615457b95a57ea784d7a7c05cbe8e78629bdb3043da4f7c8d7e`。程序包只含源码、前端资源和已测试 JAR，不含本机业务数据、密钥或推理权重。

云端停服备份 `before-v6.5.3-a4f2f194-20261015-005356.tar.gz` 的摘要验证通过。更新后，11类原有记录的ID、10个照片 / 头像文件摘要以及SDK和设置摘要均保留。用户和管理健康接口报告6.5.3及相同构建；影像模型接口返回80处屋面。服务、Nginx与证书续期计时器正常，4174 / 4176仅监听回环地址。

隔离网关检查通过实际管理员登录、普通账号拒绝、Cookie路径与跨站请求拒绝，并补验管理GLB地址的 `/admin/` 前缀及80处影像模型；测试临时进程、数据和Nginx配置已清理。正式Nginx仅补齐当前模板的已知 `modelUrl` 前缀规则，修改前留备份，语法检查通过后重载；不修改任意正文，也不放宽权限。

本次曾遇到SSH认证前重置和新版Workbench文件传输失败，改用已授权的阿里云旧版Workbench上传，逐文件及包摘要校验后执行同一部署脚本。随后SSH恢复，可正常使用原专用密钥维护；未修改账号凭据、防火墙或网络套餐。

公网浏览器已显示80处影像楼体与原图贴图，管理入口跳转至独立登录页。首次加载仍有性能问题：当前HTML / JS / CSS /展示图片返回 `Cache-Control: no-cache`，但没有ETag或Last-Modified，无法保证重复访问只校验而不下载；页面也存在多层模块请求。脚本gzip已启用，HTTP/2已配置。此次保持固定v6.5.3应用内容，未以长缓存掩盖更新、未缓存业务接口，也未更改云服务器套餐；性能优化需后续版本处理。
