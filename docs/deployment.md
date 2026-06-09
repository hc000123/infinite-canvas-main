# Render 部署

## 部署步骤

1. 将当前项目推送到你自己的 GitHub 仓库。
2. 在 Render 新建 Web Service，并选择你的仓库。
3. 构建方式选择 Docker，或按当前仓库内的 Dockerfile 构建。
4. 填写 `ADMIN_PASSWORD`、`JWT_SECRET` 等环境变量，然后点击确认部署。

部署完成后，打开 Render 分配的 `.onrender.com` 域名即可访问。

## 视频生成无法进入排队的排查

视频生成需要前端、Next API 代理、Go 后端和模型渠道同时可用。页面点击生成后，如果节点没有进入“排队 / 生成中”，通常先检查下面几项：

1. 确认不是只部署了静态前端。当前 `/api/*` 由 Next 代理到 Go 后端，默认地址是 `http://127.0.0.1:8080`。
2. 如果 Go 后端和 Next 不在同一个容器或机器，需要给 Next 服务设置 `API_BASE_URL`，指向可访问的 Go 后端地址。
3. 在部署环境访问 `/api/health`，应返回 `ok`；如果返回 502 或“接口连接失败”，说明 Next 没连上 Go 后端。
4. 在浏览器开发者工具 Network 里检查 `POST /api/v1/videos`：正常情况下应返回包含 `id` 和 `status=queued/running` 的任务对象。
5. 云端渠道模式下，确认后台“系统设置”里已启用可用的火山 Ark / Seedance 渠道，并配置模型、Endpoint、API Key 和用户额度。
6. 个人本地直连模式只适合本地或桌面使用；部署到公网网页时，浏览器本地 Key 仍在用户浏览器里，但请求链路、跨域和服务端代理可能和本机开发不同，商业云控版应优先使用云端代理。

Docker 部署会在同一个容器里启动 Go 后端和 Next 服务，因此默认不需要单独设置 `API_BASE_URL`。如果改成前后端分离部署，就必须显式配置。

## Docker 健康检查与持久化

Docker 镜像会同时启动 Go API 和 Next.js 页面服务，并内置 `/api/health` 健康检查。部署后可用下面命令确认状态：

```bash
docker compose ps
curl https://你的域名/api/health
```

`/api/health` 应返回：

```text
ok
```

如果 Go API 或 Next.js 任一进程退出，容器会整体退出，避免只剩页面服务存活但 `/api/*` 全部 502。正式部署时必须挂载 `/app/data`，否则 SQLite 数据、公开素材和提示词缓存会随容器重建丢失。

单容器部署默认只暴露 Next.js 的 `3000` 端口，Go 的 `8080` 只在容器内被 Next API 代理访问。公开视频 / 图片素材给外部平台拉取时，优先验证公网路径：

```text
https://你的域名/api/uploaded-assets/...
```

不要只验证 `/uploaded-assets/...`。如果后台的公网素材访问地址配置成不经过 `/api` 的路径，在线上单端口部署中可能无法访问。

正式公网部署不要使用默认 `.env` 值，至少需要修改：

- `ADMIN_PASSWORD`
- `JWT_SECRET`
- 如改用 MySQL / PostgreSQL，还需要修改 `STORAGE_DRIVER` 和 `DATABASE_DSN`

## 免费版说明

默认使用 Render 免费 Web Service：

- 空闲约 15 分钟后会休眠，下次访问会自动唤醒。
- 免费版本地文件不是持久化存储，SQLite 数据可能在重启、重新部署后丢失。
- 适合体验和演示，不适合长期保存正式数据。

如果要长期使用，建议升级 Render 付费实例并挂载 Persistent Disk，或改用 PostgreSQL。

## 管理员账号

默认管理员用户名：

```text
admin
```

管理员密码是在部署环境变量里填写的 `ADMIN_PASSWORD`。

# Windows 桌面安装包

项目支持把 Web 前端、Go 后端和本地 SQLite 数据目录封装为 Windows x64 桌面安装包。安装后双击“眨眼之间”即可启动，桌面壳会自动启动内置后端和 Next.js 服务。

## 构建步骤

在 `web` 目录执行：

```bash
npm run desktop:dist:win
```

构建完成后，安装器会输出到 `web/release/`，文件名类似：

```text
眨眼之间-0.1.0-Setup-x64.exe
```

如果只想生成可运行目录、不生成安装器，可执行：

```bash
npm run desktop:dir:win
```

## 构建说明

- `desktop:dist:win` 会先执行 `next build`，再用 `GOOS=windows GOARCH=amd64 CGO_ENABLED=0` 编译后端，最后调用 `electron-builder` 生成 NSIS 安装器。
- Windows 安装包的运行数据保存在系统用户数据目录下，不写入安装目录；SQLite、公开素材、提示词缓存和 JWT Secret 会在首次启动时自动创建。
- 在 macOS 或 Linux 上构建 Windows 安装器时，`electron-builder` 可能需要 Wine/NSIS 环境；如果本机缺少这些工具，请在 Windows 机器上执行同一条命令。
- 默认管理员账号仍为 `admin`，正式部署必须在启动环境中设置 `ADMIN_PASSWORD`、`JWT_SECRET` 等变量。

# macOS 桌面安装包

在 `web` 目录执行：

```bash
npm run desktop:dist:mac
```

构建完成后，`web/release/` 会输出当前机器架构对应的 `.dmg` 文件，例如 Apple Silicon 机器会输出：

```text
眨眼之间-0.1.0-arm64.dmg
```

如果需要指定架构，可执行：

```bash
npm run desktop:dist:mac:arm64
npm run desktop:dist:mac:x64
```

macOS 包同样会内置 Go 后端和 Next.js standalone 服务，运行数据保存在系统用户数据目录。当前本地构建的 `.dmg` 只做本机 ad-hoc 签名，未做 Apple Developer ID 签名和公证；通过微信、浏览器下载等方式分发后，macOS 可能会因为隔离属性、App Translocation 或 Gatekeeper 提示“已损坏”或拦截打开。

当前 `0.2.82` x64 DMG 验收中，DMG 可挂载，卷内 app 的版本、架构和核心资源 hash 与 `web/release/mac/眨眼之间.app` 一致。直接启动 `web/release/mac/眨眼之间.app` 以及移除 DMG 文件隔离属性后重新挂载复制出的 app，均能启动内置 3130 / 8180 服务；`127.0.0.1:8180/api/health` 返回 `ok`，`127.0.0.1:3130/login` 返回 200。

但保留下载 / 微信隔离属性的 DMG 或 app 仍会被 `spctl --assess --type execute` 判定为 `rejected`，并可能触发 App Translocation，导致桌面服务未进入健康态。正式分发前需要完成 Developer ID 签名和 notarization，或至少在目标机器按下面方式去除隔离属性后重新验证启动。

如果确认来源可信，可先把应用拖到 `/Applications`，再执行：

```bash
xattr -dr com.apple.quarantine "/Applications/眨眼之间.app"
```

如果需要对外分发且不希望出现 Gatekeeper 提示，需要配置 Apple Developer ID 证书并完成 notarization 后重新打包。

如果桌面端启动失败，启动日志会写到系统用户数据目录的 `desktop.log`，macOS 默认路径类似 `~/Library/Application Support/blink-workbench-desktop/desktop.log`。
