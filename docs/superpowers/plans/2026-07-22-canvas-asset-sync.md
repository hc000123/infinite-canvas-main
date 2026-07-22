# Canvas Asset Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent canvas-generated assets from being overwritten during asynchronous store hydration and make asset downloads read persistent files without changing the library list.

**Architecture:** Add a small one-shot hydration gate beside the asset store, await it in `addAssetOnce`, and make canvas image generation await archive completion. Resolve downloads from localForage-backed blobs before falling back to display URLs.

**Tech Stack:** Next.js, React, TypeScript, Zustand persist, localForage, Node test runner

---

### Task 1: Gate asset writes until hydration completes

**Files:**
- Create: `web/src/stores/asset-store-hydration.ts`
- Create: `web/src/stores/asset-store-hydration.test.mts`
- Modify: `web/src/stores/use-asset-store.ts`

- [ ] **Step 1: Write the failing hydration-gate test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { createAssetStoreHydrationGate } from "./asset-store-hydration.ts";

test("waits for hydration before continuing asset writes", async () => {
    const gate = createAssetStoreHydrationGate();
    let continued = false;
    const waiting = gate.wait().then(() => { continued = true; });
    await Promise.resolve();
    assert.equal(continued, false);
    gate.release();
    await waiting;
    assert.equal(continued, true);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd web && node --experimental-strip-types --test src/stores/asset-store-hydration.test.mts`

Expected: FAIL because `asset-store-hydration.ts` does not exist.

- [ ] **Step 3: Implement the one-shot gate and connect it to Zustand hydration**

```ts
export function createAssetStoreHydrationGate() {
    let release = () => undefined;
    let released = false;
    const ready = new Promise<void>((resolve) => {
        release = () => {
            if (released) return;
            released = true;
            resolve();
        };
    });
    return { wait: () => ready, release };
}
```

Create one gate in `use-asset-store.ts`, await it at the start of `addAssetOnce`, and release it from Zustand persist's `onRehydrateStorage` completion callback.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `cd web && node --experimental-strip-types --test src/stores/asset-store-hydration.test.mts`

Expected: PASS.

### Task 2: Await canvas image archiving and expose failures

**Files:**
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-image-generation-actions.ts`

- [ ] **Step 1: Replace fire-and-forget archiving with an awaited call**

After building a generated image asset, await `archiveGeneratedAsset(asset)`. Catch only the archive error locally, keep the generated node successful, and call `showError("图片已生成，但同步到我的素材失败")`.

- [ ] **Step 2: Verify the existing generation behavior test plus hydration regression test**

Run: `cd web && node --experimental-strip-types --test src/stores/asset-store-hydration.test.mts src/app/\(user\)/canvas/utils/canvas-generated-asset.test.mts`

Expected: PASS.

### Task 3: Download persistent blobs without mutating assets

**Files:**
- Create: `web/src/app/(user)/assets/asset-download.ts`
- Create: `web/src/app/(user)/assets/asset-download.test.mts`
- Modify: `web/src/app/(user)/assets/use-asset-media-actions.ts`

- [ ] **Step 1: Write and run a failing persistent-download test**

Verify that a storage-backed image resolves to the supplied Blob and that the input asset remains unchanged. The initial run must fail because `asset-download.ts` does not exist.

- [ ] **Step 2: Resolve the persistent file before downloading**

For assets with `storageKey`, call `getImageBlob` or `getMediaBlob`. Pass the resulting Blob to `saveAs`; fall back to the current image/video/audio URL only when no stored Blob exists. Catch read failures and show `下载失败，请稍后重试`.

- [ ] **Step 3: Keep all download handlers read-only**

Do not call `updateAsset`, `removeAsset`, cleanup functions, or selection mutations from download/export actions.

### Task 4: Record the regression for user acceptance

**Files:**
- Modify: `docs/pending-test.md`
- Check: `docs/todo.md`

- [ ] **Step 1: Add a concise pending-test entry**

Record that canvas-generated assets now wait for asset-store hydration, image generation awaits archiving, and downloads prefer persistent blobs.

- [ ] **Step 2: Confirm no todo item changes**

Only edit `docs/todo.md` if an existing matching item needs to move; otherwise leave it unchanged.

### Task 5: Final targeted verification

- [ ] **Step 1: Run the two targeted tests**

Run: `cd web && node --experimental-strip-types --test src/stores/asset-store-hydration.test.mts src/app/\(user\)/canvas/utils/canvas-generated-asset.test.mts`

Expected: PASS with zero failures.

- [ ] **Step 2: Inspect the final diff**

Run: `git diff --check -- web/src/stores/asset-store-hydration.ts web/src/stores/asset-store-hydration.test.mts web/src/stores/use-asset-store.ts web/src/app/\(user\)/canvas/hooks/use-canvas-image-generation-actions.ts web/src/app/\(user\)/assets/use-asset-media-actions.ts docs/pending-test.md`

Expected: no output.
