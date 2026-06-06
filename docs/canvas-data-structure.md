# 画布数据结构

本文档说明当前画布在前端本地保存的数据结构、图片文件的存储和清理方式，以及后续接入后端存储时建议保持的兼容边界。

## 当前存储位置

当前画布项目主要保存在浏览器本地：

- 画布项目 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:canvas_store`。
- 创作项目 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:creative_project_store`。
- 我的素材 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:asset_store`。
- 项目设定库 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:production_bible_store`。
- 项目剧本 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:script_store`。
- 本集资产拆解 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:asset_breakdown_store`。
- 生图 Brief JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:image_brief_store`。
- 项目分镜 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:storyboard_store`。
- 本地生成队列 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:generation_queue_store`。
- Agent 任务 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:agent_task_store`。
- Agent Runner 运行记录 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，key 为 `infinite-canvas:agent_runner_store`。
- 图片 Blob：单独存到 `localForage` 实例，数据库名 `infinite-canvas`，storeName `image_files`。
- 视频等媒体 Blob：单独存到 `localForage` 实例，数据库名 `infinite-canvas`，storeName `media_files`。

画布 JSON 不直接长期保存大体积 base64 图片或视频。图片节点、视频节点、助手图片和素材媒体只保存展示 URL、`storageKey` 和元信息，真实 Blob 通过 `storageKey` 读取。

## 素材版本引用快照

M7.2.2 起，画布节点、分镜参考素材和设定库绑定素材都会在引用方记录加入当时的素材版本快照。该结构只保存在本地引用方 JSON 中，不新增后端接口，不新增云端版本表，也不会修改素材本身。

```ts
type AssetVersionReference = {
  assetId: string;
  assetVersionId?: string;
  versionNumber?: number;
  assetUpdatedAt?: string;
  lockedAt?: string;
  updatedAt?: string;
  mode: "fixed-version";
  previousVersions?: Array<{
    assetId: string;
    assetVersionId?: string;
    versionNumber?: number;
    assetUpdatedAt?: string;
    lockedAt?: string;
    updatedAt?: string;
  }>;
};
```

字段说明：

- `assetId`：被引用的素材 ID。
- `assetVersionId` / `versionNumber`：引用创建或手动更新时锁定的素材当前版本。当前第一版优先使用素材本地 `metadata.currentAssetVersionId` 和版本号。
- `assetUpdatedAt`：引用创建或手动更新时素材的更新时间，用于兼容没有显式版本 ID 的旧素材。
- `lockedAt`：首次建立引用的时间。
- `updatedAt`：手动把引用更新到最新版的时间。
- `mode`：当前只支持 `fixed-version`，即默认锁定创建时版本，不自动跟随素材最新版。
- `previousVersions`：手动更新引用时保留旧的引用版本快照，方便后续回溯或批量更新。

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
  episodeId?: string;
  episodeTitle?: string;
  scriptId?: string;
  scriptSnapshot?: string;
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
- `episodeId` / `episodeTitle`：当前画布绑定的本集分集。M6.6.1 起，一个新画布默认可以对应一集内容；旧画布没有该字段时在项目详情中显示“未绑定集数”。
- `scriptId`：本地剧本上下文 ID。当前第一版使用所属创作项目 ID 作为剧本上下文标识，不新增后端剧本表。
- `scriptSnapshot`：创建画布时保存的本集剧本文本快照。绑定已有分集时由分集摘要和场次草稿拼接；粘贴导入时保存用户粘贴的本集正文。后续剧本被编辑时，旧画布仍保留创建时快照用于追溯。
- `createdAt` / `updatedAt`：ISO 字符串。
- `nodes`：画布节点列表。
- `connections`：节点连线列表。
- `chatSessions`：右侧画布助手会话。
- `activeChatId`：当前选中的助手会话 ID。
- `backgroundMode`：画布背景模式。
- `showImageInfo`：是否在画布中显示图片信息。
- `viewport`：视口变换，`x/y` 是屏幕平移，`k` 是缩放比例。
- `preset`：项目级创作预设，可选字段。旧画布没有该字段时继续使用全局 AI 配置。新建画布时可写入分辨率、画幅、帧率、默认时长、默认图片/视频/文本模型和默认视频供应商；新建生成配置节点、视频生成默认值和生成素材归档会读取该预设。

画布新建时的剧本来源支持三种：

- 不绑定剧本：画布不写入 `episodeId`，适合草稿或旧流程。
- 从项目已有剧本分集选择：写入分集 ID、标题和当时的剧本快照。
- 粘贴 / 导入本集剧本：在当前项目的本地剧本 store 中创建一个 `ScriptEpisode`，并把粘贴正文写入画布 `scriptSnapshot`。

画布内生成图片或视频后，自动归档到“我的素材”的 `metadata.generation` 会继续写入 `episodeId`、`episodeTitle`、`scriptId` 和 `scriptSnapshot`，便于后续按集数追溯素材来源。M6.6.1 不做跨集时间线，也不把整部剧所有集塞入同一个画布。

## 本集资产拆解结构

M6.6.2 起，项目可以按 `projectId + episodeId` 保存本集资产拆解结果。第一版只在前端本地保存，不接真实 LLM，不自动确认资产图生成。

```ts
type AssetBreakdownItem = {
  id: string;
  projectId: string;
  canvasId: string;
  episodeId: string;
  episodeTitle: string;
  scriptId: string;
  kind: "character" | "scene" | "prop" | "style";
  name: string;
  description: string;
  sourceText: string;
  tags: string[];
  productionBibleItemId?: string;
  briefId?: string;
  briefDraft?: {
    id: string;
    title: string;
    kind: "character" | "scene" | "prop" | "style";
    prompt: string;
    createdAt: string;
  };
  assetIds: string[];
  status: "draft" | "brief_ready" | "generated" | "linked";
  agentRunId?: string;
  agentConfigId?: string;
  agentConfigVersion?: string;
  sourceType?: string;
  agentAssetKind?: string;
  suggestedBriefKind?: string;
  importance?: string;
  warnings?: string[];
  createdAt: string;
  updatedAt: string;
};
```

字段说明：

- `projectId` / `canvasId` / `episodeId`：资产拆解所属项目、画布和本集。
- `kind`：资产类型，角色、场景、道具和风格 / 光影四类。
- `sourceText`：从本集剧本文本中摘录的依据，第一版通过本地规则生成后可人工编辑。
- `productionBibleItemId`：可选的设定库条目引用。角色、场景、道具可关联到设定库；风格 / 光影第一版仅作为 Brief 草稿。
- `briefId` / `briefDraft`：资产图 Brief 草稿。M6.6.2 只生成可追溯草稿，不强行接图片生成。
- `assetIds`：手动绑定或后续资产图生成成功后的素材 ID。绑定后可同步写入设定库 `assetRefs`。
- `status`：草稿、Brief 已准备、已生成、已关联。
- `agentRunId / agentConfigId / agentConfigVersion`：M6.9.3 起由资产提取 Agent 写入，用于追溯需求来自哪一次 Runner 记录和哪一版 Agent 配置。
- `sourceType`：需求来源。资产提取 Agent 写入 `agent_asset_extractor`；手动补充可写 `manual`；旧资产拆解为空时按资产拆解处理。
- `agentAssetKind`：保留 Agent 原始资产类型，支持 `character / scene / prop / costume / makeup / mood / effect`。为复用旧数据结构，`costume / makeup` 会落到 `kind=character`，`mood / effect` 会落到 `kind=style`。
- `suggestedBriefKind`：建议创建的 Brief 类型，支持 `character / scene / prop / mood`。
- `importance / warnings`：资产提取草案给出的重要度和风险提醒。

当用户把素材绑定到资产拆解条目时，素材 `metadata` 会记录 `episodeId`、`episodeTitle`、`assetBreakdownItemId` 和 `assetBreakdownItems` 追溯数组。后续如果资产图节点真实生成成功，也可以通过画布节点 `metadata.assetBreakdownItemId` 回写到素材 `metadata.generation.assetBreakdownItemId`。

M6.9.4 起，本集工作台的“本集生图需求”直接读取同一个 `asset_breakdown_store`，不新增独立 store。用户点击“创建 Brief”后，系统会在 `image_brief_store` 创建 `sourceType=asset_breakdown` 的 Brief，并把 Brief ID 回写到 `AssetBreakdownItem.briefId`；如果已经存在 `briefId` 或同 `sourceType/sourceId` 的 Brief，则只打开已有 Brief，不重复创建。图片生成成功后，现有素材入库链路会把 assetId 追加到 Brief `resultAssetIds` 和需求 `assetIds`，并把需求状态更新为 `generated`；同一 assetId 会去重。主参考图优先读取 Brief `primaryAssetId`，切换主参考仍在 Brief 结果区完成，不直接改素材本体。

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
    assetVersion?: AssetVersionReference;
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
- `assetRefs`：绑定到“我的素材”的引用，保存素材 ID、本设定中的用途角色和 `assetVersion` 版本快照；不复制素材内容，也不改变 `infinite-canvas:asset_store`。素材有新版本时，设定库卡片会提示并允许单独把该绑定更新到最新版。
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
    assetVersion?: AssetVersionReference;
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

type StoryboardTableShot = {
  id: string;
  projectId: string;
  canvasId: string;
  episodeId: string;
  sceneId?: string;
  sceneName: string;
  location: string;
  timeOfDay: string;
  order: number;
  title: string;
  scriptText: string;
  visualDescription: string;
  characters: string[];
  dialogue: string;
  action: string;
  emotion: string;
  shotSize: string;
  cameraMovement: string;
  estimatedDuration: number;
  assetNeeds?: string[];
  assetRefs: StoryboardAssetRef[];
  productionBibleRefs?: StoryboardProductionBibleRef[];
  createdAt: string;
  updatedAt: string;
};

type ShotGroup = {
  id: string;
  projectId: string;
  canvasId: string;
  episodeId: string;
  sceneName: string;
  shotIds: string[];
  totalDuration: number;
  prompt: string;
  effectivePrompt: string;
  assetRefs: StoryboardAssetRef[];
  audioRefs: StoryboardAssetRef[];
  productionBibleRefs?: StoryboardProductionBibleRef[];
  status:
    | "draft"
    | "prompt_ready"
    | "in_canvas"
    | "generating"
    | "done"
    | "error";
  taskId?: string;
  resultAssetIds: string[];
  primaryAssetId?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};
```

字段说明：

- `StoryboardGroup.projectId`：所属画布项目 ID。
- `StoryboardGroup.preset`：创建分镜组时可记录项目预设快照，第一版只保存，不强制参与生成请求。
- `StoryboardShot.assetRefs`：引用“我的素材”的图片、视频或音频，保存素材 ID、类型、镜头角色和 `assetVersion` 版本快照；不复制素材内容。素材有新版本时，分镜条目会提示并允许单独把该引用更新到最新版。
- `StoryboardShot.productionBibleRefs`：引用 M5.4 设定库中的角色、场景或道具设定。
- `StoryboardShot.nodeRefs`：执行“打组加入画布”后记录创建出来的提示词节点、参考素材节点和视频配置节点 ID。
- `StoryboardShot.resultAssetIds` / `primaryAssetId`：记录已生成并自动入库到“我的素材”的视频素材 ID。首次成功生成时自动设置主版本；同一素材 ID 不重复写入。
- `StoryboardShot.lastResultNodeId` / `lastTaskId`：当暂时拿不到素材 ID 时，至少保留画布视频节点和上游任务 ID，方便后续补齐。
- `StoryboardShot.errorMessage`：视频生成失败时保存失败原因；`status` 会进入 `error`，页面中显示失败提示。
- `StoryboardTableShot`：M6.6.3 新增的本集分镜头表条目，按 `projectId + canvasId + episodeId` 保存。它来自本集 `scriptSnapshot` 的本地规则粗拆，也允许用户人工编辑、删除、排序和补充镜头信息。
- `StoryboardTableShot.assetNeeds`：M6.8 起用于标记单镜头资产需求，第一版支持角色、场景、道具、服化道、音频、参考视频和特殊效果。它只服务本集工作台的生产提示，不会自动触发素材生成。
- `ShotGroup`：M6.6.3 新增的生成镜头组，由连续 `StoryboardTableShot.shotIds` 组成。组合时要求同一个 `sceneName`、不能跳选、`totalDuration <= 15`；它只管理生成单元结构和提示词，不自动触发真实视频生成。
- `ShotGroup.assetRefs` / `audioRefs` / `productionBibleRefs`：记录生成镜头组可用的图片、参考视频、音频和设定库输入。引用素材时继续保存素材版本快照；M6.8 起素材引用可标记 `source: "asset_breakdown" | "independent"`，用于区分剧本拆解资产和独立生图工作台资产。
- `ShotGroup.resultAssetIds` / `primaryAssetId`：记录生成结果回流到生成镜头组的素材 ID；同一素材 ID 不重复写入，首次成功结果可成为主版本。
- `ShotGroup.status` / `taskId` / `errorMessage`：M6.8 起由画布视频生成链路回写生成状态。本集工作台只展示和管理状态，不自动触发真实视频生成或扣费。
- M6.8 本集工作台没有新增 localforage key，而是复用脚本、分镜、资产拆解、设定库、素材和画布已有 store。打组加入画布时继续写入 `episodeId / shotGroupId / shotIds / storyboardShotGroupId / storyboardTableShotIds`，用于后续素材归档、任务追溯和生成管理。
- M6.9.2 调整剧本 / 本集工作台入口，但不新增 localforage key。项目页可以直接打开独立本集工作台；画布页打开本集工作台时，如果当前画布没有 `episodeId` 和 `scriptSnapshot`，会先提示绑定已有分集、导入本集剧本或继续自由画布制作。选择自由画布不会写入 episode 字段；绑定或导入只更新画布的本集上下文，不自动创建 Agent run、不自动生成资产草案、分镜草案或触发生成扣费。
- M6.9.3 起，本集工作台的“资产提取”会先创建 `asset_extractor` 类型 Agent Runner 记录。草案 item 的原始类型支持 `character / scene / prop / costume / makeup / mood / effect`，每条至少包含 `id / kind / name / description / scriptEvidence / importance / suggestedBriefKind / tags / source / warnings`。用户批准 run 并确认写入后，草案才会转换为现有资产拆解 / 本集生图需求。
- 资产提取写入仍使用 `infinite-canvas:asset_breakdown_store`，不新增孤立 store。由于资产拆解第一版只支持 `character / scene / prop / style`，`costume / makeup` 会作为 `character` 扩展需求保存，`mood / effect` 会作为 `style` 扩展需求保存，同时保留 `agentAssetKind` 追溯原始类型。
- 由 Agent 写入的资产拆解项可包含追溯字段：`agentRunId`、`agentConfigId`、`agentConfigVersion`、`sourceType: "agent_asset_extractor"`、`agentAssetKind`、`suggestedBriefKind`、`importance`、`warnings`。重复资产按同项目、同集、同类、同名合并，避免同一剧本反复提取时无限追加。

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

## Agent 设置结构

M6.9.0 新增统一 Agent 设置中心，用于集中维护资产提取、分镜导演、生图 Brief、视频提示词和提示词质检 Agent 的提示词模板、输入变量、输出 JSON 示例、模型偏好和写入策略。第一版只保存在浏览器本地，不改后端，不接真实 LLM，不自动写入业务数据，不触发生成或扣费。

本地保存位置：

- 数据库：`localForage`
- 数据库名 / store：沿用项目本地存储封装
- key：`infinite-canvas:agent_settings_store`

```ts
type AgentConfigKind =
  | "asset_extractor"
  | "storyboard_director"
  | "image_brief_builder"
  | "video_prompt_builder"
  | "prompt_reviewer";

type AgentConfig = {
  id: string;
  projectId?: string;
  episodeId?: string;
  name: string;
  kind: AgentConfigKind;
  scenario: string;
  enabled: boolean;
  systemPrompt: string;
  userPromptTemplate: string;
  inputVariables: Array<{
    name: string;
    description: string;
  }>;
  outputJsonSchema?: string;
  outputJsonExample?: string;
  modelPreference: string;
  temperature: number;
  maxOutputTokens: number;
  reasoningLevel: "中" | "高" | "超高";
  writePolicy: "preview_only" | "confirm_before_write";
  version: string;
  updatedAt: string;
};

type AgentSettingsStore = {
  globalConfigs: AgentConfig[];
  projectConfigs: Record<string, AgentConfig[]>;
  episodeConfigs: Record<string, AgentConfig[]>;
};
```

字段说明：

- `globalConfigs`：全局默认模板的本地覆盖配置。代码内默认模板仍是基础来源，第一版 UI 主要操作项目级覆盖。
- `projectConfigs`：项目级覆盖配置。项目详情和本集工作台打开 Agent 设置时，会按“代码默认模板 -> 全局覆盖 -> 项目覆盖”合并。
- `episodeConfigs`：本集级覆盖预留字段，M6.9.0 不强制完整 UI。
- `enabled`：禁用后，后续 Agent 调用入口需要显示不可用状态。
- `writePolicy`：默认 `confirm_before_write`。所有写业务数据的 Agent 输出都必须先作为预览，用户确认后才允许写入。
- `reasoningLevel`：只能是 `中 / 高 / 超高`，用于后续控制模型推理程度和额度消耗。

内置第一批 Agent 配置类型：

- `asset_extractor`：资产提取 Agent。
- `storyboard_director`：分镜导演 Agent。
- `image_brief_builder`：生图 Brief Agent。
- `video_prompt_builder`：视频提示词 Agent。
- `prompt_reviewer`：提示词质检 Agent。

Agent 设置只描述“怎么生成草案和预览”，不等于 Agent 已执行。真正写入素材、分镜、Brief、画布节点或触发生成任务，仍必须由后续业务入口在用户确认后执行。

## Agent Runner 运行记录结构

M6.9.1 新增轻量 Agent Runner 协议，用于记录“按某个 Agent 配置创建草案、展示预览、等待用户批准、再由后续业务入口应用”的状态流。它借鉴状态图和 HITL 思路，但第一版不引入 LangGraph、AutoGen 或 Dify，不接真实 LLM，不自动写入业务 store，不触发图片 / 视频生成或扣费。

本地保存位置：

- 数据库：`localForage`
- 数据库名 / store：沿用项目本地存储封装
- key：`infinite-canvas:agent_runner_store`

```ts
type AgentRunStatus =
  | "draft"
  | "ready_for_review"
  | "approved"
  | "rejected"
  | "applied"
  | "failed";

type AgentRunKind =
  | "asset_extractor"
  | "storyboard_director"
  | "image_brief_builder"
  | "video_prompt_builder"
  | "prompt_reviewer";

type AgentRunInput = {
  projectId: string;
  canvasId?: string;
  episodeId?: string;
  episodeTitle?: string;
  scriptId?: string;
  scriptSnapshot?: string;
  sourceType: string;
  sourceId?: string;
  variables: Record<string, unknown>;
};

type AgentDraftOutput = {
  summary: string;
  items: unknown[];
  rawJson: unknown;
  warnings: string[];
  schemaVersion: string;
};

type AgentRunProposedAction = {
  type: string;
  title: string;
  targetRefs: Array<{
    kind: string;
    id: string;
    label?: string;
  }>;
  payload: unknown;
  requiresConfirmation: boolean;
};

type AgentRunRecord = {
  id: string;
  agentKind: AgentRunKind;
  agentConfigId: string;
  agentConfigVersion: string;
  status: AgentRunStatus;
  input: AgentRunInput;
  draftOutput: AgentDraftOutput;
  proposedActions: AgentRunProposedAction[];
  approvedAt?: string;
  appliedAt?: string;
  rejectedAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};
```

字段说明：

- `agentConfigId / agentConfigVersion`：记录创建 run 时实际使用的 Agent 设置配置。项目级覆盖存在时优先使用项目级配置。
- `status`：`draft` 表示草案占位，`ready_for_review` 表示已有草案等待用户审核，`approved` / `rejected` 是用户审核结果，`applied` 只表示后续业务入口已经在用户确认后完成写入，`failed` 记录运行或应用失败。
- `draftOutput`：统一保存本地规则或后续模型返回的草案摘要、条目、原始 JSON 和 warning。非合法 JSON 会被降级保存为文本摘要。
- `proposedActions`：只用于预览影响对象和待写入动作。M6.9.1 不直接应用这些动作，后续资产提取、分镜草案、生图 Brief 或视频提示词入口必须再次经过用户确认。
- 禁用的 Agent 不允许创建 run；`writePolicy` 必须通过 Agent 设置中心归一化，默认保持 `confirm_before_write`。
- 未 `approved` 的 run 不能标记为 `applied`，防止草案绕过审核进入业务数据。

Agent Runner 只保存“运行记录和草案预览”。它不替代 Agent 设置中心，也不替代 M5.9 的 `AgentTask`。后续版本可以把某次 Runner 的 `proposedActions` 转换为素材、分镜、Brief 或画布节点的写入动作，但必须保持用户确认边界。

## Agent 任务结构

Agent 任务独立于画布节点保存，用于记录短剧 Agent 工作台产生的本地建议和用户确认后的写入结果。第一版不接入真实 LLM，不自动生成视频，不自动扣费，也不绕过用户确认写入画布。

```ts
type AgentTask = {
  id: string;
  projectId: string;
  kind: "asset_manager" | "prompt_engineer" | "storyboard_director";
  title: string;
  status: "pending" | "applied" | "cancelled";
  targetRefs: Array<{
    kind:
      | "asset"
      | "production_bible"
      | "prompt"
      | "script_episode"
      | "script_scene"
      | "storyboard_group"
      | "storyboard_shot";
    id: string;
    label?: string;
  }>;
  summary: string;
  riskLevel: "low" | "medium" | "high";
  skillId?: string;
  skillName?: string;
  skillVersion?: string;
  proposedActions: Array<
    | {
        type: "asset.add_tags";
        assetId: string;
        tags: string[];
        reason: string;
      }
    | {
        type: "storyboard.update_shot_prompt";
        shotId: string;
        prompt: string;
        effectivePrompt: string;
        reason: string;
      }
    | {
        type: "storyboard.create_group_from_scenes";
        episodeId: string;
        sceneIds: string[];
        title: string;
        description: string;
        reason: string;
      }
  >;
  createdAt: string;
  updatedAt: string;
};
```

字段说明：

- `kind`：当前只支持资产管理员、提示词工程和分镜导演三个本地规则 Agent。
- `status`：任务默认待确认；用户点击确认后进入 `applied`，点击取消后进入 `cancelled`。取消不会修改素材、提示词、分镜或画布。
- `targetRefs`：任务影响对象，只保存轻量引用，便于任务卡片展示和后续追溯。
- `skillId` / `skillName` / `skillVersion`：M5.10 新增的 Skill 追踪字段。M5.9 旧任务可能没有这些字段，新任务会由本地 skill registry 写入。
- `proposedActions`：确认后才执行的写入预览。第一版只允许补素材标签、补分镜提示词、从剧本场次创建分镜组。
- 写入追溯：资产标签写入会在素材 metadata 中追加 `agentTaskRefs`；分镜提示词和分镜组创建通过对应 store 的更新时间和任务 ID 预设信息追溯。

内置 Agent Skill 不单独持久化，当前以代码内 registry 形式注册。每个 `AgentSkill` 包含：

```ts
type AgentSkill = {
  id: string;
  name: string;
  agentKind: "asset_manager" | "prompt_engineer" | "storyboard_director";
  description: string;
  version: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  riskLevel: "low" | "medium" | "high";
  run: (input: AgentWorkbenchInput) => AgentSkillOutput;
  apply: (task: AgentTask, context: AgentSkillApplyContext) => void;
};
```

第一版内置 Skill：

- `asset.gap_check`：资产缺口检查。
- `asset.reuse_duplicate_scan`：素材复用/重复检测。
- `prompt.storyboard_completion`：分镜提示词补全。
- `storyboard.scene_to_draft`：剧本场次转分镜草案。

Skill 的 `run` 只能输出结构化 `summary/targetRefs/proposedActions`；`apply` 只在用户确认任务后执行，不允许自动删除素材、覆盖主版本、触发真实生成或扣费。

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
  videoPromptReviewEnabled?: string;
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
  assetVersion?: AssetVersionReference;
  assetReferenceMode?: "fixed-version";
  taskId?: string;
  taskStatus?: string;
  rawTaskStatus?: string;
  aiTaskId?: string;
  upstreamTaskId?: string;
  aiTaskStatus?: string;
  aiTaskCredits?: number;
  creditLogId?: string;
  creditsRefunded?: number;
  refundedAt?: string;
  finishedAt?: string;
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

M8 起，云端 AI 代理任务会把账本字段回填到图片 / 视频节点 metadata：

- `aiTaskId`：后端 `ai_tasks.id`，用于打开后台任务日志或用户自己的任务详情。
- `upstreamTaskId`：上游任务 ID。Seedance 视频通常等同于视频 `taskId`；同步图片请求可为空。
- `aiTaskStatus`：后端账本状态，例如 `queued`、`running`、`succeeded`、`failed`、`cancelled`。
- `aiTaskCredits` / `creditsRefunded` / `creditLogId`：扣费和返还追溯摘要，不改变既有扣费规则。
- `refundedAt` / `finishedAt`：失败返还或内容回填完成时间。

本地直连模式不会强行写入云端 `ai_tasks`，也不会把本地 API Key 或 Base URL 作为追溯字段下发给后端。

不同节点的使用方式：

- 图片节点：`content` 是当前可展示的图片 URL，通常是 `blob:` URL；`storageKey` 指向本地图片 Blob；`naturalWidth/naturalHeight/bytes/mimeType` 保存原图信息。
- 视频节点：`content` 是当前可播放的视频 URL，通常是 `blob:` URL；`storageKey` 指向本地视频 Blob；`bytes/mimeType/localStoredAt` 保存本地转存信息；`provider/taskId/taskStatus/rawTaskStatus/videoUrl/videoUrlExpiresAt/errorDetails` 保存视频任务状态、临时地址有效期和失败原因；`duration/ratio/resolution/generateAudio/watermark/seed/videoPromptReviewEnabled/returnLastFrame` 保存 Ark 视频生成参数快照；`references/videoReferences/audioReferences/referenceRoles/referenceOrder` 保存本次 Seedance 图片、视频、音频参考、图片角色和混合输入顺序；`lastFrameUrl/lastFrameStorageKey` 保存 Ark 返回尾帧的临时地址和本地转存结果。
- 音频节点：`content` 是当前可播放的音频 URL，通常是 `blob:` URL；`storageKey` 指向本地音频 Blob；`bytes/mimeType/localStoredAt` 保存本地转存信息。音频节点可连接到视频生成配置节点，作为 Seedance `reference_audio` 输入。
- 文本节点：`content` 保存文本内容；`fontSize` 保存字体大小；`prompt/status/errorDetails` 保存生成状态。
- 生成配置节点：`generationMode/model/size/count/inputOrder` 保存生成配置；`generationMode` 可选择文本、图片或视频；上游输入通过 `connections` 计算。
- 图片组节点：根节点用 `isBatchRoot/batchChildIds/primaryImageId/imageBatchExpanded` 记录批量生成结果；子图节点用 `batchRootId` 指回根节点。
- 素材来源节点：从“我的素材”加入画布时会写入 `sourceAssetId`、`assetVersion` 和 `assetReferenceMode: "fixed-version"`。节点默认锁定创建时的素材版本，素材后续更新不会自动改节点内容；节点悬浮工具栏只在发现新版本时提示，并由用户手动更新引用记录。
- 分镜节点：由“打组加入画布”创建的文本、素材和视频配置节点会写入 `storyboardGroupId/storyboardShotId/storyboardRole`；参考素材节点额外写入 `sourceAssetId/storyboardAssetRole/assetVersion`，用于后续结果回流、版本锁定和追溯。M6.6.3 生成镜头组加入画布时，节点还会写入 `episodeId/shotGroupId/shotIds/storyboardShotGroupId/storyboardTableShotIds`，用于追溯本集分镜头表和生成镜头组。

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

type CanvasAssistantImage = {
  id: string;
  dataUrl: string;
  storageKey?: string;
  sourceAssetId?: string;
  assetVersion?: AssetVersionReference;
  prompt: string;
};
```

图片引用和助手生成图片也遵循同一套图片存储规则：

- `dataUrl` 字段当前可能是 `blob:` URL，也可能是旧数据中的 `data:image/...`。
- `storageKey` 存在时，以 `storageKey` 为准读取图片 Blob。
- `sourceAssetId/assetVersion` 只在图片来自“我的素材”时存在，用于插入画布节点时继续锁定同一素材版本。
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

## 分镜剪辑包导出

M6.5 第一版剪辑交接包不新增本地持久化字段，而是根据当前 `StoryboardGroup`、`StoryboardShot` 和“我的素材”实时生成 zip。导出包用于人工剪辑交接，不是剪辑工程文件。

```text
剪辑包_分镜组标题.zip
  shots.json
  shots.csv
  videos/
    001_开场钩子.mp4
  references/
    001_开场钩子/
      01_角色参考.png
  prompts/
    001_开场钩子_prompt.txt
```

`shots.json` 的核心结构：

```ts
type StoryboardClipExportManifest = {
  app: "infinite-canvas";
  version: 1;
  kind: "storyboard-clip-package";
  exportedAt: string;
  projectId: string;
  group: {
    id: string;
    title: string;
    description: string;
    preset: Record<string, unknown>;
  };
  shots: Array<{
    order: number;
    shotId: string;
    title: string;
    description: string;
    status: string;
    prompt: string;
    effectivePrompt: string;
    primaryAssetId?: string;
    primaryVideoPath?: string;
    durationSeconds?: number;
    model?: string;
    provider?: string;
    taskId?: string;
    actionType?: string;
    config?: Record<string, unknown>;
    references: Array<{
      assetId: string;
      kind: "image" | "video" | "audio";
      role: string;
      title?: string;
      path?: string;
      storageKey?: string;
    }>;
    warnings: Array<{
      shotId: string;
      type:
        | "missing_primary_asset"
        | "primary_asset_not_video"
        | "failed_shot"
        | "missing_video_storage"
        | "duration_anomaly";
      message: string;
    }>;
  }>;
  warnings: Array<{
    shotId: string;
    type: string;
    message: string;
  }>;
};
```

导出规则：

- 主版本视频来自 `StoryboardShot.primaryAssetId` 指向的视频素材。
- 分镜参考素材来自 `StoryboardShot.assetRefs`。
- 模型、供应商、taskId、生成方式和参数优先读取主版本素材的 `metadata.generation/generations`。
- 缺少主版本、失败分镜、主版本不是视频、主版本缺少本地文件或时长明显异常时，会写入 `warnings`，并在页面导出前提示用户。

## 生图 Brief 工作台

M6.7 第一版新增本地 Brief 工作台，用于把资产拆解、设定库和分镜生成镜头组整理成可复用的生图提示词草稿。不改后端，不自动触发真实生图。

localforage key：

```text
infinite-canvas:image_brief_store
```

核心结构：

```ts
type ImageBrief = {
  id: string;
  projectId: string;
  canvasId: string;
  episodeId: string;
  episodeTitle: string;
  sourceType: "asset_breakdown" | "production_bible" | "storyboard" | "manual";
  sourceId: string;
  kind: "scene" | "character" | "prop" | "mood";
  mode: "standard" | "reminder" | "free";
  title: string;
  scriptText: string;
  fields: Record<string, string>;
  referenceAssets: Array<{
    assetId: string;
    kind?: "image" | "video" | "audio" | "text";
    role: string;
    note?: string;
    assetVersion?: AssetVersionReference;
  }>;
  validationResult: {
    ok: boolean;
    severity: "none" | "warning" | "error";
    messages: string[];
  };
  prompt: string;
  finalPrompt: string;
  resultAssetIds: string[];
  primaryAssetId?: string;
  status: "draft" | "prompt_ready" | "generated" | "archived";
  metadata?: {
    productionBibleItemId?: string;
    assetBreakdownItemId?: string;
    agentRunId?: string;
    agentConfigId?: string;
    agentConfigVersion?: string;
    agentAssetKind?: string;
    suggestedBriefKind?: string;
    tags?: string[];
    warnings?: string[];
    shotGroupId?: string;
    shotIds?: string[];
    briefSnapshot?: Record<string, unknown>;
  };
  createdAt: string;
  updatedAt: string;
};
```

校验规则：

- `standard`：核心字段缺失时 `severity=error`，状态保持 `draft`。
- `reminder`：核心字段缺失时 `severity=warning`，允许进入 `prompt_ready`。
- `free`：跳过结构化字段检查，适合人工自由提示词。

来源关系：

- 资产拆解条目创建 Brief 时写入 `sourceType=asset_breakdown`、`sourceId` 和 `metadata.assetBreakdownItemId`。
- M6.9.4 起，从本集生图需求创建 Brief 时还会写入 `metadata.agentRunId / agentConfigId / agentConfigVersion / agentAssetKind / suggestedBriefKind / tags / warnings`，用于从 Brief、配置节点和生成素材反查资产提取 Agent 来源。
- 设定库创建 Brief 时写入 `sourceType=production_bible`、`metadata.productionBibleItemId`，并带入 `assetRefs`。
- 生成镜头组创建氛围 Brief 时写入 `sourceType=storyboard`、`metadata.shotGroupId / shotIds`。

当前限制：

- 第一版只做 Brief 数据、校验、提示词拼装、复制和入口打通。
- 不接真实 LLM，不自动理解剧本，不自动触发图片生成。
- M6.7.1 起，Brief 可创建图片生成配置节点；节点 metadata 会写入 `briefId / briefKind / briefMode / briefSnapshot / finalPrompt / sourceType / sourceId / episodeId / episodeTitle / assetBreakdownItemId / productionBibleItemId / shotGroupId / shotIds / referenceAssets`。
- M6.9.4 起，由本集生图需求创建的图片配置节点还会写入 `agentRunId / agentConfigId / agentConfigVersion`，并继续带上 `assetBreakdownItemId / episodeId / episodeTitle / sourceType / finalPrompt`。创建配置节点只写画布节点，不自动触发图片生成。
- 图片生成成功后，自动入库素材的 `metadata.generation` 会补充 `briefId / briefSnapshot / finalPrompt / referenceAssets / sourceType / sourceId`，并回写 Brief 的 `resultAssetIds`。
- M6.9.4 起，自动入库素材的 `metadata.generation` 也会保留 `assetBreakdownItemId / agentRunId / agentConfigId / agentConfigVersion / episodeId / episodeTitle`；如果结果素材来自本集生图需求，会同步回写需求 `assetIds / status`。
- M8 起，自动入库素材的 `metadata.generation` 会同步记录 `aiTaskId / upstreamTaskId / aiTaskStatus / aiTaskCredits / creditLogId / creditsRefunded / refundedAt / finishedAt`。如果素材来自画布视频，还会继续保留 `taskId / storyboardGroupId / storyboardShotId / shotGroupId / shotIds`，并把入库后的 `assetId` 反写到后端 `ai_tasks.response_json.frontendArtifacts`，供后台 AI 任务日志反查。
- 如果 Brief 来源是资产拆解条目，生成结果 assetId 会写回 `AssetBreakdownItem.assetIds`，状态更新为 `generated`。
- 如果 Brief 来源是设定库，生成结果可同步写入 `ProductionBibleItem.assetRefs`。
- M6.7.1 不新增图片生成接口，不接真实 LLM，不自动扣费；真实生图仍由用户通过现有图片生成配置节点触发。
- M6.7.2 起，Brief 结果列表会读取素材 `metadata.generation` 和素材版本历史，展示生成时间、模型、provider、finalPrompt、参考素材数量和当前版本号。
- `primaryAssetId` 只记录 Brief 当前主参考图；切换主参考不修改素材本体，也不改变素材版本历史。同步到资产拆解或设定库需要用户显式点击。
- M6.7.3 起，Brief 工作台可把当前项目 / 当前筛选结果导出为 CSV 或 JSON。导出视图包括“美术设定表”“生图提示词表”“分镜资产表”，只读取 Brief 和素材摘要，不写入 localforage。
