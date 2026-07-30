# 发布与上线操作手册

> [!IMPORTANT]
> 本文件是本项目正式发版本和上线的固定入口。以后执行上线任务时先读取本文件；流程发生变化时同步更新这里，不再从聊天记录中还原。

固定顺序：

```text
提交前全量冒烟 → 修复并复测 → 整理版本和文档 → 提交全部改动
→ 对提交后的 HEAD 复测 → 创建 tag → 推送 main 和 tag
→ GitHub 镜像构建通过 → Render 手工部署同一提交 → 云端冒烟与持久化复验
```

## 历史流程核对结果

仓库版本、远端 tag 和 GitHub Actions 记录确认了以下惯例：

- `v0.2.90` 至 `v0.2.97` 的 tag 都直接指向对应 release commit。
- release commit 会同步更新根目录 `VERSION`、`web/package.json`、`web/desktop/app/package.json` 和 `CHANGELOG.md`。
- `CHANGELOG.md` 顶部保留空的 `Unreleased`，新版本记录紧随其后。
- 最近版本提交信息使用 `release: v0.2.97`；后续统一使用 `release: vX.Y.Z`。
- 最近 8 个版本中有 7 个使用 lightweight tag，因此固定使用 `git tag vX.Y.Z`，不改用 annotated tag。
- 推送 `main` 和 `v*` tag 会分别触发一次 `Build Docker Image`。
- 历史上没有创建 GitHub Release；当前发布产物以 Git tag 和 GHCR 镜像为准。
- 远端缺少历史 `v0.2.94` tag，说明只推分支可能遗漏 tag；因此下面的流程强制检查远端分支和 tag。

上一次 `v0.2.97` 的实际记录：

- release commit：`33d692e5059548e4a4288ef7f72f3159152511f6`
- `main` 镜像构建：[GitHub Actions #30140770786](https://github.com/hc000123/infinite-canvas-main/actions/runs/30140770786)
- `v0.2.97` 镜像构建：[GitHub Actions #30140835239](https://github.com/hc000123/infinite-canvas-main/actions/runs/30140835239)
- 两次构建均成功，且指向同一个 release commit。

## 1. 上线前确认

要求本机具备 Git、Go 1.25、Bun、Docker 和 Docker Compose v2。`gh` 只用于查看 GitHub Actions，不是必需项。

在项目根目录执行：

```bash
git status --short --branch
test "$(git branch --show-current)" = "main"

git fetch origin main
git merge-base --is-ancestor origin/main HEAD
```

最后一个命令必须成功，表示当前分支已经包含远端 `main`，不会覆盖远端新增提交。

同时确认：

- 查看全部待提交文件，排除 `.env`、密钥、数据库、媒体文件、测试截图和临时目录。
- `docs/todo.md` 与 `docs/pending-test.md` 已按本轮真实变更整理。
- 付费文本、图片和视频请求不属于默认自动冒烟；需要真实付费验收时必须单独确认。

## 2. 提交前全量冒烟

### 后端

```bash
test -z "$(git ls-files '*.go' | xargs gofmt -l)"
go mod verify
go mod tidy -diff
go vet ./...
env GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build ./...
go test ./... -count=1
```

### 前端

```bash
cd web
bun install --frozen-lockfile
bun run test
bun run typecheck
bun run lint
bun run lint:fast
bun audit
bun run build
cd ..
```

ESLint 和 oxlint 的 warning 需要记录，但只有 error 阻断发布。`bun run unused` 和 `bun run format:check` 当前用于记录历史清理项，不在上线前临时批量修复。

### Docker 生产形态

先确认 `.env` 中的 `ADMIN_PASSWORD` 和 `JWT_SECRET` 不是示例值，再执行：

```bash
docker compose -f docker-compose.local.yml config
docker compose -f docker-compose.local.yml --progress=plain build
docker compose -f docker-compose.local.yml up -d
docker compose -f docker-compose.local.yml ps

curl -fsS http://127.0.0.1:3000/api/health
curl -fsS -o /dev/null http://127.0.0.1:3000/login
curl -fsS -o /dev/null http://127.0.0.1:3000/api/settings

docker compose -f docker-compose.local.yml exec -T app dreamina version
docker compose -f docker-compose.local.yml exec -T app sh -lc '! command -v codex'
```

`/api/health` 必须精确返回 `ok`。Docker 验收还要确认：

- Next 页面和内部 Go API 同时可用。
- `/api/*` 代理正常。
- 实际的 `/api/uploaded-assets/...` 素材地址可以读取。
- 注册一个唯一测试用户，重启容器后仍能登录，以证明 SQLite 数据卷生效。
- 重启后 Dreamina 登录目录和生成目录仍位于 `/app/data`。
- 生产镜像内不存在 Codex CLI。

如果容器只为本次验收启动，完成后可以执行：

```bash
docker compose -f docker-compose.local.yml down
```

不要附加 `-v`，也不要删除项目的 `data` 目录。

### 浏览器核心冒烟

至少覆盖：

1. 注册、登录、退出和管理员登录。
2. 创建项目和分集，刷新后仍可打开。
3. 普通用户看不到 Workflow 管理入口，直接访问也会被拦截。
4. 项目缓存、素材、提示词、生图和视频页面可以打开。
5. 提示词页面无无限更新、白屏和控制台错误。
6. Docker 页面请求均为同源，核心接口没有 4xx/5xx。
7. 不点击会产生真实费用的生成按钮；如需真实渠道测试，单独记录模型、任务 ID、费用和结果。

发现问题后先修复，再重新运行受影响检查和完整门禁。只有最终代码状态全部通过，才能进入发版本。

## 3. 整理版本

下面以 `v0.2.98` 为示例；每次只需要修改 `release_tag`：

```bash
release_tag="v0.2.98"
release_version="${release_tag#v}"

printf '%s\n' "$release_tag" > VERSION

(
  cd web
  bun pm pkg set "version=$release_version"
)

(
  cd web/desktop/app
  bun pm pkg set "version=$release_version"
)
```

手工整理 `CHANGELOG.md`：

1. 把当前 `Unreleased` 内容归入 `## vX.Y.Z - YYYY-MM-DD`。
2. 在文件顶部继续保留空的 `## Unreleased`。
3. 只写版本级摘要，具体测试明细继续放在 `docs/pending-test.md`。

校验三个版本文件和 Changelog：

```bash
test "$(tr -d '\r\n' < VERSION)" = "$release_tag"

node -e '
const expected = process.argv[1];
for (const file of ["web/package.json", "web/desktop/app/package.json"]) {
  const actual = require("./" + file).version;
  if (actual !== expected) throw new Error(`${file}: ${actual} != ${expected}`);
}
' "$release_version"

rg -F "## $release_tag - " CHANGELOG.md
git diff --check
```

## 4. 提交全部改动并复测

```bash
git status --short
git diff --check

git add -A
git diff --cached --check
git diff --cached --stat

git commit -m "release: $release_tag"
release_commit="$(git rev-parse HEAD)"

test -z "$(git status --porcelain)"
```

提交后，针对 `release_commit` 重新执行第 2 节的后端、前端、Docker 和浏览器冒烟。复测期间如果又修改了任何文件，必须重新提交并再次复测；tag 只能创建在最终通过的干净 HEAD 上。

## 5. 创建并推送 tag

本项目沿用历史上的 lightweight tag：

```bash
git tag --list "$release_tag"
git ls-remote --tags origin "$release_tag"
```

两条命令都应没有输出。若本地或远端已存在同名 tag，立即停止，不要覆盖、删除或强推。

确认无冲突后执行：

```bash
git tag "$release_tag"

test "$(git rev-parse "$release_tag^{commit}")" = "$release_commit"
test -z "$(git status --porcelain)"

git push origin main
git push origin "$release_tag"
```

不要使用 `git push --follow-tags`：它不会推送本项目历史上占多数的 lightweight tag。

推送后强制核对远端：

```bash
remote_main_sha="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
remote_tag_sha="$(git ls-remote origin "refs/tags/$release_tag" | awk '{print $1}')"

test "$remote_main_sha" = "$release_commit"
test "$remote_tag_sha" = "$release_commit"
```

## 6. 检查 GitHub 镜像

查看 [Build Docker Image](https://github.com/hc000123/infinite-canvas-main/actions/workflows/docker-image.yml)，或执行：

```bash
gh run list \
  --workflow docker-image.yml \
  --commit "$release_commit" \
  --limit 5
```

同一个提交应有两个成功的 run：

- `main` run：产生 `ghcr.io/hc000123/infinite-canvas-main:latest` 和 `sha-*`。
- tag run：产生 `ghcr.io/hc000123/infinite-canvas-main:vX.Y.Z` 和 `sha-*`。

记录 release commit、两个 Actions URL 和镜像 digest。

GitHub Actions 当前只构建并推送 linux/amd64 Docker 镜像，不运行测试，也不会部署 Render。因此本地全量冒烟不能省略，Actions 成功也不能视为线上已经更新。

## 7. Render 手工部署

当前 `render.yaml` 使用仓库 Dockerfile，且 `autoDeployTrigger: off`：

- Render 不会自动部署。
- Render 不直接使用 GHCR 镜像，而是从所连接的 GitHub 仓库重新构建。
- 必须选择与 tag、Actions 完全相同的 release commit SHA。

部署前先确认：

1. 数据库和 `/app/data` 已做备份或快照。服务启动会执行 AutoMigrate，回滚旧镜像不会自动回滚数据库结构。
2. Render Dashboard 已配置 Persistent Disk 并挂载到 `/app/data`。仓库当前 `render.yaml` 是 free plan 且没有磁盘声明，仅凭仓库配置不能保证持久化。
3. 即使数据库改用 PostgreSQL，公开素材、项目缓存、工作流媒体和 Dreamina 登录态仍需要持久磁盘或对应的外部存储。
4. 生产环境至少明确配置：

```dotenv
PORT=3000
APP_ENV=production

ADMIN_USERNAME=admin
ADMIN_PASSWORD=<非默认强密码>
JWT_SECRET=<稳定随机密钥>

STORAGE_DRIVER=sqlite
DATABASE_DSN=/app/data/infinite-canvas.db
PUBLIC_ASSET_DIR=/app/data/public-assets
PROJECT_CACHE_DIR=/app/data/project-cache
WORKFLOW_LOCAL_MEDIA_DIR=/app/data/workflow-media

WORKFLOW_WORKER_ENABLED=true

DREAMINA_HOME=/app/data/dreamina-home
DREAMINA_OUTPUT_DIR=/app/data/jimeng-cli
```

如使用登录 IP 绑定或客户端 IP 审计，还要按 Render 实际代理网段配置 `TRUSTED_PROXIES`。

在 Render Dashboard 执行：

```text
Manual Deploy → Deploy a specific commit → 选择 release_commit
```

等待构建和健康检查完成，并确认部署详情显示的 SHA 与 tag、GitHub Actions SHA 一致。外部端口是 Next `3000`，Go 只在容器内部监听 `8080`。

## 8. 云端冒烟和持久化复验

```bash
release_url="https://你的正式域名"

health_body="$(curl -fsS "$release_url/api/health")"
test "$health_body" = "ok"

curl -fsS "$release_url/api/settings" >/dev/null
curl -fsS -o /dev/null "$release_url/login"
```

继续人工确认：

- 域名和 HTTPS 正常。
- `/api/settings` 使用标准成功结构，且没有泄露后台渠道密钥。
- 管理员和普通用户均能登录。
- Workflow Worker 健康、没有异常积压或过期租约。
- 上传或生成一份小型服务端素材，从 Render 之外访问真实的 `https://域名/api/uploaded-assets/...`，确认返回 200。
- 不要只测试 `/uploaded-assets/...`，单端口部署应使用带 `/api` 的路径。

持久化必须同时验证数据库和文件：

1. 注册一个唯一测试用户并记录测试素材 URL/hash。
2. 执行一次 Restart Service，重新登录并读取同一素材。
3. 对同一 release commit 再执行一次 Manual Deploy，重复登录和素材读取。
4. 使用 Dreamina 时，重新运行渠道预检，确认登录态仍存在。

项目、画布和“我的素材”主要保存在当前浏览器本地。浏览器刷新后仍能看到项目，不能证明 Render 数据盘有效，也不能证明已支持跨浏览器云同步；服务端持久化必须使用注册用户、数据库记录和 `/api/uploaded-assets/...` 文件单独验证。

## 9. 回滚

发现 P0/P1 问题时：

1. 在 Render 手工选择上一个已知正常的 commit 重新部署。
2. 如果新版本已经执行数据库结构调整，只回滚镜像不够；根据上线前备份恢复数据库或执行经过审核的前向修复。
3. 已推送的版本 tag 不删除、不改指向、不强推；修复后发布新的补丁版本。
4. 在 `docs/pending-test.md` 记录失败现象、回滚 commit、数据处理和后续补验结果。

## 10. 每次上线完成后的记录

在对应版本验收记录中至少保存：

- 版本号、release commit 和 tag。
- 提交前、提交后测试结果。
- 两个 GitHub Actions URL。
- GHCR 镜像 tag 和 digest。
- Render 实际部署 SHA。
- 正式域名、健康检查和公开素材检查结果。
- Restart Service 与 Manual Deploy 后的数据库/文件持久化结果。
- 是否执行真实付费请求；如执行，记录模型、任务 ID、费用和结果。
- 已知非阻断项、放行结论和回滚 commit。

相关详细配置见：

- [部署说明](../deployment.md)
- [当前待验收事项](../pending-test.md)
- [版本变更记录](../../CHANGELOG.md)
