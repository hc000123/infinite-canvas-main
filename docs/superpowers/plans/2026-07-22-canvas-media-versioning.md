# Canvas Media Node Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make regenerated image and video results append complete versions inside the existing canvas node, with version-owned prompts and parameters that restore when switching versions.

**Architecture:** Store version snapshots in `CanvasNodeMetadata`, with pure utilities controlling snapshot, append, projection, hydration, and draft semantics. Existing image/video generation hooks gain an in-place branch for completed media nodes, while a shared UI action and compact control switch versions without changing node IDs or connections.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zustand, Ant Design, Tailwind CSS, Node test runner, localforage-backed image/media storage.

---

## File map

- Create `web/src/app/(user)/canvas/utils/canvas-media-versions.ts`: pure version and draft operations.
- Create `web/src/app/(user)/canvas/utils/canvas-media-versions.test.mts`: version behavior regression tests.
- Create `web/src/app/(user)/canvas/components/canvas-media-version-control.tsx`: compact version navigation and version list.
- Create `web/src/app/(user)/canvas/hooks/use-canvas-media-version-actions.ts`: dirty-draft confirmation and node switching.
- Modify `web/src/app/(user)/canvas/types.ts`: version and pending-task types.
- Modify `web/src/app/(user)/canvas/utils/canvas-page-helpers.ts`: hydrate every stored version URL.
- Modify `web/src/app/(user)/canvas/hooks/use-canvas-node-crud-actions.ts`: save generated-media input as draft.
- Modify `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`: initialize from current version, persist drafts, and label new-version generation.
- Modify `web/src/app/(user)/canvas/hooks/use-canvas-image-generation-actions.ts`: replace completed image content in place and append a version.
- Modify `web/src/app/(user)/canvas/hooks/use-canvas-video-generation-actions.ts`: run completed-video regeneration on the original node.
- Modify `web/src/app/(user)/canvas/hooks/use-canvas-video-task-recovery.ts`: complete pending in-place video versions after reload.
- Modify `web/src/app/(user)/canvas/hooks/use-canvas-video-task-refresh.ts`: complete pending in-place video versions after manual refresh.
- Modify `web/src/app/(user)/canvas/components/canvas-node-content.tsx`: render image version controls.
- Modify `web/src/app/(user)/canvas/components/canvas-video-node-content.tsx`: render video version controls.
- Modify `web/src/app/(user)/canvas/components/canvas-node.tsx`, `canvas-nodes-layer.tsx`, and `[id]/canvas-client-page.tsx`: wire switching actions without adding business logic to the page.
- Modify `docs/pending-test.md`: record user-visible behavior and manual checks.

### Task 1: Define and test media-version snapshots

**Files:**
- Modify: `web/src/app/(user)/canvas/types.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-media-versions.ts`
- Test: `web/src/app/(user)/canvas/utils/canvas-media-versions.test.mts`

- [ ] **Step 1: Write failing tests for lazy v1 creation, append, and switching**

```ts
test("appends v2 to a legacy generated node without changing node identity", () => {
    const next = appendCanvasMediaVersion(legacyImageNode, completedImageNode, "新的提示词", now);
    assert.equal(next.id, legacyImageNode.id);
    assert.deepEqual(next.metadata?.mediaVersions?.map((item) => [item.versionNumber, item.prompt]), [[1, "旧提示词"], [2, "新的提示词"]]);
    assert.equal(next.metadata?.currentMediaVersionId, next.metadata?.mediaVersions?.[1]?.id);
});

test("switching versions restores generated fields but preserves canvas bindings", () => {
    const switched = switchCanvasMediaVersion(versionedNode, "version-1");
    assert.equal(switched.metadata?.content, "blob:old");
    assert.equal(switched.metadata?.prompt, "旧提示词");
    assert.equal(switched.metadata?.productionPackageId, "P01");
});

test("prompt drafts do not mutate the current version prompt", () => {
    const edited = applyCanvasPromptDraft(versionedNode, "草稿提示词");
    assert.equal(edited.metadata?.prompt, "当前版本提示词");
    assert.equal(edited.metadata?.promptDraft, "草稿提示词");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-media-versions.test.mts'`

Expected: FAIL because `canvas-media-versions.ts` and its exports do not exist.

- [ ] **Step 3: Add version types**

```ts
export type CanvasMediaVersion = {
    id: string;
    versionNumber: number;
    kind: "image" | "video";
    createdAt: string;
    prompt: string;
    promptDocument?: CanvasPromptDocument;
    metadata: Partial<CanvasNodeMetadata>;
};

export type CanvasPendingMediaVersion = {
    prompt: string;
    promptDocument?: CanvasPromptDocument;
    startedAt: string;
};
```

Add `mediaVersions`, `currentMediaVersionId`, `promptDraft`, `promptDraftDocument`, and `pendingMediaVersion` to `CanvasNodeMetadata`.

- [ ] **Step 4: Implement pure version operations**

```ts
export function ensureCanvasMediaVersions(node: CanvasNodeData, createdAt = new Date().toISOString()): CanvasMediaVersion[];
export function appendCanvasMediaVersion(source: CanvasNodeData, completed: CanvasNodeData, prompt: string, createdAt: string, promptDocument?: CanvasPromptDocument): CanvasNodeData;
export function switchCanvasMediaVersion(node: CanvasNodeData, versionId: string): CanvasNodeData;
export function applyCanvasPromptDraft(node: CanvasNodeData, prompt: string, promptDocument?: CanvasPromptDocument): CanvasNodeData;
export function currentCanvasMediaVersion(node: CanvasNodeData): CanvasMediaVersion | undefined;
export function hasDirtyCanvasPromptDraft(node: CanvasNodeData): boolean;
```

Use an explicit `VERSION_METADATA_KEYS` array. Never snapshot `mediaVersions`, `currentMediaVersionId`, drafts, pending state, production bindings, batch fields, or canvas lineage into a version's `metadata` object.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-media-versions.test.mts'`

Expected: all media-version tests pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/\(user\)/canvas/types.ts web/src/app/\(user\)/canvas/utils/canvas-media-versions.ts web/src/app/\(user\)/canvas/utils/canvas-media-versions.test.mts
git commit -m "feat: add canvas media version snapshots"
```

### Task 2: Preserve prompts as drafts and hydrate historical media

**Files:**
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-node-crud-actions.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`
- Modify: `web/src/app/(user)/canvas/utils/canvas-page-helpers.ts`
- Test: `web/src/app/(user)/canvas/utils/canvas-media-versions.test.mts`

- [ ] **Step 1: Add failing tests for prompt source and version hydration**

```ts
test("uses a saved draft before the current version prompt", () => {
    assert.equal(canvasPromptEditorValue({ ...versionedNode, metadata: { ...versionedNode.metadata, promptDraft: "未生成草稿" } }), "未生成草稿");
});

test("hydrates every version storage key", async () => {
    const hydrated = await hydrateCanvasMediaVersionUrls(nodeWithStoredVersions, resolveImage, resolveMedia);
    assert.equal(hydrated.metadata?.mediaVersions?.[0]?.metadata.content, "blob:resolved-old");
    assert.equal(hydrated.metadata?.mediaVersions?.[1]?.metadata.content, "blob:resolved-new");
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-media-versions.test.mts'`

Expected: FAIL for missing editor-value and hydration helpers.

- [ ] **Step 3: Implement draft persistence**

Change `handleNodePromptChange` so completed image/video nodes write `promptDraft` and `promptDraftDocument`; empty/config/text nodes continue writing `prompt` and `promptDocument`.

```ts
const isGeneratedMedia = (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) && Boolean(node.metadata?.content);
const patch = isGeneratedMedia
    ? { promptDraft: prompt, ...(promptDocument ? { promptDraftDocument: promptDocument } : {}) }
    : { prompt, ...(promptDocument ? { promptDocument } : {}) };
```

Initialize the prompt panel with `canvasPromptEditorValue(node)` and call `onPromptChange` for generated media edits instead of keeping them only in component-local state.

- [ ] **Step 4: Hydrate every version URL**

Add `hydrateCanvasMediaVersionUrls` to the pure utility and call it from `hydrateCanvasImages`. Resolve `image:*` keys with `resolveImageUrl` and video/media keys with `resolveMediaUrl`, leaving stored keys unchanged.

- [ ] **Step 5: Run focused tests and TypeScript**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-media-versions.test.mts' && npm run typecheck`

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/\(user\)/canvas/hooks/use-canvas-node-crud-actions.ts web/src/app/\(user\)/canvas/components/canvas-node-prompt-panel.tsx web/src/app/\(user\)/canvas/utils/canvas-page-helpers.ts web/src/app/\(user\)/canvas/utils/canvas-media-versions.ts web/src/app/\(user\)/canvas/utils/canvas-media-versions.test.mts
git commit -m "feat: preserve media prompt drafts"
```

### Task 3: Generate image versions in place

**Files:**
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-image-generation-actions.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-node-status.ts`
- Test: `web/src/app/(user)/canvas/utils/canvas-node-status.test.mts`
- Test: `web/src/app/(user)/canvas/utils/canvas-media-versions.test.mts`

- [ ] **Step 1: Write a failing in-place image completion test**

```ts
test("completed image regeneration appends a version on the same node", () => {
    const next = applyCompletedImageVersionToNodes([source, downstream], source.id, completed, "新提示词", now);
    assert.deepEqual(next.map((node) => node.id), [source.id, downstream.id]);
    assert.equal(next[0].metadata?.mediaVersions?.length, 2);
    assert.equal(next[0].metadata?.promptDraft, undefined);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-node-status.test.mts'`

Expected: FAIL for missing `applyCompletedImageVersionToNodes`.

- [ ] **Step 3: Add the completed-image branch**

In `generateImageNode`, detect `sourceNode.type === "image" && sourceNode.metadata?.content`. Force `count = 1`, keep the current content visible while setting status to loading, call the existing generation request once, and replace only `nodeId` with `appendCanvasMediaVersion(...)` after success. Do not call `createImageGenerationNodes` and do not add connections in this branch.

On failure, restore status to success, keep current content and versions, set `errorDetails`, and retain `promptDraft`.

- [ ] **Step 4: Archive the new version**

Build the generated asset from the completed current node. After `archiveGeneratedAsset` returns, patch both top-level `sourceAssetId` and the current version snapshot through `patchCurrentCanvasMediaVersion`.

- [ ] **Step 5: Run focused and image-generation tests**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-node-status.test.mts' 'src/app/(user)/canvas/utils/canvas-media-versions.test.mts' 'src/app/(user)/canvas/utils/canvas-generation-nodes.test.mts'`

Expected: all tests pass; existing first-generation and batch behavior stays unchanged.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/\(user\)/canvas/hooks/use-canvas-image-generation-actions.ts web/src/app/\(user\)/canvas/utils/canvas-node-status.ts web/src/app/\(user\)/canvas/utils/canvas-node-status.test.mts web/src/app/\(user\)/canvas/utils/canvas-media-versions.ts web/src/app/\(user\)/canvas/utils/canvas-media-versions.test.mts
git commit -m "feat: regenerate images as node versions"
```

### Task 4: Generate and recover video versions in place

**Files:**
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-video-generation-actions.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-video-task-recovery.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-video-task-refresh.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-generation-nodes.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-node-status.ts`
- Test: `web/src/app/(user)/canvas/utils/canvas-generation-nodes.test.mts`
- Test: `web/src/app/(user)/canvas/utils/canvas-media-versions.test.mts`

- [ ] **Step 1: Write failing tests for in-place video creation and recovery completion**

```ts
test("completed video regeneration targets the existing node", () => {
    const result = createVideoGenerationNode({ nodeId: source.id, sourceNode: source, sourceConnections: [], prompt: "新提示词", spec, metadata, replaceExistingResult: true });
    assert.equal(result.videoId, source.id);
    assert.deepEqual(result.connections, []);
    assert.equal(result.videoNode.metadata?.content, source.metadata?.content);
});

test("recovered pending video appends a version", () => {
    const completed = completePendingCanvasMediaVersion(pendingNode, completedMetadata, now);
    assert.equal(completed.metadata?.mediaVersions?.length, 2);
    assert.equal(completed.metadata?.pendingMediaVersion, undefined);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-generation-nodes.test.mts' 'src/app/(user)/canvas/utils/canvas-media-versions.test.mts'`

Expected: FAIL for the new argument and pending completion helper.

- [ ] **Step 3: Start video version tasks on the existing node**

Add `replaceExistingResult?: boolean` to `createVideoGenerationNode`. When true, reuse `nodeId`, copy source media metadata, add no connection, and persist `ensureCanvasMediaVersions(sourceNode)` plus `pendingMediaVersion` before polling.

In `generateVideoNode`, set `replaceExistingResult` for completed video sources. Keep the old video content while task fields update. On normal success, call `completePendingCanvasMediaVersion` and clear the draft. On explicit failure, clear pending state, restore the selected version, keep the draft, and expose the error.

- [ ] **Step 4: Complete recoverable versions**

In both recovery hooks, after downloading and caching a successful task, call `completePendingCanvasMediaVersion` when `pendingMediaVersion` exists; otherwise retain the legacy completion path. Archive the completed version and patch its `sourceAssetId`.

- [ ] **Step 5: Run focused tests and TypeScript**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-generation-nodes.test.mts' 'src/app/(user)/canvas/utils/canvas-media-versions.test.mts' 'src/app/(user)/canvas/utils/canvas-video-task-recovery.test.mts' && npm run typecheck`

Expected: all tests and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/\(user\)/canvas/hooks/use-canvas-video-generation-actions.ts web/src/app/\(user\)/canvas/hooks/use-canvas-video-task-recovery.ts web/src/app/\(user\)/canvas/hooks/use-canvas-video-task-refresh.ts web/src/app/\(user\)/canvas/utils/canvas-generation-nodes.ts web/src/app/\(user\)/canvas/utils/canvas-node-status.ts web/src/app/\(user\)/canvas/utils/canvas-media-versions.ts web/src/app/\(user\)/canvas/utils/*.test.mts
git commit -m "feat: regenerate videos as node versions"
```

### Task 5: Add version switching UI and dirty-draft confirmation

**Files:**
- Create: `web/src/app/(user)/canvas/components/canvas-media-version-control.tsx`
- Create: `web/src/app/(user)/canvas/hooks/use-canvas-media-version-actions.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-content.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-video-node-content.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-nodes-layer.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

- [ ] **Step 1: Implement the version action hook**

```ts
export function useCanvasMediaVersionActions({ modal, setNodes }: Options) {
    const switchMediaVersion = useCallback((node: CanvasNodeData, versionId: string) => {
        const apply = () => setNodes((items) => items.map((item) => item.id === node.id ? switchCanvasMediaVersion(item, versionId) : item));
        if (!hasDirtyCanvasPromptDraft(node)) return apply();
        modal.confirm({
            title: "提示词修改尚未生成",
            content: "切换版本会放弃当前修改，是否继续？",
            okText: "放弃并切换",
            cancelText: "继续编辑",
            onOk: apply,
        });
    }, [modal, setNodes]);
    return { switchMediaVersion };
}
```

- [ ] **Step 2: Build the compact version control**

Render previous/next buttons and a center dropdown labeled `vN / total`. The dropdown list contains media preview, time, model/size summary, and one-line prompt. Return `null` for fewer than two versions and disable all actions while the node is generating.

- [ ] **Step 3: Wire controls into media nodes and prompt panels**

Place the overlay at the top center of image and video content. Add a panel variant above the prompt editor. Pass `onSwitchMediaVersion` through `CanvasNode`, `CanvasNodesLayer`, and the page assembly layer; keep the switch implementation in the new hook.

- [ ] **Step 4: Clarify generate actions**

For completed media nodes set `aria-label`, title, and visible copy to `生成新版本`; use `生成` for empty/config/text nodes. Disable switching and submitting while a version task runs.

- [ ] **Step 5: Run TypeScript and targeted ESLint**

Run: `cd web && npm run typecheck && npx eslint 'src/app/(user)/canvas/[id]/canvas-client-page.tsx' 'src/app/(user)/canvas/components/canvas-media-version-control.tsx' 'src/app/(user)/canvas/components/canvas-node-content.tsx' 'src/app/(user)/canvas/components/canvas-video-node-content.tsx' 'src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx' 'src/app/(user)/canvas/components/canvas-node.tsx' 'src/app/(user)/canvas/components/canvas-nodes-layer.tsx' 'src/app/(user)/canvas/hooks/use-canvas-media-version-actions.ts'`

Expected: 0 errors; existing `<img>` optimization warnings may remain.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/\(user\)/canvas/components web/src/app/\(user\)/canvas/hooks/use-canvas-media-version-actions.ts web/src/app/\(user\)/canvas/\[id\]/canvas-client-page.tsx
git commit -m "feat: add canvas media version switching"
```

### Task 6: Document, verify, and deploy

**Files:**
- Modify: `docs/pending-test.md`
- Check: `docs/todo.md`

- [ ] **Step 1: Update the pending-test checklist**

Add a section covering image/video in-place versions, prompt restoration, dirty-draft confirmation, stable node/connection counts, recoverable tasks, and failed-generation rollback. Do not move the feature to `docs/features.md` until the user validates it.

- [ ] **Step 2: Run full verification**

Run:

```bash
cd web
npm test
npm run typecheck
npx eslint 'src/app/(user)/canvas/**/*.{ts,tsx}'
```

Expected: all tests pass, typecheck exits 0, and ESLint has no errors.

- [ ] **Step 3: Verify the final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; the pre-existing untracked `findings.md`, `progress.md`, and `task_plan.md` remain untouched.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/pending-test.md docs/todo.md
git commit -m "docs: add canvas media version checks"
```

- [ ] **Step 5: Rebuild the local Docker page**

Run: `cd web && npm run docker:up`

Expected: Next.js production build succeeds and `infinite-canvas-main-app-1` becomes healthy.

- [ ] **Step 6: Verify deployed runtime**

Run:

```bash
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' | rg 'infinite-canvas-main-app-1'
curl -sS --max-time 10 -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:3000/canvas
```

Expected: container reports `healthy` and canvas returns HTTP 200.
