# M10 云端资产与协作方案

本文档冻结 M10 云端资产与协作的技术边界。当前版本只完成方案设计，不代表这些表、接口或对象存储能力已经实现；数据库现状仍以 `docs/backend-database.md` 为准。

## 目标

M10 的目标是把当前“我的素材”和“项目共享资产库”的本地 metadata 能力，逐步升级为可被项目成员共享、可审计、可版本锁定、可跨设备访问的云端资产体系。

核心原则：

- 本地素材继续可用，不强制迁移。
- 云端项目资产必须有明确权限、版本和活动记录。
- 大文件进入对象存储，数据库只保存元数据和对象 key。
- 画布、分镜、设定库继续支持固定版本引用，不静默跟随最新版。
- 本地 `storageKey` 与云端 `fileId` 双轨并存，迁移过程可逐步发生。
- 不在缺少引用计数、权限校验和冲突策略时物理删除云端对象。

## 阶段拆分

### M10.1：云端文件表与对象存储底座

范围：

- 新增云端文件元数据表 `files`。
- 增加对象存储抽象和上传会话。
- 支持服务端签发上传 URL、下载 URL。
- 后端只保存 provider、bucket、objectKey、mimeType、bytes、checksum 等元数据。
- 文件本身写入对象存储，不写入数据库，不写入画布 JSON。

验收重点：

- 上传图片、视频、音频后，数据库只保存文件元数据。
- 非授权用户不能获取签名下载 URL。
- 前端可用签名 URL 预览云端文件。
- 删除只做软删除或引用解除，不做无引用计数的物理删除。

### M10.2：项目共享资产库云端版

范围：

- 新增项目资产、项目资产版本、项目资产文件夹、项目成员和活动记录。
- 项目资产支持图片、视频、音频、文本等类型。
- 项目资产版本绑定 `fileId`，引用方可锁定 `projectAssetVersionId`。
- 前端素材页支持本地素材、项目资产库、全部三类来源。
- 从项目资产库插入画布、分镜、设定库时写入 `projectAssetId / projectAssetVersionId / fileId`。

验收重点：

- 同一项目成员能看到同一套云端项目资产。
- 非项目成员不能访问资产列表、详情、文件签名 URL。
- 画布引用项目资产后能稳定预览，并保持版本锁定。
- 生成结果可以显式归档到项目资产库，但不会绕过用户确认。

### M10.3：云同步与冲突策略

范围：

- 定义本地画布、剧本、分镜、设定库、素材 metadata 与云端版本的同步状态。
- 增加 `syncStatus`、远端版本号、更新时间和冲突摘要。
- 冲突时提示用户选择保留本地、使用云端或另存副本。
- 大文件仍只通过 `fileId` / `storageKey` 引用，不写入同步 JSON。

验收重点：

- 旧本地项目不迁移也能继续打开。
- 已加入云端项目的资产可跨设备访问。
- 本地和云端同时修改时不会静默覆盖。
- 冲突记录可追溯，用户能选择解决策略。

## 后端表设计草案

以下为 M10 规划表，不是当前数据库现状。实际实现时需同步更新 `docs/backend-database.md`。

### files

云端文件元数据表。每个文件版本对应一个对象存储对象。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 主键 |
| `owner_user_id` | string | 上传者用户 ID |
| `provider` | string | 对象存储供应商，例如 `s3`、`tos`、`cos`、`local` |
| `bucket` | string | Bucket 名称 |
| `object_key` | string | 对象存储 key |
| `original_name` | string | 原始文件名 |
| `mime_type` | string | MIME 类型 |
| `extension` | string | 文件扩展名 |
| `bytes` | number | 文件大小 |
| `checksum` | string | 文件校验值，优先 SHA-256 |
| `checksum_algorithm` | string | 校验算法，例如 `sha256` |
| `visibility` | string | 可见性：`private`、`project`、`public` |
| `status` | string | 状态：`uploading`、`active`、`failed`、`deleted` |
| `metadata_json` | text | 脱敏后的媒体元数据，例如宽高、时长、封面 key |
| `created_at` | string | 创建时间 |
| `updated_at` | string | 更新时间 |
| `deleted_at` | string | 软删除时间 |

约束：

- `object_key` 在同一 `provider + bucket` 内唯一。
- 文件内容不进入数据库。
- API 响应不长期返回永久公网 URL，只返回短期签名 URL。

### project_assets

项目资产主表。表示项目中可被成员引用的资产身份，不直接等于某个文件版本。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 主键 |
| `project_id` | string | 项目 ID |
| `folder_id` | string | 文件夹 ID，可为空 |
| `title` | string | 资产标题 |
| `kind` | string | 类型：`image`、`video`、`audio`、`text`、`document` |
| `description` | text | 描述 |
| `tags_json` | text | 标签数组 |
| `current_version_id` | string | 当前版本 ID |
| `cover_file_id` | string | 封面文件 ID，可为空 |
| `source` | string | 来源：`upload`、`canvas_generation`、`import_local`、`manual` |
| `created_by` | string | 创建者用户 ID |
| `updated_by` | string | 最近更新者用户 ID |
| `status` | string | 状态：`active`、`archived`、`deleted` |
| `metadata_json` | text | 脱敏后的扩展 metadata |
| `created_at` | string | 创建时间 |
| `updated_at` | string | 更新时间 |
| `deleted_at` | string | 软删除时间 |

约束：

- 项目资产删除默认软删除，不物理删除文件。
- `current_version_id` 只能指向同一个 `project_asset_id` 下的版本。

### project_asset_versions

项目资产版本表。每个版本绑定一个 `fileId` 或文本内容快照。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 主键 |
| `project_asset_id` | string | 项目资产 ID |
| `project_id` | string | 冗余项目 ID，便于权限过滤 |
| `version_number` | number | 版本号，从 1 递增 |
| `file_id` | string | 文件 ID，文本资产可为空 |
| `content_text` | text | 文本资产内容，可为空 |
| `mime_type` | string | MIME 类型 |
| `bytes` | number | 文件大小 |
| `checksum` | string | 文件校验值 |
| `change_note` | text | 版本说明 |
| `created_by` | string | 创建者用户 ID |
| `metadata_json` | text | 版本扩展信息，例如生成参数、模型、taskId |
| `created_at` | string | 创建时间 |

约束：

- 同一 `project_asset_id` 下 `version_number` 唯一。
- 画布、分镜、设定库默认引用具体版本，不自动跟随 `current_version_id`。

### project_asset_folders

项目资产文件夹表。第一版只做树形分组，不做复杂权限继承。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 主键 |
| `project_id` | string | 项目 ID |
| `parent_id` | string | 父文件夹 ID，可为空 |
| `name` | string | 文件夹名称 |
| `order` | number | 排序 |
| `created_by` | string | 创建者用户 ID |
| `created_at` | string | 创建时间 |
| `updated_at` | string | 更新时间 |
| `deleted_at` | string | 软删除时间 |

约束：

- 同一父级下文件夹名称不建议重复。
- 删除文件夹前需确认资产移动、归档或阻止删除策略。

### project_members

项目成员与权限表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 主键 |
| `project_id` | string | 项目 ID |
| `user_id` | string | 用户 ID |
| `role` | string | 权限：`owner`、`admin`、`editor`、`viewer` |
| `status` | string | 状态：`active`、`invited`、`removed` |
| `invited_by` | string | 邀请者用户 ID |
| `created_at` | string | 创建时间 |
| `updated_at` | string | 更新时间 |

约束：

- 同一 `project_id + user_id` 唯一。
- 每个项目至少保留一个 `owner`。

### project_asset_activities

项目资产活动记录表，用于审计上传、改名、移动、创建版本、更新引用、归档等动作。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 主键 |
| `project_id` | string | 项目 ID |
| `project_asset_id` | string | 项目资产 ID，可为空 |
| `project_asset_version_id` | string | 项目资产版本 ID，可为空 |
| `actor_user_id` | string | 操作者用户 ID |
| `action` | string | 动作：`create`、`upload_version`、`rename`、`move`、`tag`、`archive`、`restore`、`reference_update` |
| `before_json` | text | 脱敏前状态快照 |
| `after_json` | text | 脱敏后状态快照 |
| `created_at` | string | 创建时间 |

约束：

- 不保存 API Key、token、secret、base64、`data:`、`blob:` 或大文件内容。
- 引用更新类活动记录影响对象 ID 和版本 ID，便于回溯。

## 对象存储抽象

后端通过统一 `ObjectStorage` 接口屏蔽不同 provider：

```ts
type CloudObjectRef = {
  provider: string;
  bucket: string;
  objectKey: string;
  mimeType: string;
  bytes: number;
  checksum: string;
};
```

核心能力：

- `CreateUploadSession(input)`：创建上传会话，返回上传地址、headers、过期时间和 file draft。
- `CompleteUploadSession(input)`：校验上传结果，计算或确认 checksum，标记 `files.status = active`。
- `GetSignedURL(fileId, purpose)`：为预览、下载、转码或上游提交生成短期签名 URL。
- `DeleteObject(fileId)`：仅在引用计数安全、软删除期结束、管理员确认后物理删除。

### upload session

上传会话建议独立为内存态或数据库表，第一版可按实现成本选择。字段草案：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 上传会话 ID |
| `file_id` | string | 预创建文件 ID |
| `project_id` | string | 项目 ID，可为空 |
| `provider` | string | 对象存储 provider |
| `bucket` | string | Bucket |
| `object_key` | string | Object key |
| `mime_type` | string | MIME 类型 |
| `bytes` | number | 预期大小 |
| `checksum` | string | 预期 SHA-256，可为空 |
| `status` | string | `created`、`uploaded`、`completed`、`expired`、`failed` |
| `expires_at` | string | 过期时间 |
| `created_by` | string | 创建用户 |

边界：

- 签名 URL 必须短期有效。
- 上传完成后必须校验大小和 checksum，至少校验其中一项。
- 不把对象存储密钥下发给前端。
- 上游 AI 平台需要公网可访问素材时，后端生成短期签名 URL 或受控公网代理，不暴露永久私有对象地址。

## 本地与云端双轨字段

前端本地素材、画布节点、分镜引用、设定库绑定和 Brief 结果需要逐步支持以下字段：

| 字段 | 说明 |
| --- | --- |
| `storageKey` | 当前本地 localforage Blob key，继续用于个人本地版和离线缓存 |
| `fileId` | 云端 `files.id`，用于获取签名 URL 和跨设备访问 |
| `projectAssetId` | 云端项目资产 ID，表示资产身份 |
| `projectAssetVersionId` | 云端项目资产版本 ID，表示固定版本引用 |
| `syncStatus` | 同步状态：`local_only`、`uploading`、`synced`、`conflict`、`failed`、`remote_only` |

建议引用结构：

```ts
type AssetCloudReference = {
  assetId?: string;
  storageKey?: string;
  fileId?: string;
  projectAssetId?: string;
  projectAssetVersionId?: string;
  versionNumber?: number;
  syncStatus?: "local_only" | "uploading" | "synced" | "conflict" | "failed" | "remote_only";
  lockedAt?: string;
  updatedAt?: string;
};
```

双轨规则：

- 仅本地素材：有 `storageKey`，无 `fileId`。
- 已上传但未加入项目库：有 `storageKey + fileId`，无 `projectAssetId`。
- 项目资产库素材：有 `fileId + projectAssetId + projectAssetVersionId`，可选本地缓存 `storageKey`。
- 固定版本引用默认使用 `projectAssetVersionId`，不因 `current_version_id` 改变而自动变化。
- 本地缓存丢失时，只要有 `fileId` 且用户有权限，就可以重新拉取。

## 权限模型

项目成员角色：

| 角色 | 能力 |
| --- | --- |
| `owner` | 项目所有者。可管理成员、删除项目、转移所有权、管理所有资产和版本 |
| `admin` | 可管理成员以外的大部分项目内容，包含资产、文件夹、版本、活动审核 |
| `editor` | 可上传资产、创建版本、编辑 metadata、引用项目资产到画布 / 分镜 / 设定库 |
| `viewer` | 只读项目资产、预览和下载被允许的文件，不能写入资产或版本 |

权限规则：

- 文件签名 URL 必须先校验项目成员权限。
- `viewer` 不能创建上传会话、不能创建版本、不能更新引用。
- `editor` 不能删除项目、不能移除成员、不能物理删除文件。
- `admin` 不能移除最后一个 `owner`。
- 资产活动记录对项目成员可见，但敏感字段必须脱敏。
- 管理后台可做跨项目审计，但仍不能展示对象存储密钥或供应商私钥。

## 迁移策略

### 本地素材加入项目资产库

1. 用户在“我的素材”或项目素材视图中选择本地素材。
2. 前端读取本地 Blob，计算 SHA-256；如果素材已有 fingerprint，优先复用。
3. 后端创建上传会话，前端上传到对象存储。
4. 后端校验完成后创建 `files` 记录。
5. 用户确认加入项目资产库后创建 `project_assets` 和首个 `project_asset_versions`。
6. 本地素材 metadata 追加 `fileId / projectAssetId / projectAssetVersionId / syncStatus=synced`。
7. 原 `storageKey` 保留为本地缓存，不删除。

### 画布节点从 storageKey 过渡到 fileId

1. 旧画布节点继续使用 `storageKey` 渲染，不强制迁移。
2. 当用户把节点素材加入项目资产库后，节点 metadata 增加云端引用字段。
3. 渲染优先级建议为：本地 `storageKey` 缓存可用时优先本地；本地缺失但有 `fileId` 时请求签名 URL。
4. 插入项目资产库素材到画布时，默认写入固定版本 `projectAssetVersionId`。
5. 更新到最新版必须走显式确认，沿用 M7.2.3 的影响对象预览。

### 旧本地项目继续可用

- 旧项目没有 `projectAssetId / fileId / syncStatus` 时，按纯本地项目处理。
- 旧素材只有 `storageKey` 时，不提示错误，只在云端功能入口提示“可加入项目资产库”。
- 旧画布、分镜、设定库不会在打开时自动上传。
- 首次云端同步必须有用户确认，并展示需要上传的素材数量、大小和风险。

## 第一版不做事项

- 不做实时多人协同。
- 不自动迁移所有本地素材。
- 不在没有引用计数前物理删除云端对象。
- 不静默覆盖本地或远端数据。
- 不把对象存储密钥下发给前端。
- 不把 base64、Blob URL、大文件内容写入数据库 JSON。
- 不在 M10.1 中一次性重做画布、分镜、剧本、设定库全部云同步。
- 不绕过项目成员权限生成文件签名 URL。

## 验收标准

### M10.0 方案验收

- `docs/cloud-assets-plan.md` 明确 M10.1、M10.2、M10.3 阶段边界。
- 表设计草案覆盖 `files`、`project_assets`、`project_asset_versions`、`project_asset_folders`、`project_members`、`project_asset_activities`。
- 对象存储抽象明确 provider、bucket、objectKey、mimeType、bytes、checksum、signedUrl 和 upload session。
- 本地与云端双轨字段明确 `storageKey / fileId / projectAssetId / projectAssetVersionId / syncStatus`。
- 权限模型明确 owner、admin、editor、viewer。
- 迁移策略明确本地素材入库、画布节点过渡和旧项目兼容。
- 第一版不做事项清楚，后续实现不能越界。

### M10 实现验收方向

- 云端文件不泄露真实对象存储密钥。
- 项目资产版本引用可锁定、可更新、可追溯。
- 项目成员权限能限制列表、详情、签名 URL、上传和版本写入。
- 本地素材与云端项目资产可以共存。
- 同步冲突不静默覆盖。

## 风险点

- 对象存储签名 URL 过期策略不当，可能导致素材预览失效或长期暴露。
- 大文件上传失败后如果没有 upload session 清理，会产生孤儿对象或半完成文件。
- 本地 `storageKey` 与云端 `fileId` 同时存在时，如果优先级不清楚，可能展示旧文件。
- 项目资产版本锁定如果实现不严，可能破坏已生成分镜和画布历史结果。
- 没有引用计数前物理删除对象，可能让旧画布、旧分镜或旧素材版本失效。
- 权限过滤如果只在前端做，签名 URL 和资产详情会被越权访问。
- 自动迁移本地素材会带来存储成本、隐私和重复上传风险，必须保持显式确认。

## 后续实现顺序

1. 先做 M10.1，建立 `files` 和对象存储底座，只解决文件上传、签名预览和权限校验。
2. 再做 M10.2，把项目资产库云端化，并接入版本锁定引用。
3. 最后做 M10.3，处理本地 JSON 与云端状态同步和冲突。

任何阶段如果需要改变已有 localforage key、引入后端表结构迁移、调整权限体系或触发自动上传，都需要单独评审后再实施。
