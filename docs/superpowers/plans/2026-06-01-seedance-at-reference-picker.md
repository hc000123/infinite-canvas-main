# Seedance @ Reference Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users type `@` in the canvas video prompt box and pick connected Seedance reference materials by labels such as `图片 1` and `视频 1`.

**Architecture:** Add small pure helpers for reference mention filtering and insertion, then pass the selected node's upstream references into `CanvasNodePromptPanel`. The UI remains local to the prompt panel and inserts the official Seedance label text, so the API payload continues to receive `图片 1` / `视频 1` instead of `@` syntax or Asset IDs.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Node `node:test`, existing canvas generation input helpers.

---

### Task 1: Pure @ Mention Helpers

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-reference-mentions.ts`
- Test: `web/src/app/(user)/canvas/utils/canvas-reference-mentions.test.mts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { applyReferenceMention, filterReferenceMentions } from "./canvas-reference-mentions.ts";

test("filters reference mentions by @ query", () => {
    const options = [
        { label: "图片 1", detail: "角色图" },
        { label: "图片 2", detail: "服装图" },
        { label: "视频 1", detail: "运镜参考" },
    ];

    assert.deepEqual(filterReferenceMentions(options, "图片"), options.slice(0, 2));
    assert.deepEqual(filterReferenceMentions(options, "视频1"), [options[2]]);
});

test("replaces the active @ token with the official Seedance label", () => {
    assert.deepEqual(applyReferenceMention("让@图", 3, "图片 1"), { text: "让图片 1", caret: 5 });
    assert.deepEqual(applyReferenceMention("参考 @视频", 5, "视频 1"), { text: "参考 视频 1", caret: 7 });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test 'src/app/(user)/canvas/utils/canvas-reference-mentions.test.mts'`

Expected: fail because `canvas-reference-mentions.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `CanvasReferenceMentionOption`, `filterReferenceMentions`, `findReferenceMentionTrigger`, and `applyReferenceMention`.

- [ ] **Step 4: Run the helper test**

Run: `node --test 'src/app/(user)/canvas/utils/canvas-reference-mentions.test.mts'`

Expected: pass.

### Task 2: Prompt Panel @ Picker

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

- [ ] **Step 1: Pass mention options into the prompt panel**

Use `buildNodeGenerationInputs(selectedNode.id, nodes, connections)` for the selected prompt node and map image/video inputs to labels from `seedanceReferenceLabel`.

- [ ] **Step 2: Render a compact picker after typing @**

When the active token starts with `@`, show a small absolute panel below the textarea. Selecting a row inserts `图片 1` or `视频 1`.

- [ ] **Step 3: Keep behavior scoped to video prompts**

Only pass options and show the picker when the prompt panel mode is video.

### Task 3: Verification And Docs

**Files:**
- Modify: `docs/pending-test.md`
- Modify: `docs/canvas-node-manual.md`

- [ ] **Step 1: Update docs**

Mention that video prompt input supports typing `@` to choose connected references and inserts official Seedance labels.

- [ ] **Step 2: Run targeted tests**

Run: `node --test 'src/app/(user)/canvas/utils/canvas-reference-mentions.test.mts' src/services/api/video-reference.test.mts 'src/app/(user)/canvas/components/canvas-node-generation.test.mts' 'src/app/(user)/canvas/utils/canvas-video-config.test.mts' src/components/model-picker-options.test.mts`

Expected: all pass.

- [ ] **Step 3: Browser check**

Open the current canvas, select a video prompt node, type `@`, and confirm a reference picker appears when the selected node has connected image/video references.
