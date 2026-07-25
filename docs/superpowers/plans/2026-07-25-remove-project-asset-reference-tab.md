# Remove Project Asset Reference Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the project-detail “素材引用” tab while preserving reference data, project risk statistics, and all generation behavior.

**Architecture:** The project detail page stops rendering and filtering the reference aggregation. Existing aggregation remains available to the overview statistics and asset library. Missing-material and outdated-reference actions become ordinary project asset-library links.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Node test runner.

---

### Task 1: Lock the new navigation behavior with failing tests

**Files:**
- Create: `web/src/app/(user)/projects/project-detail-navigation.test.mts`
- Modify: `web/src/app/(user)/projects/project-overview-dashboard.test.mts`

- [ ] **Step 1: Add a source-wiring test for the removed tab**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readProjectFile = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("project detail omits the project-level asset reference tab", () => {
    const board = readProjectFile("./[id]/components/project-episode-board.tsx");
    const page = readProjectFile("./[id]/page.tsx");

    assert.doesNotMatch(board, /label="素材引用"/);
    assert.doesNotMatch(board, /"asset-references"/);
    assert.doesNotMatch(board, /ProjectAssetReferencePanel/);
    assert.doesNotMatch(page, /assetReferenceFilters|filteredAssetReferenceRows/);
});
```

- [ ] **Step 2: Change overview expectations to the project asset library**

Change the suggestion target assertions for `missing-materials` and `outdated-references` from `asset-references` to `assets-page`, and assert that `projectOverviewActionHref("project-1", { type: "assets-page" })` remains `/assets?projectId=project-1`.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/projects/project-detail-navigation.test.mts' 'src/app/(user)/projects/project-overview-dashboard.test.mts'
```

Expected: FAIL because the tab, panel, filter state, and `asset-references` targets still exist.

### Task 2: Remove the project tab and redirect risk actions

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`
- Modify: `web/src/app/(user)/projects/project-overview-dashboard.ts`

- [ ] **Step 1: Remove page-level filter state and props**

Keep only the aggregation import:

```ts
import { collectProjectAssetReferences } from "../project-asset-references";
```

Delete `assetReferenceFilters`, `filteredAssetReferenceRows`, and the three corresponding `ProjectEpisodeBoard` props. Preserve `assetReferenceRows` because overview statistics still consume it.

- [ ] **Step 2: Remove the tab UI and its private components**

Change the tab type to:

```ts
export type ProjectDetailTab = "episodes" | "canvas";
```

Remove the “素材引用” navigation button, `ProjectAssetReferencePanel`, its card/stat/select helpers, and its filter constants. Keep the `Library` icon for the “项目素材” overview metric. The main content switch becomes `canvas` versus the existing episode panel.

- [ ] **Step 3: Route material-risk actions to assets**

Change `ProjectOverviewActionTarget` to remove the `asset-references` variant and remove it from the `tab` union. For both material suggestions use:

```ts
target: { type: "assets-page" }
```

Update descriptions to say “进入项目素材库” instead of “进入素材引用总览”. Apply the same targets to the “素材缺口” and “旧版本引用” metric cards.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/projects/project-detail-navigation.test.mts' 'src/app/(user)/projects/project-overview-dashboard.test.mts'
```

Expected: all focused tests PASS.

### Task 3: Align product documentation

**Files:**
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Remove M7.4 from the active roadmap**

Delete M7.4 from “新版执行主线” and remove its active roadmap section. Remove statements in M7.2.3 and M7.3 that say M7.4 is the next step. Preserve historical references elsewhere.

- [ ] **Step 2: Record the testable behavior change**

Add a current-version pending-test entry stating:

```md
### 项目详情素材引用入口收口

- 项目详情不再显示“素材引用”页签，只保留主要生产入口。
- 总览中的“素材缺口”“旧版本引用”和“项目素材”统一进入带项目上下文的“我的素材”。
- 画布、分镜、设定库、固定版本快照和视频工作流参考素材链路保持不变。
```

- [ ] **Step 3: Add an Unreleased summary**

Add:

```md
+ [调整] 移除项目详情低频“素材引用”页签，素材缺口与旧版本提醒统一进入项目素材库，底层引用和生成链路保持不变。
```

- [ ] **Step 4: Check the final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only the planned code, test, and documentation files are modified.
