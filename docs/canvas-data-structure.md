# 画布数据结构

本文档说明当前画布在前端本地保存的数据结构、图片文件的存储和清理方式，以及后续接入后端存储时建议保持的兼容边界。

## 当前存储位置

当前画布项目主要保存在浏览器本地：

- 画布项目 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:canvas_store`。
- 创作项目 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:creative_project_store`。
- 我的素材 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:asset_store`。
- 项目设定库 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:production_bible_store`。
- 项目剧本 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:script_store`。
- 项目分镜 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:storyboard_store`。
- 本地生成队列 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:generation_queue_store`。
- 图片 Blob：单独存到 `localForage` 实例，数据库名 `infinite-canvas`，storeName `image_files`。
- 视频等媒体 Blob：单独存到 `localForage` 实例，数据库名 `infinite-canvas`，storeName `media_files`。

画布 JSON 不直接长期保存大体积 base64 图片或视频。图片节点、视频节点、助手图片和素材媒体只保存展示 URL、`storageKey` 和元信息，真实 Blob 通过 `storageKey` 读取。

## 创作项目结构

创作项目是 M5.3.5 新增的一级工作台入口，用于把多个画布、剧本、分镜、设定库、素材和队列收束到同一个项目上下文中。本地保存为 `CreativeProject`：

```ts
type CreativeProject = {
  id: string;
  title: string;
  description: string;
  status: "active" | "archived";
  preset?: CanvasProjectPreset;
  coverAssetId?: string;
  canvasIds: string[];
  createdAt: string;
  updatedAt: string;
};
```

字段说明：

- `id`：创作项目 ID，当前前端生成。
- `title` / `description`：项目名称和说明。
- `status`：项目状态，第一版支持活跃和归档；删除项目只删除项目入口和关联关系，不删除画布、素材、剧本或分镜数据。
- `preset`：项目默认创作预设。从项目详情新建画布时会传递给 `CanvasProject.preset`。
- `coverAssetId`：预留项目封面素材 ID，第一版暂不强制使用。
- `canvasIds`：项目关联的画布 ID 列表。画布自身也会写入可选 `projectId`，两侧任一处存在关联都可被识别。

旧画布没有 `projectId` 时仍可直接从 `/canvas/:id` 打开；项目工作台会展示“未归档项目”提示，项目详情提供轻量绑定入口，可把旧画布绑定到某个创作项目。

## 画布项目结构

每个画布项目是一个 `CanvasProject`：

```ts
type CanvasProject = {
  id: string;
  projectId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  chatSessions: CanvasAssistantSession[];
  activeChatId: string | null;
  backgroundMode: "lines" | "dots" | "blank";
  showImageInfo: boolean;
  viewport: { x: number; y: number; k: number };
  preset?: CanvasProjectPreset;
};

type CanvasProjectPreset = {
  resolution?: string;
  ratio?: string;
  fps?: string;
  defaultDuration?: string;
  defaultImageModel?: string;
  defaultVideoModel?: string;
  defaultTextModel?: string;
  defaultVideoProvider?: "openai" | "volcengine-ark";
};
```

字段说明：

- `id`：画布项目 ID，当前前端生成。
- `projectId`：可选的创作项目 ID。新建画布会写入该字段；旧画布没有该字段时继续按画布自身 ID 作为剧本、分镜、设定库和队列的兼容项目上下文。
- `title`：画布名称。
- `createdAt` / `updatedAt`：ISO 字符串。
- `nodes`：画布节点列表。
- `connections`：节点连线列表。
- `chatSessions`：右侧画布助手会话。
- `activeChatId`：当前选中的助手会话 ID。
- `backgroundMode`：画布背景模式。
- `showImageInfo`：是否在画布中显示图片信息。
- `viewport`：视口变换，`x/y` 是屏幕平移，`k` 是缩放比例。
- `preset`：项目级创作预设，可选字段。旧画布没有该字段时继续使用全局 AI 配置。新建画布时可写入分辨率、画幅、帧率、默认时长、默认图片/视频/文本模型和默认视频供应商；新建生成配置节点、视频生成默认值和生成素材归档会读取该预设。

## 项目设定库结构

项目设定库独立于画布项目 JSON 保存，不强制绑定到节点或生成流程。每个设定项是一个 `ProductionBibleItem`：

```ts
type ProductionBibleItem = {
  id: string;
  projectId: string;
  kind: "character" | "scene" | "prop";
  name: string;
  description: string;
  tags: string[];
  assetRefs: Array<{
    assetId: string;
    role: string;
  }>;
  promptSnippets: {
    positive?: string;
    negative?: string;
    consistency?: string;
  };
  createdAt: string;
  updatedAt: string;
};
```

字段说明：

- `projectId`：所属画布项目 ID，用于在当前画布中筛选角色、场景、道具设定。
- `kind`：设定类型，当前支持角色、场景、道具三类。
- `assetRefs`：绑定到“我的素材”的引用，只保存素材 ID 和本设定中的用途角色，不复制素材内容，也不改变 `infinite-canvas:asset_store`。
- `promptSnippets`：可复用提示词片段，当前包含正向、反向和一致性三类。本阶段只做管理与记录，不自动拼接到生成请求。

生成素材的 `metadata.generation.productionBibleRefs` 已预留为空数组，后续接入生成流程时可记录使用过的设定项 ID 和角色。

## 项目剧本结构

项目剧本独立于画布节点保存，用于在分镜管理之前沉淀故事大纲、分集和场次。本地 store 保存三类数据：

```ts
type ScriptProject = {
  projectId: string;
  outline: string;
  createdAt: string;
  updatedAt: string;
};

type ScriptEpisode = {
  id: string;
  projectId: string;
  order: number;
  title: string;
  summary: string;
  hook: string;
  turningPoint: string;
  cliffhanger: string;
  sceneIds: string[];
  createdAt: string;
  updatedAt: string;
};

type ScriptScene = {
  id: string;
  episodeId: string;
  order: number;
  location: string;
  characterIds: string[];
  sceneSettingId?: string;
  beat: string;
  dialogue: string;
  emotion: string;
  durationHint: string;
  storyboardGroupId?: string;
  createdAt: string;
  updatedAt: string;
};
```

字段说明：

- `ScriptProject.outline`：当前画布项目的故事大纲，不直接参与生成请求。
- `ScriptEpisode.sceneIds`：分集下场次 ID 列表；场次详情仍以 `ScriptScene.episodeId` 关联为准。
- `ScriptScene.characterIds`：引用 M5.4 设定库中的角色设定 ID。
- `ScriptScene.sceneSettingId`：可选引用 M5.4 设定库中的场景设定 ID；`location` 保存当前可读地点名。
- `ScriptScene.storyboardGroupId`：关联 M5.7 分镜组。用户从剧本场次或分集进入分镜管理时，如果该字段已有值则打开已有分镜组；没有值则创建分镜组并回写。

## 项目分镜结构

项目分镜独立保存，用于把剧本场次、提示词模板、设定库和素材引用组织成可加入画布的镜头组。本地 store 保存分镜组和分镜条目：

```ts
type StoryboardGroup = {
  id: string;
  projectId: string;
  order: number;
  title: string;
  description: string;
  preset: Record<string, unknown>;
  shotIds: string[];
  createdAt: string;
  updatedAt: string;
};

type StoryboardShot = {
  id: string;
  groupId: string;
  order: number;
  title: string;
  description: string;
  prompt: string;
  effectivePrompt: string;
  assetRefs: Array<{
    assetId: string;
    kind: "image" | "video" | "audio";
    role: string;
  }>;
  nodeRefs: Array<{
    nodeId: string;
    role: string;
  }>;
  resultAssetIds: string[];
  primaryAssetId?: string;
  lastResultNodeId?: string;
  lastTaskId?: string;
  errorMessage?: string;
  productionBibleRefs?: Array<{
    itemId: string;
    kind: "character" | "scene" | "prop";
  }>;
  status:
    | "draft"
    | "ready"
    | "in_canvas"
    | "generating"
    | "review"
    | "done"
    | "error";
  createdAt: string;
  updatedAt: string;
};
```

字段说明：

- `StoryboardGroup.projectId`：所属画布项目 ID。
- `StoryboardGroup.preset`：创建分镜组时可记录项目预设快照，第一版只保存，不强制参与生成请求。
- `StoryboardShot.assetRefs`：引用“我的素材”的图片、视频或音频，只保存素材 ID、类型和在本镜头中的角色，不复制素材内容。
- `StoryboardShot.productionBibleRefs`：引用 M5.4 设定库中的角色、场景或道具设定。
- `StoryboardShot.nodeRefs`：执行“打组加入画布”后记录创建出来的提示词节点、参考素材节点和视频配置节点 ID。
- `StoryboardShot.resultAssetIds` / `primaryAssetId`：记录已生成并自动入库到“我的素材”的视频素材 ID。首次成功生成时自动设置主版本；同一素材 ID 不重复写入。
- `StoryboardShot.lastResultNodeId` / `lastTaskId`：当暂时拿不到素材 ID 时，至少保留画布视频节点和上游任务 ID，方便后续补齐。
- `StoryboardShot.errorMessage`：视频生成失败时保存失败原因；`status` 会进入 `error`，页面中显示失败提示。

## 本地生成队列结构

生成队列独立于分镜和画布保存，第一版只从分镜组创建视频生成队列。队列执行仍复用画布单个视频配置节点的生成逻辑，不直接调用后端或绕过用户确认。

```ts
type GenerationQueueItem = {
  id: string;
  projectId: string;
  storyboardGroupId: string;
  storyboardShotId: string;
  nodeId: string;
  kind: "video" | "image" | "chat";
  status:
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "paused";
  priority: number;
  estimatedCredits: number;
  estimatedDurationSeconds?: number;
  taskId?: string;
  resultAssetId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};
```

字段说明：

- `storyboardGroupId` / `storyboardShotId`：队列项所属分镜组和分镜条目。
- `nodeId`：M5.7 “打组加入画布”创建的视频生成配置节点 ID。执行队列时会调用该节点的现有视频生成流程。
- `kind`：当前只实际支持 `video`，`image` 和 `chat` 作为后续扩展预留。
- `status`：队列项状态。暂停只阻止继续启动未运行的项，不强制中断已经提交到上游的视频任务。
- `estimatedCredits` / `estimatedDurationSeconds`：第一版按视频时长做轻量估算，用于开始前展示预算，不代表最终扣费凭证。
- `taskId` / `resultAssetId` / `error`：执行后记录上游任务、生成后自动入库素材和失败原因。

## 节点结构

每个节点是一个 `CanvasNodeData`：

```ts
type CanvasNodeData = {
  id: string;
  type: "image" | "text" | "config" | "video" | "audio";
  title: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  metadata?: CanvasNodeMetadata;
};
```

通用字段：

- `id`：节点 ID。
- `type`：节点类型，当前有图片、文本、生成配置、视频、音频五类。
- `title`：节点标题。
- `position`：画布世界坐标，不是屏幕坐标。
- `width` / `height`：画布世界坐标下的节点尺寸。
- `metadata`：节点内容和业务状态。

`metadata` 当前常用字段：

```ts
type CanvasNodeMetadata = {
  content?: string;
  prompt?: string;
  status?: "idle" | "success" | "loading" | "error";
  errorDetails?: string;
  fontSize?: number;
  generationMode?: "text" | "image" | "video";
  model?: string;
  size?: string;
  count?: number;
  seconds?: string;
  vquality?: string;
  duration?: string;
  ratio?: string;
  resolution?: string;
  generateAudio?: string;
  watermark?: string;
  seed?: string;
  returnLastFrame?: string;
  provider?: "openai" | "volcengine-ark";
  references?: string[];
  videoReferences?: string[];
  audioReferences?: string[];
  referenceOrder?: Array<{
    nodeId?: string;
    kind: "image" | "video" | "audio";
    index: number;
  }>;
  referenceRoles?: Array<{
    nodeId: string;
    kind: "image" | "video" | "audio";
    role: string;
    index?: number;
  }>;
  storyboardGroupId?: string;
  storyboardShotId?: string;
  storyboardRole?: string;
  storyboardAssetRole?: string;
  sourceAssetId?: string;
  taskId?: string;
  taskStatus?: string;
  rawTaskStatus?: string;
  videoUrl?: string;
  lastFrameUrl?: string;
  lastFrameStorageKey?: string;
  taskCreatedAt?: number;
  taskUpdatedAt?: number;
  executionExpiresAfter?: number;
  videoUrlExpiresAt?: number;
  localStoredAt?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  freeResize?: boolean;
  isBatchRoot?: boolean;
  batchRootId?: string;
  batchChildIds?: string[];
  primaryImageId?: string;
  imageBatchExpanded?: boolean;
  inputOrder?: string[];
  storageKey?: string;
  mimeType?: string;
  bytes?: number;
};
```

不同节点的使用方式：

- 图片节点：`content` 是当前可展示的图片 URL，通常是 `blob:` URL；`storageKey` 指向本地图片 Blob；`naturalWidth/naturalHeight/bytes/mimeType` 保存原图信息。
- 视频节点：`content` 是当前可播放的视频 URL，通常是 `blob:` URL；`storageKey` 指向本地视频 Blob；`bytes/mimeType/localStoredAt` 保存本地转存信息；`provider/taskId/taskStatus/rawTaskStatus/videoUrl/videoUrlExpiresAt/errorDetails` 保存视频任务状态、临时地址有效期和失败原因；`duration/ratio/resolution/generateAudio/watermark/seed/returnLastFrame` 保存 Ark 视频生成参数快照；`references/videoReferences/audioReferences/referenceRoles/referenceOrder` 保存本次 Seedance 图片、视频、音频参考、图片角色和混合输入顺序；`lastFrameUrl/lastFrameStorageKey` 保存 Ark 返回尾帧的临时地址和本地转存结果。
- 音频节点：`content` 是当前可播放的音频 URL，通常是 `blob:` URL；`storageKey` 指向本地音频 Blob；`bytes/mimeType/localStoredAt` 保存本地转存信息。音频节点可连接到视频生成配置节点，作为 Seedance `reference_audio` 输入。
- 文本节点：`content` 保存文本内容；`fontSize` 保存字体大小；`prompt/status/errorDetails` 保存生成状态。
- 生成配置节点：`generationMode/model/size/count/inputOrder` 保存生成配置；`generationMode` 可选择文本、图片或视频；上游输入通过 `connections` 计算。
- 图片组节点：根节点用 `isBatchRoot/batchChildIds/primaryImageId/imageBatchExpanded` 记录批量生成结果；子图节点用 `batchRootId` 指回根节点。
- 分镜节点：由“打组加入画布”创建的文本、素材和视频配置节点会写入 `storyboardGroupId/storyboardShotId/storyboardRole`；参考素材节点额外写入 `sourceAssetId/storyboardAssetRole`，用于后续结果回流和追溯。

## 连线结构

每条连线是一个 `CanvasConnection`：

```ts
type CanvasConnection = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
};
```

连线只保存节点 ID，不保存端口坐标。渲染时根据节点位置和尺寸计算路径。

删除节点时会同步删除以该节点为起点或终点的连线。删除图片组根节点时，会把对应子节点一起删除。

## 助手会话结构

助手会话保存在画布项目内：

```ts
type CanvasAssistantSession = {
  id: string;
  title: string;
  messages: CanvasAssistantMessage[];
  createdAt: string;
  updatedAt: string;
};
```

消息结构：

```ts
type CanvasAssistantMessage = {
  id: string;
  role: "user" | "assistant";
  mode: "ask" | "image";
  text: string;
  isLoading?: boolean;
  references?: CanvasAssistantReference[];
  images?: CanvasAssistantImage[];
};
```

图片引用和助手生成图片也遵循同一套图片存储规则：

- `dataUrl` 字段当前可能是 `blob:` URL，也可能是旧数据中的 `data:image/...`。
- `storageKey` 存在时，以 `storageKey` 为准读取图片 Blob。
- 发送到 AI 接口前，如果接口需要 base64，会通过 `imageToDataUrl` 临时把 Blob URL 转成 data URL。

## 图片写入流程

所有新增图片应通过 `uploadImage(input)` 写入：

1. 传入 `Blob` 或 data URL。
2. 内部转成 `Blob`。
3. 生成 `storageKey`，格式为 `image:<id>`。
4. 把 Blob 写入 `image_files`。
5. 创建 `blob:` URL，并缓存在内存 `objectUrls`。
6. 读取图片宽高，返回：

```ts
type UploadedImage = {
  url: string;
  storageKey: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: string;
};
```

图片节点会通过 `imageMetadata(image)` 写入：

```ts
{
  content: image.url,
  storageKey: image.storageKey,
  status: "success",
  naturalWidth: image.width,
  naturalHeight: image.height,
  bytes: image.bytes,
  mimeType: image.mimeType
}
```

因此，`content` 只适合当前浏览器会话展示，不能作为长期文件标识；长期标识是 `storageKey`。

## 图片读取和旧数据迁移

打开画布时会执行图片补水：

- 如果图片节点有 `storageKey`，通过 `resolveImageUrl(storageKey, fallback)` 读取 Blob 并生成新的 `blob:` URL。
- 如果图片节点没有 `storageKey`，但 `content` 是旧的 `data:image/...`，会调用 `uploadImage(content)` 迁移到 `image_files`，并补上 `storageKey`。
- 助手消息里的引用图和生成图也会执行同类逻辑。

我的素材读取时也会做迁移：

- 有 `storageKey`：恢复 `coverUrl` 和 `data.dataUrl` 的可展示 URL。
- 无 `storageKey` 且保存了 base64：写入 `image_files`，然后更新素材里的 `storageKey`。

## 图片移除和清理

图片不是在删除节点时立即按节点逐张删除，而是做引用清理：

1. 删除节点、清空画布、删除画布、删除素材、删除助手会话时，会触发 `cleanupImages`。
2. `cleanupImages` 会收集当前仍被画布项目、素材和额外传入数据引用的所有 `storageKey`。
3. `cleanupUnusedImages` 遍历 `image_files` 中的全部图片。
4. 不在引用集合里的图片会被删除。
5. 删除时会同时 `URL.revokeObjectURL`，并从内存缓存 `objectUrls` 移除。

这套方式可以避免同一张图片被画布、素材或助手同时引用时误删。

需要注意：

- 只要某个 JSON 结构里仍有 `storageKey`，清理逻辑就会认为图片仍被使用。
- `collectImageStorageKeys` 会递归扫描对象中的 `storageKey` 字段，字段值必须以 `image:` 开头才会被当成本地图片。
- 如果后续新增保存图片引用的数据结构，也要确保它能传入清理上下文，或者位于现有项目/素材结构内。

## 后端存储兼容建议

后续接入后端时，建议保持“画布 JSON”和“图片文件”分离：

- 画布表保存项目元信息和画布 JSON。
- 文件表保存图片文件、访问 URL、哈希、大小、MIME、宽高、归属用户等信息。
- 画布节点中继续保存轻量图片引用，不把图片二进制或 base64 写进画布 JSON。

建议图片引用逐步扩展为兼容本地和云端的结构：

```ts
type ImageRef = {
  storageKey?: string;
  fileId?: string;
  url?: string;
  width?: number;
  height?: number;
  bytes?: number;
  mimeType?: string;
};
```

兼容规则：

- 本地旧数据：有 `storageKey`，无 `fileId`，通过 IndexedDB 读取。
- 已上传后端：有 `fileId`，展示时优先使用后端返回的签名 URL 或公开 URL。
- 迁移过渡期：可以同时保留 `storageKey` 和 `fileId`；确认云端文件可用后，再按清理策略删除本地 Blob。
- `content/dataUrl/coverUrl` 仍只作为当前可展示 URL，不作为稳定 ID。

建议读取优先级：

1. 有 `fileId`：向后端换取可访问 URL。
2. 有 `storageKey`：从本地 IndexedDB 生成 `blob:` URL。
3. 有旧 `data:image/...`：先写入本地图片存储，再视需要上传后端。
4. 只有普通 URL：直接展示，但不要假设可长期访问。

建议删除策略：

- 删除节点只删除画布 JSON 引用，不直接删除后端文件。
- 后端文件删除应按引用计数或定期扫描未引用文件处理。
- 保存到“我的素材”的图片，即使原画布节点删除，也应继续保留文件引用。
- 删除画布、删除素材、删除助手会话后，再由后端清理任务判断文件是否无人引用。

建议同步流程：

1. 前端保存画布 JSON 时，保持节点 ID、连线 ID、`storageKey/fileId` 不变。
2. 遇到只有 `storageKey` 的图片，后台同步前先上传 Blob，得到 `fileId`。
3. 上传成功后给对应图片引用补 `fileId` 和云端元信息。
4. 服务端保存更新后的画布 JSON。
5. 前端下次打开时优先走 `fileId`，本地 `storageKey` 只作为缓存或离线回退。

## 后续改动约束

- 不要把新生成的大图直接长期写入画布 JSON。
- 新增图片来源时统一走 `uploadImage` 或未来的文件上传服务。
- 新增图片引用字段时，应保留 `storageKey` 兼容旧本地数据。
- 新增清理入口时，要把仍需保留的画布、素材、助手数据传给 `cleanupUnusedImages`。
- 后端同步完成前，文档和 UI 不要写成已支持云同步。
