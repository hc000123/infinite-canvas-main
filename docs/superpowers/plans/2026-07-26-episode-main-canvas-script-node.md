# Episode Main Canvas Script Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create one editable “本集剧本” text node when an episode main canvas is created for the first time, preferring the confirmed optimized script and falling back to the original script.

**Architecture:** Keep script selection in `canvas-episode-context.ts`, where episode fields already become the immutable canvas snapshot. Add one focused node factory for the initial text node, and invoke it only inside the new-main-canvas branch of `ensureEpisodeMainCanvas`; the existing-main and child-canvas branches remain non-initializing.

**Tech Stack:** Next.js App Router, React, TypeScript, Zustand, Node.js test runner

---

## File map

- Modify `web/src/app/(user)/canvas/utils/canvas-episode-context.ts`: select the optimized production script for canvas snapshots, with the original script as fallback.
- Modify `web/src/app/(user)/canvas/utils/canvas-episode-context.test.mts`: cover optimized-script preference and original-script fallback.
- Create `web/src/app/(user)/canvas/utils/episode-main-canvas-script-node.ts`: build the single initial text node from a canvas episode context.
- Modify `web/src/app/(user)/canvas/stores/use-canvas-store.ts`: initialize the new episode main canvas with the script node while preserving existing-main and child behavior.
- Create `web/src/app/(user)/canvas/stores/use-canvas-store.test.mts`: verify first-create, re-entry, and child-canvas behavior through the real Zustand actions.
- Modify `docs/pending-test.md`: record the new user-verifiable behavior.
- Modify `docs/todo.md`: update the implemented M6.6.1 summary without creating a new pending item.

The relevant implementation files already contain uncommitted user work. Do not stage or commit those overlapping changes; use targeted diffs and leave implementation changes in the working tree for the user.

### Task 1: Select the correct script for a new canvas

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/canvas-episode-context.test.mts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-episode-context.ts`

- [ ] **Step 1: Write the failing optimized-script and fallback tests**

Append these tests before the local `episode` helper:

```ts
test("canvas episode context prefers the confirmed optimized script", () => {
    const optimizedEpisode = { ...episode("episode-1", "第一集"), sourceSummary: "原剧本", summary: "优化后剧本" };
    const context = canvasEpisodeContextFromEpisode("project-1", optimizedEpisode);
    assert.equal(context.scriptSnapshot, "优化后剧本");
});

test("canvas episode context falls back to the original script", () => {
    const sourceEpisode = { ...episode("episode-1", "第一集"), sourceSummary: "完整原剧本", summary: "" };
    const context = canvasEpisodeContextFromEpisode("project-1", sourceEpisode);
    assert.match(context.scriptSnapshot, /完整原剧本/);
});
```

- [ ] **Step 2: Run the focused test and verify the optimized-script case fails**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-episode-context.test.mts'
```

Expected: FAIL because `scriptSnapshot` still contains the original script rather than exactly `优化后剧本`.

- [ ] **Step 3: Add the canvas-specific script selector**

Add this function immediately before `buildEpisodeScriptSnapshot`:

```ts
export function buildEpisodeCanvasScriptText(episode: ScriptEpisode, scenes: ScriptScene[] = []) {
    const optimizedScript = episode.sourceSummary?.trim() ? episode.summary.trim() : "";
    return optimizedScript || buildEpisodeScriptSnapshot(episode, scenes);
}
```

Update `canvasEpisodeContextFromEpisode` to use it:

```ts
export function canvasEpisodeContextFromEpisode(projectId: string, episode: ScriptEpisode, scenes: ScriptScene[] = []): CanvasEpisodeContext {
    return {
        episodeId: episode.id,
        episodeTitle: episode.title,
        scriptId: projectId,
        scriptSnapshot: buildEpisodeCanvasScriptText(episode, scenes),
    };
}
```

- [ ] **Step 4: Run the focused test and verify both cases pass**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-episode-context.test.mts'
```

Expected: PASS with all tests in the file green, including the existing test that keeps `buildEpisodeScriptSnapshot` itself original-script-first.

### Task 2: Initialize only the first episode main canvas with a text node

**Files:**
- Create: `web/src/app/(user)/canvas/stores/use-canvas-store.test.mts`
- Create: `web/src/app/(user)/canvas/utils/episode-main-canvas-script-node.ts`
- Modify: `web/src/app/(user)/canvas/stores/use-canvas-store.ts`

- [ ] **Step 1: Write the failing store behavior test**

Create `use-canvas-store.test.mts` with:

```ts
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const sourceRoot = new URL("../../../../", import.meta.url);
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, sourceRoot).href, context);
        return nextResolve(specifier, context);
    },
});

const { useCanvasStore } = await import("./use-canvas-store.ts");

test("initializes the script node only for a newly created episode main canvas", () => {
    useCanvasStore.setState({ projects: [] });
    const input = {
        projectId: "project-1",
        title: "EP01-第一集",
        episodeContext: { episodeId: "episode-1", episodeTitle: "第一集", scriptId: "project-1", scriptSnapshot: "优化后剧本" },
    };

    const mainCanvasId = useCanvasStore.getState().ensureEpisodeMainCanvas(input);
    let mainCanvas = useCanvasStore.getState().projects.find((canvas) => canvas.id === mainCanvasId);
    assert.equal(mainCanvas?.nodes.length, 1);
    assert.equal(mainCanvas?.nodes[0]?.type, "text");
    assert.equal(mainCanvas?.nodes[0]?.title, "本集剧本");
    assert.equal(mainCanvas?.nodes[0]?.metadata?.content, "优化后剧本");

    const editedNode = { ...mainCanvas!.nodes[0], metadata: { ...mainCanvas!.nodes[0].metadata, content: "画布内已编辑" } };
    useCanvasStore.getState().updateProject(mainCanvasId, { nodes: [editedNode] });
    assert.equal(useCanvasStore.getState().ensureEpisodeMainCanvas({ ...input, episodeContext: { ...input.episodeContext, scriptSnapshot: "更新后优化稿" } }), mainCanvasId);
    mainCanvas = useCanvasStore.getState().projects.find((canvas) => canvas.id === mainCanvasId);
    assert.equal(mainCanvas?.nodes.length, 1);
    assert.equal(mainCanvas?.nodes[0]?.metadata?.content, "画布内已编辑");

    const childCanvasId = useCanvasStore.getState().createEpisodeChildCanvas(mainCanvasId, "分场画布");
    const childCanvas = useCanvasStore.getState().projects.find((canvas) => canvas.id === childCanvasId);
    assert.deepEqual(childCanvas?.nodes, []);

    const emptyMainCanvasId = useCanvasStore.getState().ensureEpisodeMainCanvas({
        ...input,
        episodeContext: { ...input.episodeContext, episodeId: "episode-2", scriptSnapshot: "  " },
    });
    assert.deepEqual(useCanvasStore.getState().projects.find((canvas) => canvas.id === emptyMainCanvasId)?.nodes, []);
    useCanvasStore.setState({ projects: [] });
});
```

- [ ] **Step 2: Run the store test and verify it fails on the empty main-canvas node list**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/stores/use-canvas-store.test.mts'
```

Expected: FAIL at `assert.equal(mainCanvas?.nodes.length, 1)` because the current creation branch initializes `nodes: []`.

- [ ] **Step 3: Create the focused script-node factory**

Create `episode-main-canvas-script-node.ts` with:

```ts
import { getNodeSpec } from "../constants.ts";
import { CanvasNodeType, type CanvasNodeData } from "../types.ts";
import type { CanvasEpisodeContext } from "./canvas-episode-context.ts";

export function createEpisodeMainCanvasScriptNode(context: CanvasEpisodeContext): CanvasNodeData | undefined {
    const content = context.scriptSnapshot.trim();
    if (!content) return undefined;
    const spec = getNodeSpec(CanvasNodeType.Text);
    return {
        id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: CanvasNodeType.Text,
        title: "本集剧本",
        position: { x: 40, y: 40 },
        width: spec.width,
        height: spec.height,
        metadata: { ...spec.metadata, content, status: "success" },
    };
}
```

- [ ] **Step 4: Use the factory only in the new-main-canvas branch**

Add the import:

```ts
import { createEpisodeMainCanvasScriptNode } from "../utils/episode-main-canvas-script-node";
```

Immediately before constructing the new main canvas, create the optional node:

```ts
const scriptNode = createEpisodeMainCanvasScriptNode(episodeContext);
```

Change only the new main canvas object's `nodes` field:

```ts
nodes: scriptNode ? [scriptNode] : [],
```

Do not change the existing-main branch, which must preserve its current `nodes`, or the child-canvas branch, which must continue to set `nodes: []`.

- [ ] **Step 5: Run both focused test files**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-episode-context.test.mts' 'src/app/(user)/canvas/stores/use-canvas-store.test.mts'
```

Expected: PASS; the first main canvas has one script node, re-entry preserves edited node content, and the child canvas remains empty.

### Task 3: Record the feature for user verification

**Files:**
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md`

- [ ] **Step 1: Add the pending-test entry**

Under `## 当前版本验收清单`, add:

```md
### 分集主画布自动带入剧本节点

- 首次创建本集主画布时，默认可见区域会自动出现一个可编辑的“本集剧本”文本节点。
- 分集已有优化稿时优先带入优化稿；未优化时自动回退到原剧本。
- 重新进入已有主画布不会重复创建或覆盖节点，新建子画布也不会自动带入。
- 待页面确认：分别对“已有优化稿”和“仅有原剧本”的分集首次创建主画布，检查节点内容；编辑节点后重新进入，确认内容未被覆盖；再创建子画布，确认子画布仍为空画布。
```

- [ ] **Step 2: Update the M6.6.1 implemented summary**

In the existing `M6.6.1：分集主画布与剧本导入` status paragraph, add one concise sentence:

```md
首次创建分集主画布时会自动创建“本集剧本”文本节点，优先使用优化稿并在没有优化稿时回退到原剧本。
```

- [ ] **Step 3: Run final targeted verification**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-episode-context.test.mts' 'src/app/(user)/canvas/stores/use-canvas-store.test.mts'
cd .. && git diff --check -- 'web/src/app/(user)/canvas/utils/canvas-episode-context.ts' 'web/src/app/(user)/canvas/utils/canvas-episode-context.test.mts' 'web/src/app/(user)/canvas/utils/episode-main-canvas-script-node.ts' 'web/src/app/(user)/canvas/stores/use-canvas-store.ts' 'web/src/app/(user)/canvas/stores/use-canvas-store.test.mts' 'docs/pending-test.md' 'docs/todo.md'
```

Expected: both test files PASS and `git diff --check` exits with no output.
