# 即梦 CLI 全模式生产接入实施计划

> 设计依据：[即梦 CLI 全模式生产接入设计](../specs/2026-07-18-jimeng-cli-production-design.md)

**目标：** 在不恢复 Codex CLI 执行器的前提下，让 `jimeng-cli` 渠道可在 Docker 生产镜像中运行，并从画布稳定调用文生视频、图生视频、首尾帧、多帧故事和全能参考五种模式。

**架构：** 前端保存明确的 `videoReferenceMode` 并为即梦构建 multipart 请求；Go 后端校验并暂存素材，用参数数组调用容器内官方 `dreamina`；CLI 登录态和输出目录写入现有 `/app/data` 数据卷。所有 Dreamina 子进程串行执行，生成任务仍由上游异步处理。

**技术栈：** Next.js、React、TypeScript、Zustand、Go、Gin、Docker BuildKit、Node test runner、Go testing。

## 执行结果

- 自动化完成：五种模式前端配置、multipart 请求、后端安全暂存与参数映射、任务账本、失败退款、查询下载、Dreamina HOME 隔离、Docker 多架构固定哈希安装。
- 验证完成：Go 全量测试、前端 585 项测试、TypeScript、Next 生产构建、Docker 完整构建、二次缓存构建、Compose 健康检查、容器内版本与 SHA256。
- 仍需人工：管理员正式账号网页登录，以及会消耗即梦积分的五模式最短时长真实生成。

---

## 任务 1：建立五种模式的前端配置合同

**文件：**

- 修改：`web/src/stores/use-config-store.ts`
- 修改：`web/src/app/(user)/canvas/types.ts`
- 修改：`web/src/app/(user)/canvas/utils/canvas-video-config.ts`
- 修改：`web/src/app/(user)/canvas/utils/canvas-generation-metadata.ts`
- 修改：`web/src/app/(user)/canvas/components/canvas-config-node-panel.tsx`
- 测试：`web/src/app/(user)/canvas/utils/canvas-video-config.test.mts`

- [ ] 先增加失败测试：明确模式能从节点元数据进入生成配置；没有新字段的旧节点仍按素材和图片角色推导。
- [ ] 运行对应测试并确认失败原因是 `videoReferenceMode` 尚未实现。
- [ ] 新增 `VideoReferenceMode` 联合类型、默认值、持久化和归一化逻辑。
- [ ] 将配置面板五个入口分别写入明确模式，不再把“图生视频”和“全能参考”折叠为同一个值。
- [ ] 重新运行测试并确认通过。

验证命令：

```bash
cd web && node --test --import tsx 'src/app/(user)/canvas/utils/canvas-video-config.test.mts'
```

## 任务 2：为即梦构建独立 multipart 请求

**文件：**

- 新增：`web/src/services/api/dreamina-video-payload.ts`
- 新增：`web/src/services/api/dreamina-video-payload.test.mts`
- 修改：`web/src/services/api/video.ts`

- [ ] 先增加失败测试：五种模式推导、字段名、图片角色顺序、视频/音频数量和跨域读取失败提示。
- [ ] 运行测试并确认失败。
- [ ] 实现素材转 `File`、`dreamina_mode`、公共字段和 `input_image[]` / `input_image_role[]` / `input_video[]` / `input_audio[]`。
- [ ] 在 `buildVideoPayload` 中把 `jimeng-cli` 放在通用 multipart 分支之前。
- [ ] 重新运行前端请求构建测试并确认通过。

验证命令：

```bash
cd web && node --test --import tsx src/services/api/dreamina-video-payload.test.mts
```

## 任务 3：实现后端五种模式的安全暂存与 CLI 参数映射

**文件：**

- 新增：`service/jimeng_video_request.go`
- 新增：`service/jimeng_video_request_test.go`
- 修改：`service/jimeng_cli.go`
- 修改：`service/jimeng_cli_test.go`

- [ ] 先增加失败测试：五种命令参数、首尾帧角色排序、多帧过渡参数、数量限制、MIME/扩展名校验和临时目录清理。
- [ ] 运行 `go test ./service -run Jimeng -count=1` 并确认失败。
- [ ] 使用 multipart 表单解析素材，并复制到每次请求独立的临时目录；文件名由服务端生成，不信任上传文件名。
- [ ] 实现五种模式的最小参数映射；三张以上多帧图片重复总提示词并平均分配片段时长。
- [ ] 仅允许 VIP 模型传 1080p，其他模型归一化为 720p。
- [ ] 让提交函数在 CLI 返回后清理暂存目录。
- [ ] 为所有 Dreamina 命令增加进程内互斥锁。
- [ ] 仅为 Dreamina 子进程注入 `DREAMINA_HOME` 对应的 HOME；输出目录支持 `DREAMINA_OUTPUT_DIR` 默认值。
- [ ] 重新运行 service 测试并确认通过。

验证命令：

```bash
go test ./service -run Jimeng -count=1
```

## 任务 4：打通 Handler、任务账本与失败退款

**文件：**

- 修改：`handler/ai.go`
- 修改：`handler/ai_test.go`

- [ ] 先扩展假 Dreamina CLI，使其记录参数并模拟提交、查询、下载和失败。
- [ ] 增加五种 multipart 提交测试，确认任务 ID、平台、状态和参数模式正确。
- [ ] 增加非法素材与 CLI 失败测试，确认响应结构一致且已扣额度按现有规则退回。
- [ ] 根据测试补齐 Handler 与 service 接线，保持 `{ code, data, msg }` 业务响应。
- [ ] 运行 Handler 测试并确认通过。

验证命令：

```bash
go test ./handler -run 'Jimeng|Video' -count=1
```

## 任务 5：把官方 Dreamina CLI 固化进多架构 Docker 镜像

**文件：**

- 修改：`Dockerfile`
- 修改：`docker-compose.yml`
- 修改：`docker-compose.local.yml`
- 修改：`.env.example`

- [ ] 新增独立下载阶段，根据 `TARGETARCH` 选择官方 Linux amd64/arm64 文件。
- [ ] 使用设计文档中的固定 SHA256 校验；不匹配时构建直接失败。
- [ ] 将二进制复制为 `/usr/local/bin/dreamina`，不向镜像写入任何登录凭据。
- [ ] 配置 `DREAMINA_HOME=/app/data/dreamina-home` 与 `DREAMINA_OUTPUT_DIR=/app/data/jimeng-cli`。
- [ ] 构建当前架构镜像，并在容器内运行 `dreamina version`。
- [ ] 启动实际 Compose 服务，验证健康检查、未登录预检和数据卷路径。

验证命令：

```bash
docker build -t infinite-canvas:jimeng-local .
docker run --rm infinite-canvas:jimeng-local dreamina version
docker compose -f docker-compose.local.yml up -d --build
docker compose -f docker-compose.local.yml ps
```

## 任务 6：发布前全量验证与文档收口

**文件：**

- 修改：`docs/system-settings.md`
- 修改：`docs/deployment.md`
- 修改：`docs/pending-test.md`
- 修改：`docs/todo.md`
- 修改：`CHANGELOG.md`

- [ ] 更新即梦渠道配置、Docker 登录态持久化、五种模式限制和未付费冒烟说明。
- [ ] 把已完成事项从 todo 移到 pending-test；未执行的真实付费生成保留为待用户验收项。
- [ ] 运行 Go 全量测试。
- [ ] 运行前端测试、TypeScript 检查和 Next 生产构建。
- [ ] 运行 Docker 构建与容器健康检查，确认 `dreamina version` 可用。
- [ ] 检查 Git 差异，只保留本任务文件，不覆盖用户已有改动。
- [ ] 不自动执行会消耗即梦积分的真实生成；最终交付五种最短付费冒烟清单。

验证命令：

```bash
go test ./... -count=1
cd web && npm test
cd web && npm run typecheck
cd web && npm run build
docker build -t infinite-canvas:jimeng-local .
```

## 完成标准

- [ ] Docker 镜像内官方 Dreamina CLI 通过固定哈希校验并可执行。
- [ ] 登录态和输出目录随 `/app/data` 持久化。
- [ ] 五种前端模式不会误折叠，旧节点仍能推导。
- [ ] 五种 multipart 提交、CLI 参数、查询、下载、错误退款均有自动化测试。
- [ ] Codex CLI 入口仍保持“云端执行器尚未启用”，没有被此次变更重新开放。
- [ ] 全量测试、生产构建和 Docker 健康检查通过。
- [ ] 真实付费生成明确标记为人工确认项，不静默扣费。
