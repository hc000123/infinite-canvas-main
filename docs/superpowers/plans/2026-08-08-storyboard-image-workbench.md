# 分镜制作工作台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留资产生图与回写链路的前提下，把普通 `/image` 升级为按项目、集数和镜头工作的分镜制作台。

**Architecture:** `/image` 顶层按查询参数选择资产模式或分镜模式，现有资产工作台作为独立子组件原样保留。分镜模式直接读写 `useStoryboardStore.tableShots`，并在同一 localforage store 中保存逐镜提示词、参数、参考图、候选图和最终选择；图片请求继续复用现有 generation/edit API、模型配置、图片存储与正式资产库。

**Tech Stack:** Next.js App Router、React 19、TypeScript、Ant Design 6、Tailwind CSS、Zustand、localforage、file-saver、Node test runner。

**Project verification rule:** 本项目默认不执行测试、TypeScript 检查或构建；计划保留精确命令供用户明确要求验收时使用，实施阶段只做代码与静态变更范围检查。

---

### Task 1: 分镜工作台纯函数与路由判定

**Files:**
- Create: `web/src/app/(user)/image/storyboard-workbench.ts`
- Create: `web/src/app/(user)/image/storyboard-workbench.test.mts`

- [x] **Step 1: 写纯函数测试**

覆盖资产模式判定、默认提示词、分集过滤、配置复用、拖拽排序和正式资产输入：

```ts
assert.equal(isAssetImageWorkbenchContext(new URLSearchParams("assetId=a1")), true);
assert.equal(isAssetImageWorkbenchContext(new URLSearchParams("projectId=p1&episodeId=e1")), false);
assert.match(defaultShotImagePrompt(shot), /中景/);
assert.deepEqual(reorderShotIds(["s1", "s2", "s3"], "s3", "s1"), ["s3", "s1", "s2"]);
assert.equal("selectedCandidateId" in copyableShotConfig(source), false);
assert.equal(storyboardCandidateAssetInput(shot, candidate).metadata?.storyboardShotId, shot.id);
```

- [x] **Step 2: 实现纯函数**

导出：

```ts
isAssetImageWorkbenchContext(params: Pick<URLSearchParams, "get">): boolean;
defaultShotImagePrompt(shot: StoryboardTableShot): string;
orderedEpisodeShots(shots, canvasId, episodeId): StoryboardTableShot[];
reorderShotIds(ids, activeId, overId): string[];
copyableShotConfig(source): Pick<StoryboardTableShot, "imagePrompt" | "imageConfig">;
referenceToken(index): string;
buildShotReferencePrompt(prompt, references): string;
storyboardCandidateAssetInput(shot, candidate): AssetWriteInput;
```

资产模式判定只读取 `libraryAssetId`、`assetId`、`briefId`；单独的 `projectId`、`episodeId` 或 `source=storyboard` 不得误入资产模式。

- [ ] **Step 3: 定向验证命令（仅用户明确要求时执行）**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/image/storyboard-workbench.test.mts'`

Expected: PASS。

- [x] **Step 4: 提交**

```bash
git add 'web/src/app/(user)/image/storyboard-workbench.ts' 'web/src/app/(user)/image/storyboard-workbench.test.mts'
git commit -m "feat: add storyboard workbench helpers"
```

### Task 2: 扩展分镜表与工作台图片持久化

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/storyboard-management.ts`
- Modify: `web/src/app/(user)/canvas/stores/use-storyboard-store.ts`
- Modify: `web/src/app/(user)/canvas/utils/storyboard-management.test.mts`
- Create: `web/src/app/(user)/canvas/stores/use-storyboard-workbench-store.test.mts`

- [x] **Step 1: 扩展类型**

增加：

```ts
export type StoryboardImageConfig = {
  imageModel: string;
  quality: string;
  size: string;
  count: string;
};

export type StoryboardWorkbenchImage = {
  id: string;
  projectId: string;
  canvasId: string;
  episodeId: string;
  shotId: string;
  role: "reference" | "candidate";
  source: "upload" | "clipboard" | "asset" | "generation";
  sourceAssetId?: string;
  savedAssetId?: string;
  title: string;
  dataUrl: string;
  storageKey?: string;
  width: number;
  height: number;
  bytes: number;
  mimeType?: string;
  durationMs?: number;
  prompt?: string;
  model?: string;
  quality?: string;
  size?: string;
  createdAt: string;
};
```

`StoryboardTableShot` 增加 `imagePrompt?: string`、`imageConfig?: StoryboardImageConfig`、`referenceImageIds?: string[]`、`selectedCandidateId?: string`。`normalizeStoryboardTableShot` trim 文本、规范 count，并对引用 ID 去重。

- [x] **Step 2: 增加 store 动作**

```ts
workbenchImages: StoryboardWorkbenchImage[];
reorderTableShot(activeId: string, overId: string): void;
addWorkbenchImage(input: Omit<StoryboardWorkbenchImage, "id" | "createdAt">): string;
updateWorkbenchImage(id: string, patch: Partial<StoryboardWorkbenchImage>): void;
removeWorkbenchImage(id: string): void;
selectCandidate(shotId: string, candidateId?: string): void;
```

`removeTableShot` 同时移除该镜头的工作台图片记录和其他镜头不可达的引用 ID；正式资产不删除。持久化时有 `storageKey` 的工作台图片清空 `dataUrl`，hydrate 时通过 `resolveImageUrl` 恢复。拖拽排序只重排相同 `projectId + canvasId + episodeId` 作用域。

- [x] **Step 3: 覆盖 store 行为测试**

```ts
const candidateId = store.addWorkbenchImage(candidateInput);
store.selectCandidate(shotId, candidateId);
assert.equal(store.tableShots.find((shot) => shot.id === shotId)?.selectedCandidateId, candidateId);
store.selectCandidate(shotId);
assert.equal(store.tableShots.find((shot) => shot.id === shotId)?.selectedCandidateId, undefined);
```

同时覆盖候选跨镜头不可选、删除镜头清理工作台记录、配置字段规范化和拖拽排序。

- [ ] **Step 4: 定向验证命令（仅用户明确要求时执行）**

Run:

```bash
cd web && node --experimental-strip-types --test \
  'src/app/(user)/canvas/utils/storyboard-management.test.mts' \
  'src/app/(user)/canvas/stores/use-storyboard-workbench-store.test.mts'
```

Expected: PASS。

- [x] **Step 5: 提交**

```bash
git add 'web/src/app/(user)/canvas/utils/storyboard-management.ts' 'web/src/app/(user)/canvas/stores/use-storyboard-store.ts' 'web/src/app/(user)/canvas/utils/storyboard-management.test.mts' 'web/src/app/(user)/canvas/stores/use-storyboard-workbench-store.test.mts'
git commit -m "feat: persist storyboard image candidates"
```

### Task 3: 保留资产模式并建立分镜模式路由

**Files:**
- Modify: `web/src/app/(user)/image/page.tsx`
- Create: `web/src/app/(user)/image/image-workbench-mode-wiring.test.mts`

- [x] **Step 1: 将现有页面变为资产子组件**

把当前默认组件改名并导出：

```tsx
export function AssetImageWorkbench() {
  // 保留现有全部 hook、生成、回写、Skill、历史记录和弹窗逻辑
}
```

不得修改 `saveResultToAssets`、`parseImageWorkbenchSourceContext`、`CapabilityRunDrawer` 或 `buildImageWorkbenchHref` 契约。

- [x] **Step 2: 增加顶层分流**

```tsx
export default function ImagePage() {
  const searchParams = useSearchParams();
  return isAssetImageWorkbenchContext(searchParams)
    ? <AssetImageWorkbench />
    : <StoryboardImageWorkbench />;
}
```

静态接线测试确认普通 `/image` 导入并渲染 `StoryboardImageWorkbench`，资产参数仍渲染 `AssetImageWorkbench`，原回写相关标识仍存在。

- [ ] **Step 3: 定向验证命令（仅用户明确要求时执行）**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/image/image-workbench-mode-wiring.test.mts' 'src/app/(user)/image/image-capability-wiring.test.mts'`

Expected: PASS。

- [x] **Step 4: 提交**

```bash
git add 'web/src/app/(user)/image/page.tsx' 'web/src/app/(user)/image/image-workbench-mode-wiring.test.mts'
git commit -m "feat: route image entry to storyboard workbench"
```

### Task 4: 项目、集数与分镜槽位工作台

**Files:**
- Create: `web/src/app/(user)/image/storyboard-image-workbench.tsx`
- Create: `web/src/app/(user)/image/components/storyboard-shot-rail.tsx`
- Create: `web/src/app/(user)/image/storyboard-workbench-wiring.test.mts`

- [x] **Step 1: 建立上下文选择**

组件读取：

```ts
useCreativeProjectStore(state => state.projects);
useScriptStore(state => state.episodes);
useCanvasStore(state => state.projects);
useStoryboardStore(state => state.tableShots);
```

项目只显示 `status === "active"`，集数按项目和 `order` 排序。优先使用 URL 中有效值，其次使用 user-scoped localforage 上次值，最后选择第一个可用项目和第一集。项目或集数为空时显示明确空状态。

- [x] **Step 2: 实现槽位增删与拖拽**

新增槽位调用 `ensureEpisodeMainCanvas` 后写入完整 `StoryboardTableShotWriteInput`：

```ts
{
  projectId,
  canvasId,
  episodeId,
  sceneName: "未分场",
  location: "",
  timeOfDay: "",
  title: `镜头 ${order}`,
  scriptText: "",
  visualDescription: "",
  characters: [],
  dialogue: "",
  action: "",
  emotion: "",
  shotSize: "",
  cameraMovement: "",
  estimatedDuration: 5,
  assetNeeds: [],
  assetRefs: [],
  productionBibleRefs: [],
}
```

支持新增 1 个、批量新增 5 个、确认删除和 HTML5 drag/drop 排序。删除当前镜头后选择相邻槽位。轨道显示序号、标题、最终候选缩略图和状态。

- [x] **Step 3: 实现响应式骨架**

桌面为顶部上下文栏、横向槽位轨道、`minmax(360px, 420px) minmax(0,1fr)` 双栏；移动端单列，轨道保持横向滚动。使用 `studio-*` token、Ant Design 和 lucide 图标。

- [ ] **Step 4: 定向验证命令（仅用户明确要求时执行）**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/image/storyboard-workbench-wiring.test.mts'`

Expected: PASS。

- [x] **Step 5: 提交**

```bash
git add 'web/src/app/(user)/image/storyboard-image-workbench.tsx' 'web/src/app/(user)/image/components/storyboard-shot-rail.tsx' 'web/src/app/(user)/image/storyboard-workbench-wiring.test.mts'
git commit -m "feat: add storyboard shot workspace"
```

### Task 5: 逐镜提示词、参考图与配置复用

**Files:**
- Create: `web/src/app/(user)/image/components/storyboard-shot-editor.tsx`
- Modify: `web/src/app/(user)/image/storyboard-image-workbench.tsx`
- Create: `web/src/app/(user)/image/storyboard-reference-wiring.test.mts`

- [x] **Step 1: 实现逐镜提示词**

镜头没有 `imagePrompt` 时显示 `defaultShotImagePrompt(shot)`，首次编辑或生成时保存到正式分镜表。编辑标题、场次、景别、运镜和画面描述时直接调用 `updateTableShot`。

- [x] **Step 2: 实现参考图来源**

支持素材库、剪切板和多文件上传。每张图经 `uploadImage` 后写入 `role: "reference"` 工作台图片，并把 ID 追加到当前镜头 `referenceImageIds`。参考图按顺序显示 `@参考图N`，点击使用现有光标插入算法插入提示词；移除只影响当前镜头。

- [x] **Step 3: 实现模型参数与复用**

复用 `ModelPicker`、`ImageSettingsPanel` 和全局有效配置。逐镜参数写入 `imageConfig`；“复用上一镜配置”复制提示词和图片参数，并为目标镜头克隆参考图工作台记录，不能复制候选或 `selectedCandidateId`。

- [ ] **Step 4: 定向验证命令（仅用户明确要求时执行）**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/image/storyboard-reference-wiring.test.mts' 'src/app/(user)/image/storyboard-workbench.test.mts'`

Expected: PASS。

- [x] **Step 5: 提交**

```bash
git add 'web/src/app/(user)/image/components/storyboard-shot-editor.tsx' 'web/src/app/(user)/image/storyboard-image-workbench.tsx' 'web/src/app/(user)/image/storyboard-reference-wiring.test.mts'
git commit -m "feat: edit storyboard image configurations"
```

### Task 6: 逐镜候选生成与失败重试

**Files:**
- Create: `web/src/app/(user)/image/use-storyboard-image-generation.ts`
- Create: `web/src/app/(user)/image/components/storyboard-candidate-grid.tsx`
- Modify: `web/src/app/(user)/image/storyboard-image-workbench.tsx`
- Create: `web/src/app/(user)/image/storyboard-generation.test.mts`

- [x] **Step 1: 冻结生成快照**

```ts
type StoryboardGenerationSnapshot = {
  shotId: string;
  projectId: string;
  canvasId: string;
  episodeId: string;
  prompt: string;
  requestPrompt: string;
  references: ReferenceImage[];
  config: AiConfig;
  model: string;
};
```

生成开始后所有回写使用快照里的 `shotId`，切换当前镜头不得改变归属。

- [x] **Step 2: 实现独立槽位请求**

提示词为空或模型未配置时阻断。无参考图调用 `requestGeneration`，有参考图调用 `requestEdit`；每个槽位固定 `count: "1"`，成功结果经 `uploadImage` 写入 `role: "candidate"`，trace 使用：

```ts
{
  projectId: snapshot.projectId,
  sourceType: "storyboard_image_generation",
  sourceId: snapshot.shotId,
  inputSummary: `${shot.title}；参考图 ${snapshot.references.length} 张`,
}
```

批次允许部分成功；失败槽位保留错误并使用同一快照重试。加载、切换镜头和复用配置均不得调用生成接口。

- [x] **Step 3: 实现候选栅格**

候选按创建时间倒序显示，卡片展示尺寸、耗时和选中状态。生成中和失败使用临时槽位，不写入正式分镜数据。

- [ ] **Step 4: 定向验证命令（仅用户明确要求时执行）**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/image/storyboard-generation.test.mts'`

Expected: PASS。

- [x] **Step 5: 提交**

```bash
git add 'web/src/app/(user)/image/use-storyboard-image-generation.ts' 'web/src/app/(user)/image/components/storyboard-candidate-grid.tsx' 'web/src/app/(user)/image/storyboard-image-workbench.tsx' 'web/src/app/(user)/image/storyboard-generation.test.mts'
git commit -m "feat: generate storyboard image candidates"
```

### Task 7: 最终选取、下载与正式资产保存

**Files:**
- Modify: `web/src/app/(user)/image/components/storyboard-candidate-grid.tsx`
- Modify: `web/src/app/(user)/image/storyboard-image-workbench.tsx`
- Modify: `web/src/app/(user)/image/storyboard-workbench.ts`
- Modify: `web/src/app/(user)/image/storyboard-workbench.test.mts`

- [x] **Step 1: 实现单选、取消和改选**

候选卡调用 `selectCandidate(shotId, candidateId)`；选中同一候选时取消，选择其他候选时直接替换。候选图不删除，轨道缩略图立即显示最终选择。

- [x] **Step 2: 实现候选动作**

- 下载：`saveAs(candidate.dataUrl, `${shot.title || "storyboard"}-${candidate.id}.png`)`。
- 加入参考图：克隆为当前镜头 `role: "reference"` 记录并追加引用 ID。
- 删除：若它是最终选择先取消，再移除工作台图片；正式资产不删除。
- 保存资产：若有 `savedAssetId` 直接提示已保存，否则调用 `addAssetOnce(storyboardCandidateAssetInput(...))` 并回写 `savedAssetId`。

正式资产 metadata 至少包含 `projectId`、`episodeId`、`canvasId`、`storyboardShotId`、`source: "storyboard-workbench"`、生成 prompt/model/size/quality。

- [ ] **Step 3: 定向验证命令（仅用户明确要求时执行）**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/image/storyboard-workbench.test.mts'`

Expected: PASS。

- [x] **Step 4: 提交**

```bash
git add 'web/src/app/(user)/image/components/storyboard-candidate-grid.tsx' 'web/src/app/(user)/image/storyboard-image-workbench.tsx' 'web/src/app/(user)/image/storyboard-workbench.ts' 'web/src/app/(user)/image/storyboard-workbench.test.mts'
git commit -m "feat: select and archive storyboard candidates"
```

### Task 8: 导航、文档与变更范围检查

**Files:**
- Modify: `web/src/constant/navigation-tools.ts`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `docs/superpowers/plans/2026-08-08-storyboard-image-workbench.md`

- [x] **Step 1: 更新顶部入口**

`navigationTools` 中 `slug: "image"` 的 `label` 改为“分镜制作台”，`shortLabel` 改为“分镜”，图标使用现有 lucide `Clapperboard`。

- [x] **Step 2: 更新计划与待验收**

在 `docs/pending-test.md` 当前版本首部记录：

- 普通 `/image` 的项目/集数选择、槽位增删排序、逐镜配置、参考图、候选生成、选取/取消、下载和保存资产。
- 资产卡 `/image?...` 的提示词预填、保存回写和返回路径回归。
- `/assets/[subjectId]` 内嵌生成回归。
- 浅色、深色和 390px 窄屏检查。
- 验收不得自动触发真实付费图片生成；真实生成需要用户另行明确确认。

检查 `docs/todo.md`；只有存在对应未完成事项时才移除或调整，不改无关路线图。

- [x] **Step 3: 静态变更范围检查**

Run:

```bash
git diff --check
git status --short
```

Expected: 无空白错误；只暂存本任务文件，用户已有改动保持未暂存。

- [ ] **Step 4: 完整定向验证命令（仅用户明确要求全面验收时执行）**

```bash
cd web && node --experimental-strip-types --test \
  'src/app/(user)/image/storyboard-workbench.test.mts' \
  'src/app/(user)/canvas/utils/storyboard-management.test.mts' \
  'src/app/(user)/canvas/stores/use-storyboard-workbench-store.test.mts' \
  'src/app/(user)/image/image-workbench-mode-wiring.test.mts' \
  'src/app/(user)/image/storyboard-workbench-wiring.test.mts' \
  'src/app/(user)/image/storyboard-reference-wiring.test.mts' \
  'src/app/(user)/image/storyboard-generation.test.mts' \
  'src/app/(user)/image/image-capability-wiring.test.mts'
```

Expected: 全部 PASS。

- [x] **Step 5: 提交**

```bash
git add web/src/constant/navigation-tools.ts docs/todo.md docs/pending-test.md docs/superpowers/plans/2026-08-08-storyboard-image-workbench.md
git commit -m "docs: add storyboard workbench acceptance checks"
```
