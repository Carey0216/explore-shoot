# Ubuntu 云端部署与更新

运行 Java 21、Nginx 和独立数据目录。当前业务版本仍是 v6.2.2；部署维护不会移动既有源码标签或新增产品版本。

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

用户通过固定 HTTPS 入口访问。服务器 Java 用户 / 管理监听仅绑定 127.0.0.1 的4174 / 4176，Nginx只转发用户端。管理端在本机开启 SSH 隧道后访问，本机入口指向云端数据，与原来的本地管理服务不同。

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

Nginx只接受配置的域名 / IP与Origin，拒绝无Origin的写请求，验证后将来源转换为内部用户端地址。Cookie附加Secure；客户端Forwarded和X-Forwarded-*字段被清空或覆盖。Java只从本机受信任代理读取客户端IP，不把外部Host、协议或端口用于切换管理身份。HTTP/2及文本压缩减少低带宽下的脚本加载量。真实手机定位与拍摄仍需真机实测。

## 后续更新

先完成对应代码测试，并同步GitHub源码 / 固定标签 / Release。再执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/deploy/publish-to-server.ps1 -Ref v6.2.2 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File tools/deploy/publish-to-server.ps1 -Ref v6.2.2
```

更新时换成新版本的固定标签。若相同源码和构建已部署，工具直接返回，不重传、停服或覆盖数据。首次配置以外，更新包永远只带程序；部署脚本在停服后备份服务器最新数据，然后切换current，核对用户 / 管理健康接口，最后本机工具核对外部HTTPS版本和实际JAR哈希。服务重启自动启动，更新失败时回退上一程序目录，保留数据备份；源码回退不恢复已经永久删除的图片，也不能保证跨大版本数据兼容，必要时按迁移说明处理。

日常检查：`systemctl status explore-shoot nginx`、`journalctl -u explore-shoot`、`systemctl list-timers explore-shoot-cert-renew.timer`。短期证书必须保留续期计时器及80端口的ACME验证路径。数据备份在服务器磁盘上，仍应定期另存到自己控制的位置。

部署工具的Linux隔离故障检查：`python3 tools/deploy/test-release.py`。测试使用临时目录和模拟systemctl / curl，覆盖成功、坏哈希拒绝、健康失败和启动失败；不连接正式数据库或切换真实服务。

依据：[Let’s Encrypt IP证书与Certbot说明](https://letsencrypt.org/2026/03/11/shorter-certs-certbot.html)、[Nginx Cookie与代理配置](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)。
