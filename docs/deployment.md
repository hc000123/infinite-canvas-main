# Render 部署

## 部署步骤

1. 将当前项目推送到你自己的 GitHub 仓库。
2. 在 Render 新建 Web Service，并选择你的仓库。
3. 构建方式选择 Docker，或按当前仓库内的 Dockerfile 构建。
4. 填写 `ADMIN_PASSWORD`、`JWT_SECRET` 等环境变量，然后点击确认部署。

部署完成后，打开 Render 分配的 `.onrender.com` 域名即可访问。

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

macOS 包同样会内置 Go 后端和 Next.js standalone 服务，运行数据保存在系统用户数据目录。当前本地构建的 `.dmg` 只做本机 ad-hoc 签名，未做 Apple Developer ID 签名和公证；通过微信、浏览器下载等方式分发后，macOS 可能会因为隔离属性提示“已损坏”或拦截打开。

如果确认来源可信，可先把应用拖到 `/Applications`，再执行：

```bash
xattr -dr com.apple.quarantine "/Applications/眨眼之间.app"
```

如果需要对外分发且不希望出现 Gatekeeper 提示，需要配置 Apple Developer ID 证书并完成 notarization 后重新打包。

如果桌面端启动失败，启动日志会写到系统用户数据目录的 `desktop.log`，macOS 默认路径类似 `~/Library/Application Support/眨眼之间/desktop.log`。
