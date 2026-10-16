# Ubuntu 云端部署与更新

运行 Java 21、Nginx 和独立数据目录。2026-10-15 按用户单次授权，将已发布的固定标签 v6.5.3 同步到云端；随后按追加授权完成v6.5.4同步；当前云端业务版本为v6.5.4，未来版本仍需单独通知。此次授权不恢复自动同步，后续版本继续等待用户明确部署要求。部署维护不会移动既有源码标签或新增产品版本。

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
6. 将本机已有、校验过的导航语音模型档案放进云端incoming，运行 `setup-ai-linux.sh`，重建Linux环境；不要复制Windows虚拟环境。

Nginx只接受配置的域名 / IP与Origin；网页拒绝无Origin的写请求，原生小程序仅 /api/mini/ 接受无Origin请求并由Java校验独立Bearer会话，验证后将来源转换为对应的内部用户 / 管理端地址。Cookie附加Secure；客户端Forwarded和X-Forwarded-*字段被清空或覆盖。Java只从本机受信任代理读取客户端IP，不把外部Host、协议或端口用于切换管理身份。HTTP/2及文本压缩减少低带宽下的脚本加载量。真实手机定位与拍摄仍需真机实测。

## 后续更新

先完成对应代码测试，并同步GitHub源码 / 固定标签 / Release。再执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/deploy/publish-to-server.ps1 -Ref v6.5.4 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File tools/deploy/publish-to-server.ps1 -Ref v6.5.4
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


v6.5.4增加Java静态文件ETag / Last-Modified校验；日后明确授权部署时，同步应用Nginx模板的 `sub_filter_last_modified on`，保留管理静态资源经前缀改写后的修改时间校验。登录页管理入口在云端由现有 `/admin/` 转发，本机直连由Java跳转到配置的管理端口。没有新增公开端口或绕过管理员登录。参见[Nginx官方缓存头说明](https://nginx.org/en/docs/http/ngx_http_sub_module.html#sub_filter_last_modified)。本次按追加授权同步v6.5.4时应用此模板，先备份并通过隔离网关检查。

## v6.5.4 单次部署验收（2026-10-15）

固定源码 `8dc55630cbe3ba52ac7d24686c7d2c896a113e5a`，程序目录 `/opt/explore-shoot/releases/v6.5.4-8dc55630`，JAR SHA-256 `48245302f53c4cf027f0a442136c3169cb73b733634bf15fc864b8159b92a88d`。用户明确要求撤回初发v6.5.4，补充点踩确认浮层后重新发布同版；原提交仍保留历史，旧初发版未部署服务器。

停服备份 `/var/backups/explore-shoot/before-v6.5.4-8dc55630-20261015-063541.tar.gz` 的摘要校验通过。更新前快照对应16类原有记录和10个照片 / 头像文件；部署后原记录ID、文件SHA-256、SDK与设置摘要均保留，没有导入本机数据。双端公网健康接口均报告6.5.4与相同构建，Java两端仅监听回环地址（系统显示IPv4映射IPv6地址），服务 / Nginx / 证书续期计时器正常。

Nginx配置更新前备份 `/var/backups/explore-shoot/nginx-before-v6.5.4-20261015-143651.conf`，仅新增模板的 `sub_filter_last_modified on`；比较其他有效规则一致，语法检查成功后重载。正式用户脚本ETag和管理共享脚本Last-Modified均实测304；业务API保留不缓存。隔离Java与临时回环Nginx实际检查管理员登录、普通用户拒绝、Cookie路径、跨站拒绝、模型URL前缀、80处影像楼体、点踩个人置底及公共接口不泄漏点踩总数，测试数据 / 进程 / 配置清理完成。

公网浏览器实际检查1280×900桌面和390×844手机：默认机位、四入口顺序、评价按钮、双端居中登录卡片、用户登录右下管理入口，页面无横向溢出。确认浮层的确认 / 取消与点击外部 / Esc关闭在本机隔离账号上验收，不向正式账号写测试评价。程序没有固定25秒延迟，25秒故障注入仅在已关闭的本机测试代理中使用。后续版本仍等待用户明确同步要求。

## v6.7.0 部署与资源整理验收（2026-10-15）

固定源码`c65265dd9a56fbdf59902b2026a4720ba6e0b2ab`，程序目录`/opt/explore-shoot/releases/v6.7.0-c65265dd`，JAR SHA-256为`419e4e6822a392b181f5f03717984e8896ea52cea8daf3660a348f27ab76b52e`。GitHub固定标签 / Release已发布；本次按用户明确授权部署，后续版本仍需另行授权。

约44MB完整包在SSH / SFTP传输中中断，未先切换或停服。随后对服务器旧固定版本逐文件与JAR依赖压缩段作SHA-256比对，只补传约1.1MB差异，在incoming独立临时目录重建387个文件。每个文件及整个JAR均与固定源码部署清单一致，再由原deploy-release.sh完成解包校验、停服备份、切换及双端健康检查。没有导入本机data，也没有修改旧不可变程序目录；使用标准加密SSH和已核对的服务器指纹。SFTP续传的边界参见[OpenBSD官方手册](https://man.openbsd.org/sftp.1#reput)，恢复部分文件前必须核对相同前缀，不能盲目续传不同版本。

停服数据备份`before-v6.7.0-c65265dd-20261015-120815.tar.gz`摘要验证通过。对比备份和更新后的数据，11类原有记录ID、10个照片 / 头像文件SHA-256、SDK与设置完整保留。公网用户与管理健康均为6.7.0及上述构建。程序原始4174 / 4176端口仍仅监听回环地址，服务、Nginx和证书续期计时器正常。

Nginx仅补入已知admin photo JSON字段前缀规则，原配置备份为`nginx-before-v6.7.0-20261015-200830.conf`，语法检查通过后重载。隔离Java / 回环Nginx检查通过真实管理员登录、普通用户拒绝、Cookie路径、静态304、点踩个人排序和热度隐私；新增护照创建 / 关联 / 私人进度、机位条件筛选、缩略图鉴权及/admin图片前缀均通过。临时测试数据和进程已清理，没有向云端正式账号写验收打卡或虚构楼宇关联。

公网浏览器验证桌面1280像素与手机390×844：机位默认页、条件筛选、版本标识、480像素缩略图及管理登录页均正常，页面无横向溢出。个人印章、卡片和楼宇维护的写入验收在本机隔离数据与服务器临时网关数据中完成，正式主题与关联由管理员核实维护。

本机移除历史标签验收导出、旧JAR运行副本、完成的部署包及已安装模型 / Maven的重复安装压缩包；旧私人备份先压缩、逐文件校验再移除重复目录。累计清理约7302MiB文件，保留11.4MiB旧本机备份归档，另将约14.9MiB服务器旧备份转存到仓库外；约净释放7.1GiB。本机保留当前v6.7.0与上一v6.6.0运行JAR、最近两份数据备份、实际模型和原始素材；历史Git标签不变，可重新导出所需旧源码。

服务器共清理约826MiB旧程序 / 上传包 / 已安装模型的重复档案、旧验收目录和重复备份。仅保留v6.7.0与v6.5.4两个完整程序目录、两份最近数据备份及两份Nginx配置备份；实际业务数据、头像 / 照片、约995MB推理模型与Python环境、密钥、服务及证书均保留。旧备份与初始迁移包先转存到仓库外`explore-shoot-部署配置/历史备份/server-backups-before-v6.7.0-20261015.tar.gz`，21个归档文件已读取验证，SHA-256为`118620804ac427af4d7cce33d478a9831da6f9e4e2a86e851d16529e92c93f41`。

清理后再次核对双端健康与数据摘要，服务器磁盘约6.3GB / 40GB（17%），可用内存约864MiB，Swap使用0；这是验收时快照，随访问负载变化。磁盘清理不等于释放同等内存，现用Java与模型进程继续保留，隔离测试进程已退出。
