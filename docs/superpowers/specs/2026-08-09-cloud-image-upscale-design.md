# 云端图片超分设计

## 目标

在网页版画布中为已有图片节点增加真实的云端图片超分能力。首个服务商使用阿里云视觉智能开放平台 `MakeSuperResolutionImage`，支持 2× 和 4×。原节点保持不变，成功结果作为右侧派生图片节点加入画布、建立来源连线，并归档到“资产”。

本功能不是浏览器或用户电脑本地计算。源图片会上传到应用后端，再由后端上传到阿里云临时 OSS 并提交给阿里云处理；结果会下载回应用后端并由浏览器保存到本地图片存储。

## 已确认范围

- 默认服务商：阿里云 `MakeSuperResolutionImage`。
- 倍率：2×、4×。
- 输入：画布中已有内容的图片节点。
- 输出：保留源节点，创建右侧子图片节点并连接 `源节点 → 超分节点`。
- 任务：显示排队、处理中、下载结果、完成或失败进度；支持失败重试；刷新页面后继续查询已有任务。
- 持久化：服务端保存任务状态和结果文件；浏览器把完成图片保存到 localforage，并自动归档到“资产”。
- 安全：AccessKey 只从后端环境变量读取，不通过设置接口或前端响应返回。
- 扩展：业务层依赖统一 Provider 接口，未来可增加 fal Topaz、fal SeedVR2 或 Replicate，而不改画布动作协议。

## 不在本期范围

- 不接入旧的 macOS 本地超分助手。
- 不做批量超分、局部修复、降噪强度或多模型对比。
- 不在开发或自动测试中发起真实付费推理。
- 不把浏览器本地“资产”描述为云同步。
- 不实现服务商账单、额度充值或应用内扣费。

## 用户交互

图片节点存在内容时，悬浮工具栏和右侧检查器显示“超分”动作。点击后打开轻量弹窗：

- 选择 2× 或 4×，默认 2×。
- 显示原始尺寸与预估输出尺寸。
- 明确提示“图片将上传到云端服务处理”。
- 提交后立即在源节点右侧创建一个加载中的派生节点并连线。

派生节点使用现有图片节点的加载、错误和重试视觉。任务元数据记录在节点中，进度变化随轮询更新。成功后替换为实际图片，保持原图宽高比，自动保存到浏览器图片存储并尝试归档到“资产”。资产归档失败不删除结果节点，只提示用户稍后手动保存。

失败节点保留错误信息和任务坐标。点击“重试”调用服务端重试接口，沿用同一节点和任务 ID，不创建重复派生节点。普通图片生成的失败重试行为保持不变。

## 服务端 API

接口位于已鉴权的 `/api/v1/image-upscale`：

### `GET /capabilities`

返回服务端是否已配置、默认服务商、支持倍率、输入限制和 `cloudProcessing: true`。不返回 AccessKey、Endpoint 内部凭据或 OSS 临时信息。

### `POST /jobs`

使用 multipart/form-data：

- `file`：源图片二进制。
- `scale`：`2` 或 `4`。
- `projectId`、`canvasId`、`sourceNodeId`、`sourceAssetId`：追溯坐标，其中后两项允许为空。

后端验证并私有保存输入文件，创建任务记录，再异步执行。响应立即返回任务投影。

### `GET /jobs/:id`

只允许任务所有者读取。返回状态、进度、倍率、输入/输出尺寸、结果 URL、错误、服务商请求 ID 和时间信息。

### `POST /jobs/:id/retry`

只允许任务所有者重试失败任务。服务端复用已保存的输入文件，清除旧错误、增加 attempt 并重新异步执行。排队或运行中的任务拒绝重复提交。

所有接口继续使用 `{ code, data, msg }`。

## 任务状态与恢复

数据库新增 `image_upscale_jobs`。状态为：

- `queued`：输入已保存，等待执行，进度 5。
- `processing`：正在上传并调用服务商，进度 25。
- `downloading`：服务商已返回，正在下载并持久化结果，进度 75。
- `succeeded`：结果可访问，进度 100。
- `failed`：保留错误码和用户可读错误，可重试。

任务写入数据库后才启动 goroutine。浏览器刷新时，从已经保存在画布节点中的 job ID 恢复轮询。后端进程意外退出后，旧的 `queued`、`processing`、`downloading` 任务不会被错误标记为成功；服务启动时把这些无租约任务标记为可重试的 `failed`，用户可从原节点重试。首版不实现跨实例任务队列。

## Provider 边界

`ImageUpscaleProvider` 只接收标准化请求和 `io.Reader`，返回：

- 服务商名称、模型/策略；
- 服务商 request ID；
- 临时结果 URL。

业务层负责输入验证、任务状态、下载、结果持久化和错误清洗。阿里云适配器只负责 SDK 配置和调用。

阿里云 Go SDK v3 的 `MakeSuperResolutionImageAdvance` 接受 `UrlObject io.Reader`，SDK 内部调用 `AuthorizeFileUpload`、上传到临时 OSS，再调用超分 API。因此首版不要求应用服务器具备公网可访问的输入 URL，也不需要自行实现 OSS 签名。

阿里云请求参数：

- `Mode=base`
- `UpscaleFactor=2|4`
- `OutputFormat=png`
- `OutputQuality=95`

## 输入与结果文件

按阿里云限制执行前置验证：

- 最大 5 MB。
- 支持 JPEG、PNG、BMP、WebP、HEIC；无法由 Go 标准解码器确认尺寸的 HEIC 在首版给出明确不支持提示，避免提交后才计费失败。
- 长边不超过 1920，短边不超过 1080。
- 输入必须是可解码的图片且尺寸大于零。

输入文件保存在 `IMAGE_UPSCALE_WORK_DIR`（默认 `data/image-upscale`）的用户哈希目录中，不放在 `/api/uploaded-assets` 公共目录。结果下载后写入 `PUBLIC_ASSET_DIR/image-upscale/<job-id>.<ext>`，前端只得到相对结果 URL。任务完成或失败后暂时保留输入以支持重试；后续如需自动清理，另加独立保留策略。

下载结果时执行现有运行时媒体相同的公网 URL 和重定向检查，限制响应大小，确认 MIME 确为图片，避免服务商响应被利用进行 SSRF 或写入任意内容。

## 数据模型

`ImageUpscaleJob` 记录：

- 身份与所有权：`id`、`user_id`。
- 追溯：`project_id`、`canvas_id`、`source_node_id`、`source_asset_id`。
- 请求：`provider`、`scale`、`input_width`、`input_height`、`input_mime_type`、`input_bytes`、私有 `input_path`、`attempt`。
- 运行：`status`、`progress`、`provider_request_id`、`model`、`strategy`、`error_code`、`error_message`。
- 结果：`result_url`、`result_mime_type`、`result_bytes`、`output_width`、`output_height`。
- 审计：`cloud_processing=true`、`created_at`、`started_at`、`completed_at`、`updated_at`。

API DTO 不返回 `user_id` 和 `input_path`。

## 画布元数据

派生节点的 `metadata.imageUpscale` 记录：

- `jobId`、`provider`、`providerRequestId`；
- `scale`、`status`、`progress`、`attempt`；
- `sourceNodeId`、`sourceAssetId`；
- `inputWidth`、`inputHeight`、`outputWidth`、`outputHeight`；
- `model`、`strategy`、`cloudProcessing`；
- `startedAt`、`completedAt`、`durationMs`、`errorCode`。

节点仍使用既有 `metadata.status` 和 `metadata.errorDetails` 驱动通用视觉。任务专有元数据只用于恢复、审计和详情展示。

## 错误处理

- 未配置 AccessKey：弹窗可打开，但提交返回“服务端尚未配置图片超分”。
- 输入超限或尺寸不支持：在创建任务前失败，不调用服务商。
- 阿里云错误：服务端日志保留诊断，前端只显示清洗后的错误；request ID 可以返回用于排查。
- 结果下载失败：任务失败且可重试，不暴露服务商临时签名 URL。
- 浏览器本地保存失败：服务端任务仍成功，节点显示可重试的本地落盘提示；重新查询任务可再次下载结果。
- 资产归档失败：保留节点和 localforage 文件，提示“超分已完成，归档到资产失败”。

## 测试策略

- Go 单元测试覆盖输入限制、状态转换、所有权、重试、服务商错误清洗、结果下载与持久化；Provider 和结果服务器均使用本地假实现，不调用真实阿里云。
- Handler 测试覆盖鉴权、multipart 参数、读取和重试响应。
- 前端纯函数测试覆盖派生节点布局、任务到节点元数据转换、终态判断。
- 前端服务测试覆盖 multipart 字段和路由契约。
- 接线测试覆盖工具栏、检查器、弹窗和刷新恢复 hook 已装配。

## 配置

新增环境变量：

- `IMAGE_UPSCALE_PROVIDER=aliyun`
- `IMAGE_UPSCALE_WORK_DIR=data/image-upscale`
- `ALIBABA_CLOUD_ACCESS_KEY_ID`
- `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
- `ALIBABA_CLOUD_SECURITY_TOKEN`（可选，供 STS 凭据）

AccessKey 应只通过部署平台的 secret/环境变量注入，不写入 Git、浏览器 localStorage、设置表或日志。

## 文档与验收

实现完成后：

- 更新 `.env.example`、`docs/backend-database.md`、`docs/todo.md` 和 `docs/pending-test.md`。
- `docs/features.md` 等用户确认测试通过后再更新。
- 待测文档必须使用“资产”，不能写“我的素材”。
- 人工验收需要用户自行配置阿里云凭据后执行；开发自动验证不产生真实调用和费用。
