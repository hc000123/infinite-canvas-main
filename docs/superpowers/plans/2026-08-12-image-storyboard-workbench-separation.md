# Image and Storyboard Workbench Separation Implementation Plan

> **Superseded:** 独立 `/image` 工作台与导航任务已被 `2026-08-12-asset-only-image-generation-entry.md` 取代；本计划只作为分离过程记录，不再作为当前验收契约。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the asset subject workbench a 3:7 desktop layout and separate image generation from storyboard production through distinct navigation entries and routes.

**Architecture:** Keep the existing asset image workbench at `/image`, expose the existing storyboard workbench through a new thin `/storyboard` route, and make storyboard query synchronization route-local. Preserve all generation state, storage, and writeback behavior; only change layout and route wiring.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, lucide-react, Node test runner

---

### Task 1: Lock the asset detail 3:7 desktop layout

**Files:**
- Create: `web/src/app/(user)/assets/[subjectId]/asset-workbench-layout.test.mts`
- Modify: `web/src/app/(user)/assets/[subjectId]/page.tsx:167`

- [ ] **Step 1: Write the failing layout test**

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uses a 3:7 desktop split for asset controls and preview", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(source, /lg:grid-cols-\[minmax\(0,3fr\)_minmax\(0,7fr\)\]/);
    assert.doesNotMatch(source, /lg:grid-cols-\[320px_minmax\(0,1fr\)\]/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd 'web/src/app/(user)/assets/[subjectId]' && node --experimental-strip-types --test asset-workbench-layout.test.mts`

Expected: FAIL because the page still contains the fixed `320px` column.

- [ ] **Step 3: Apply the minimal layout change**

Replace the desktop grid class in `page.tsx`:

```tsx
lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]
```

Keep the existing mobile single-column and overflow classes unchanged.

- [ ] **Step 4: Run the layout test again**

Run: `cd 'web/src/app/(user)/assets/[subjectId]' && node --experimental-strip-types --test asset-workbench-layout.test.mts`

Expected: PASS.

### Task 2: Give image generation and storyboard production distinct routes

**Files:**
- Modify: `web/src/app/(user)/image/image-workbench-mode-wiring.test.mts`
- Modify: `web/src/app/(user)/image/storyboard-workbench-wiring.test.mts`
- Modify: `web/src/app/(user)/image/page.tsx:9,38-39,142-148`
- Create: `web/src/app/(user)/storyboard/page.tsx`
- Modify: `web/src/app/(user)/image/storyboard-image-workbench.tsx:95`

- [ ] **Step 1: Rewrite the route wiring tests so they fail on the multiplexed route**

In `image-workbench-mode-wiring.test.mts`, assert that `page.tsx` returns `<AssetImageWorkbench />`, contains `function AssetImageWorkbench`, and contains neither `StoryboardImageWorkbench` nor `isAssetImageWorkbenchContext`.

Add this test to `storyboard-workbench-wiring.test.mts`:

```ts
test("exposes storyboard production from its own route", () => {
    const route = readFileSync(new URL("../storyboard/page.tsx", import.meta.url), "utf8");
    const source = readFileSync(pageUrl, "utf8");
    assert.match(route, /StoryboardImageWorkbench/);
    assert.match(route, /return <StoryboardImageWorkbench\s*\/>/);
    assert.match(source, /router\.replace\(`\/storyboard\?\$\{nextQuery\}`/);
    assert.doesNotMatch(source, /router\.replace\(`\/image\?\$\{nextQuery\}`/);
});
```

- [ ] **Step 2: Run both tests to verify they fail**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/image/image-workbench-mode-wiring.test.mts' 'src/app/(user)/image/storyboard-workbench-wiring.test.mts'`

Expected: FAIL because `/image` still selects between modes and `/storyboard/page.tsx` does not exist.

- [ ] **Step 3: Make `/image` image-only**

Remove the `useSearchParams`, `StoryboardImageWorkbench`, and `isAssetImageWorkbenchContext` imports from `image/page.tsx`, then use:

```tsx
export default function ImagePage() {
    return <AssetImageWorkbench />;
}
```

Do not export or otherwise modify the asset workbench implementation.

- [ ] **Step 4: Add the storyboard route and route-local query synchronization**

Create `storyboard/page.tsx`:

```tsx
"use client";

import { StoryboardImageWorkbench } from "../image/storyboard-image-workbench";

export default function StoryboardPage() {
    return <StoryboardImageWorkbench />;
}
```

In `storyboard-image-workbench.tsx`, replace the query update with:

```tsx
router.replace(`/storyboard?${nextQuery}`, { scroll: false });
```

- [ ] **Step 5: Run both route tests again**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/image/image-workbench-mode-wiring.test.mts' 'src/app/(user)/image/storyboard-workbench-wiring.test.mts'`

Expected: PASS.

### Task 3: Add separate navigation entries

**Files:**
- Modify: `web/src/constant/navigation-tools.test.mts`
- Modify: `web/src/constant/navigation-tools.ts`

- [ ] **Step 1: Write the failing navigation assertions**

Update the slug assertion to:

```ts
assert.deepEqual(
    navigationTools.map((tool) => tool.slug),
    ["projects", "agent", "canvas", "image", "storyboard", "assets", "cache"],
);
```

Add explicit label assertions:

```ts
assert.deepEqual(
    navigationTools.filter((tool) => tool.slug === "image" || tool.slug === "storyboard").map(({ slug, label, shortLabel }) => ({ slug, label, shortLabel })),
    [
        { slug: "image", label: "生图工作台", shortLabel: "生图" },
        { slug: "storyboard", label: "分镜制作台", shortLabel: "分镜" },
    ],
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && node --experimental-strip-types --test src/constant/navigation-tools.test.mts`

Expected: FAIL because only the old `image`/“分镜” entry exists.

- [ ] **Step 3: Implement the two entries**

Import `ImagePlus` from `lucide-react`. Change `image` to:

```ts
{
    slug: "image",
    label: "生图工作台",
    shortLabel: "生图",
    icon: ImagePlus,
},
```

Then add:

```ts
{
    slug: "storyboard",
    label: "分镜制作台",
    shortLabel: "分镜",
    icon: Clapperboard,
},
```

- [ ] **Step 4: Run the navigation test again**

Run: `cd web && node --experimental-strip-types --test src/constant/navigation-tools.test.mts`

Expected: PASS.

### Task 4: Document and verify the complete change

**Files:**
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [ ] **Step 1: Add a pending-test entry**

Record that asset subject pages now use a 3:7 desktop split and that image generation/storyboard production have independent `/image` and `/storyboard` navigation entries. Include manual checks for desktop layout, route highlighting, and query persistence.

- [ ] **Step 2: Inspect todo scope**

Run: `rg -n "生图|分镜|资产详情|3:7" docs/todo.md docs/pending-test.md`

Expected: no completed matching todo needs to be moved; if a matching todo exists, move only that item to `docs/pending-test.md`.

- [ ] **Step 3: Run all focused tests**

Run the asset layout test from its directory (Node treats square brackets in CLI paths as a glob):

```bash
cd 'web/src/app/(user)/assets/[subjectId]' && node --experimental-strip-types --test asset-workbench-layout.test.mts
```

Then run the route and navigation tests from `web`:

```bash
cd web && node --experimental-strip-types --test \
  'src/app/(user)/image/image-workbench-mode-wiring.test.mts' \
  'src/app/(user)/image/storyboard-workbench-wiring.test.mts' \
  'src/app/(user)/image/storyboard-reference-wiring.test.mts' \
  'src/constant/navigation-tools.test.mts'
```

Expected: all tests PASS without invoking any generation API.

- [ ] **Step 4: Check patch hygiene**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 5: Preserve the dirty worktree boundary**

Do not stage or commit the implementation files because several touched paths already contain unrelated user changes. Report the exact changed files and focused verification result instead.
