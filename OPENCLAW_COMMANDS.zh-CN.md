# OpenClaw 命令查询（Windows 友好）

本文件是 OpenClaw CLI 常用命令速查表，适合 Windows 部署/运维时复制使用。

约定：

- 如果你在源码仓库里运行，用 `pnpm openclaw ...`
- 如果你已全局安装 `openclaw`，直接用 `openclaw ...`
- 配置文件默认路径：`~/.openclaw/openclaw.json`（Windows：`C:\Users\<你>\.openclaw\openclaw.json`）
- 默认 Gateway 地址：`ws://127.0.0.1:18789`，控制台/UI：`http://127.0.0.1:18789/`

---

## 0) 帮助与自检

```bash
openclaw --help
openclaw <command> --help
openclaw --version
```

常见自检：

```bash
openclaw status
openclaw health
openclaw doctor
openclaw logs
```

---

## 1) 配置（config / configure / onboard）

交互式向导（适合首次配置）：

```bash
openclaw config
openclaw configure
openclaw onboard
```

按 section 运行向导（更快）：

```bash
openclaw configure --section gateway
openclaw configure --section channels
openclaw configure --section models
openclaw configure --section web
```

非交互读写配置（dot path / bracket path 都支持）：

```bash
openclaw config get gateway.port
openclaw config get gateway.auth.token
openclaw config set gateway.port 18789
openclaw config set gateway.bind '"loopback"'
openclaw config unset gateway.remote
```

提示：

- `config set` 的 `<value>` 是 JSON5 或原样字符串；写字符串时建议用引号包住（例如 `"loopback"`）。

---

## 2) Gateway（启动 / 状态 / 服务）

启动本地 Gateway（前台运行）：

```bash
openclaw gateway
openclaw gateway run
openclaw gateway --port 18789
```

状态与探测：

```bash
openclaw gateway status
openclaw gateway status --deep
openclaw health
```

端口被占用时（开发用）：

```bash
openclaw gateway --force
```

打开控制台 UI（会自动带上当前 token）：

```bash
openclaw dashboard
```

### Windows 开机自启（daemon / scheduled task）

Windows 上 service 实现是 Scheduled Task（计划任务），安装通常需要管理员权限：

```bash
openclaw daemon install --port 18789 --runtime node --force
openclaw daemon status --deep --no-probe
openclaw daemon restart
openclaw daemon stop
openclaw daemon uninstall
```

---

## 3) Token / 认证（最常见问题）

获取 Gateway Token（用于 `http://127.0.0.1:18789/` 的连接）：

```bash
openclaw config get gateway.auth.token
```

设置/轮换 token（修改后建议重启 gateway）：

```bash
openclaw config set gateway.auth.token "替换成你生成的随机 token"
```

远程模式（注意：`gateway.remote.token` 只用于 CLI 连接远程，不影响本地网关认证）：

```bash
openclaw config get gateway.remote.url
openclaw config get gateway.remote.token
```

---

## 4) 插件（plugins）

从 npm 安装插件（例如飞书）：

```bash
openclaw plugins install @openclaw/feishu
openclaw plugins doctor
```

禁用/启用插件：

```bash
openclaw plugins disable feishu
openclaw plugins enable feishu
```

卸载插件：

```bash
openclaw plugins uninstall feishu
openclaw plugins uninstall feishu --dry-run
openclaw plugins uninstall feishu --keep-files
```

---

## 5) 渠道（channels）

查看渠道状态（是否在线/配置是否缺失）：

```bash
openclaw channels status
openclaw status
```

渠道登录/登出（每种渠道子命令略有差异，先看帮助）：

```bash
openclaw channels --help
openclaw channels login --help
```

---

## 6) 消息（message）

发送消息（具体 `--channel` / `--target` 取决于你启用的渠道）：

```bash
openclaw message send --help
openclaw message send --channel telegram --target @yourchat --message "Hi"
```

---

## 7) 配对与设备（pairing / devices / qr）

列出设备与配对请求：

```bash
openclaw devices list
openclaw pairing list --help
```

生成 iOS 配对码 / 二维码：

```bash
openclaw qr --help
openclaw qr
```

---

## 8) Node（节点）与 Nodes（网关管理节点）

节点服务（在另一台机器上跑 headless node host）：

```bash
openclaw node --help
```

网关侧的节点管理与审批：

```bash
openclaw nodes --help
openclaw nodes pending
openclaw nodes approve <requestId>
```

---

## 9) 日志与排障（logs / doctor / troubleshooting）

查看网关 RPC 日志（最常用）：

```bash
openclaw logs
openclaw logs --help
```

健康检查与修复建议：

```bash
openclaw doctor
openclaw doctor --help
```

---

## 10) 安全（security / approvals / sandbox）

安全审计（建议在启用工具或暴露到网络前跑）：

```bash
openclaw security --help
openclaw security audit --help
```

执行审批（如果你启用了需要审批的工具链）：

```bash
openclaw approvals --help
```

---

## 11) 定时任务（cron）

```bash
openclaw cron --help
```

---

## 12) 常用工作模式：profile（隔离环境）

用 profile 隔离配置与状态（多个实例/多环境时很有用）：

```bash
openclaw --profile prod status
openclaw --profile prod config get gateway.port
openclaw --profile prod gateway status
```

开发隔离模式（dev profile）：

```bash
openclaw --dev status
openclaw --dev gateway
```
