# 即梦 CLI 全模式生产接入设计

## 目标

让现有 `jimeng-cli` 渠道在 Docker 生产部署中真正可用，并通过同一画布视频生成入口开放以下五种即梦视频模式：

- 文生视频：`text2video`
- 图生视频：`image2video`
- 首尾帧：`frames2video`
- 多帧故事：`multiframe2video`
- 全能参考：`multimodal2video`

即梦 CLI 只承担视频模型渠道执行，不恢复或替代已经关闭的 Codex CLI / 原视频工作流本地 Runner。

## 方案选择

采用“同容器安装、后端受控调用、数据卷持久化登录态”的方式。

不采用独立 Worker：当前应用仍是单容器部署，引入队列服务和内部 RPC 会扩大上线范围。不采用宿主机二进制挂载：宿主路径和 CPU 架构不稳定，无法形成可复现镜像。

## Docker 与供应链

Docker 构建根据 BuildKit `TARGETARCH` 下载即梦官方 Linux 二进制：

- arm64 SHA256：`916e70bb2efb7de23ca4d1e1703411ae2e29fa1e26cecf4c397ff16414fe6eb7`
- amd64 SHA256：`1b82dcdcc5fe608830010d2a235810d68cff8e1ab3ed6c55fb5166b28fcb91db`

下载来源由官方安装脚本 `https://jimeng.jianying.com/cli` 指向的字节 CDN 提供。镜像构建必须校验 SHA256；官方文件发生变化时构建失败，由维护者确认新版后更新哈希，不能静默使用浮动二进制。

运行镜像把二进制安装为 `/usr/local/bin/dreamina`。账号凭据不得进入镜像层，也不得进入 Git。

## 登录态与持久化

新增环境变量：

```dotenv
DREAMINA_HOME=/app/data/dreamina-home
DREAMINA_OUTPUT_DIR=/app/data/jimeng-cli
```

Go 后端调用 CLI 时只为子进程覆盖 `HOME`，不改变 Go、Next 或容器其他进程的 HOME。即梦登录态、任务数据库与日志因此落在 `/app/data/dreamina-home/.dreamina_cli`，随现有 `/app/data` 数据卷持久化。

现有管理员网页登录流程继续使用：后台执行 `dreamina login --headless` 返回验证链接、用户码和设备码，用户授权后执行 `dreamina login checklogin`。预检依次验证二进制、版本、输出目录、登录态和余额。

## 前端模式合同

新增稳定字段 `videoReferenceMode`：

```ts
type VideoReferenceMode =
    | "auto"
    | "text2video"
    | "image2video"
    | "frames2video"
    | "multiframe2video"
    | "multimodal2video";
```

画布节点保存该字段，不能再把“全能参考”和“图片参考”都折叠成同一个 `videoReferenceImageMode=reference`。旧节点没有该字段时按素材和图片角色推导：无素材为文生视频，首尾帧角色为首尾帧，单张首帧为图生视频，包含视频或音频为全能参考，多张普通图片保持全能参考，避免改变旧结果。

画布视频配置节点展示五个明确入口：文生视频、图生视频、首尾帧、多帧故事、全能参考。切换模式只更新节点配置，不自动发起扣费任务。

## 素材传输

前端为 `jimeng-cli` 单独构建 multipart 请求：

- 公共字段：模型、提示词、时长、比例、清晰度、`dreamina_mode`。
- 图片：`input_image[]`，同时提交 `input_image_role[]`。
- 视频：`input_video[]`。
- 音频：`input_audio[]`。

浏览器本地素材和应用内素材先解析为 `File`。无法由浏览器读取的跨域远程素材必须提示用户先导入素材库，不允许后端接收任意 URL 后下载，避免 SSRF。

后端将 multipart 文件写到每次请求独立的临时目录，使用 `exec.CommandContext` 参数数组调用 CLI，不经过 shell。CLI 完成上传并返回提交结果后立即删除临时目录。

当前请求总大小沿用 100MB 上限。文件数量限制：

- 图生视频：恰好 1 张图片。
- 首尾帧：恰好 2 张图片。
- 多帧故事：2–20 张图片，不允许视频或音频。
- 全能参考：最多 9 张图片、3 个视频、3 个音频，且至少包含图片或视频。

后端校验 MIME、扩展名、数量和模式组合；错误发生在扣费后的上游提交阶段时，沿用现有任务失败与额度退款逻辑。

## CLI 参数映射

### 文生视频

传递提示词、模型、4–15 秒、比例、分辨率、会话和 `--poll=0`。

### 图生视频

传递第一帧本地路径、提示词、模型、时长、分辨率、会话和 `--poll=0`。比例由输入图片推导，不传 `--ratio`。

### 首尾帧

按图片角色或顺序传递 `--first` 与 `--last`，并传递提示词、模型、时长、分辨率、会话和 `--poll=0`。

### 多帧故事

传递 2–20 个本地图片路径。两张图片使用单一 `--prompt` 和 `--duration`；三张以上为每个过渡段重复总提示词，并把总时长平均分配到 N-1 个片段，每段限制在 0.5–8 秒。该命令不支持模型与分辨率覆盖，因此后台模型名只用于渠道路由、计费和审计，CLI 使用自身多帧默认模型。

### 全能参考

按素材类型重复传递 `--image`、`--video`、`--audio`，并传递提示词、模型、4–15 秒、比例、分辨率、会话和 `--poll=0`。

只有 `seedance2.0_vip` 允许 1080p；其他 Seedance 2.0 模型强制使用 720p。所有命令参数以镜像内 `dreamina <command> -h` 为最终约束。

## 并发与安全

第一版对本进程内所有 Dreamina CLI 命令串行加锁，保护共享 OAuth 状态和 CLI 本地任务数据库。视频上游生成本身是异步任务，锁只覆盖登录、预检、素材上传提交、查询和下载命令，不等待上游生成完成。

管理员登录接口仍受管理员鉴权保护。普通用户只能通过统一 `/api/v1/videos` 创建任务，不能传入 CLI 路径、工作目录或任意命令。

CLI stderr 只返回可操作错误，不记录 OAuth 凭据。`AigcComplianceConfirmationRequired` 原样转成可理解提示，引导管理员先在即梦网页完成一次性授权。

## 验证计划

自动化测试：

- Go：五种模式参数、素材数量、角色排序、模型分辨率、临时文件清理、Dreamina HOME 注入。
- Handler：使用假 CLI 覆盖五种 multipart 提交、查询、下载、失败退款。
- 前端：五种模式持久化、旧节点推导、multipart 文件与角色映射、跨模式错误。
- 全量：`go test ./... -count=1`、`npm test`、TypeScript、Next 生产构建。

Docker 验收：

- 构建当前架构生产镜像并验证 SHA256 校验生效。
- 容器内 `dreamina version` 成功。
- 未登录时预检明确提示登录，不崩溃、不扣费。
- 后台设备码登录后重启容器，`dreamina user_credit` 仍成功，证明登录态持久化。

真实生成会消耗即梦积分。自动化和登录验收完成后，分别用最短时长运行五种模式的小素材冒烟测试；每个任务记录命令模式、任务 ID、最终状态和额度变化。用户已授权连续实施，但没有授权静默消耗积分，因此真实付费提交前仍只报告待执行清单，不自动提交。

## 上线判定

以下条件全部满足才标记即梦渠道可开放：

1. Docker 镜像包含通过哈希校验的官方 CLI。
2. 登录态在容器重建后仍可复用。
3. 五种模式均通过参数与 Handler 自动化测试。
4. 前端模式不会折叠或误路由。
5. 全量测试、生产构建和 Docker 健康检查通过。
6. 管理员完成真实账号登录，并明确执行至少一次付费冒烟；付费冒烟未执行前，后台应保留“待真实生成验证”的运维说明。
