# Seedance 2.0 全能参考 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let canvas video generation send upstream image nodes as `reference_image` and upstream video nodes as `reference_video` when using local Seedance 2.0.

**Architecture:** Add a small shared video-reference type and payload helper, extend canvas generation context to collect videos, then wire the video API and canvas UI to the richer context. OpenAI-compatible video generation keeps its existing image-only FormData path.

**Tech Stack:** Next.js App Router, React, TypeScript, Node `node:test`, localforage-backed media storage, existing Axios video API client.

---

### Task 1: Seedance Payload Helper

**Files:**
- Create: `web/src/types/video.ts`
- Create: `web/src/services/api/video-reference.ts`
- Test: `web/src/services/api/video-reference.test.mts`

- [ ] **Step 1: Write the failing test**

Create tests proving Seedance content entries include image/video roles and enforce first-version caps:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { buildSeedanceContent } from "./video-reference.ts";

test("builds Seedance content with image and video reference roles", () => {
    const content = buildSeedanceContent("镜头跟随主角穿过雨夜街道", ["data:image/png;base64,aaa"], ["data:video/mp4;base64,bbb"]);
    assert.deepEqual(content, [
        { type: "text", text: "镜头跟随主角穿过雨夜街道" },
        { type: "image_url", image_url: { url: "data:image/png;base64,aaa" }, role: "reference_image" },
        { type: "video_url", video_url: { url: "data:video/mp4;base64,bbb" }, role: "reference_video" },
    ]);
});

test("limits Seedance omni references to 9 images, 3 videos, and 12 files total", () => {
    const images = Array.from({ length: 10 }, (_, index) => `image-${index}`);
    const videos = Array.from({ length: 4 }, (_, index) => `video-${index}`);
    const content = buildSeedanceContent("prompt", images, videos);
    assert.equal(content.filter((item) => item.type === "image_url").length, 9);
    assert.equal(content.filter((item) => item.type === "video_url").length, 3);
    assert.equal(content.length, 13);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/services/api/video-reference.test.mts`

Expected: FAIL because `video-reference.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `ReferenceVideo` and `buildSeedanceContent`:

```ts
export type ReferenceVideo = {
    id: string;
    name: string;
    url: string;
    storageKey?: string;
    type?: string;
};
```

```ts
export function buildSeedanceContent(prompt: string, imageUrls: string[], videoUrls: string[]) {
    const images = imageUrls.filter(Boolean).slice(0, 9);
    const videos = videoUrls.filter(Boolean).slice(0, Math.max(0, 12 - images.length)).slice(0, 3);
    return [
        { type: "text" as const, text: prompt },
        ...images.map((url) => ({ type: "image_url" as const, image_url: { url }, role: "reference_image" as const })),
        ...videos.map((url) => ({ type: "video_url" as const, video_url: { url }, role: "reference_video" as const })),
    ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/services/api/video-reference.test.mts`

Expected: PASS.

### Task 2: Video API Supports Reference Videos

**Files:**
- Modify: `web/src/services/api/video.ts`
- Test: `web/src/services/api/video-reference.test.mts`

- [ ] **Step 1: Extend the failing test**

Add a test around a pure exported Seedance payload builder:

```ts
import { buildSeedanceVideoTaskPayload } from "./video.ts";

test("Seedance payload includes reference videos while OpenAI path stays separate", async () => {
    const payload = await buildSeedanceVideoTaskPayload(
        { model: "doubao-seedance-2-0-260128", videoSeconds: "10", size: "16:9", vquality: "720", videoGenerateAudio: "true", videoWatermark: "false", videoSeed: "" },
        "prompt",
        ["image-url"],
        ["video-url"],
    );
    assert.deepEqual(payload.content.slice(1), [
        { type: "image_url", image_url: { url: "image-url" }, role: "reference_image" },
        { type: "video_url", video_url: { url: "video-url" }, role: "reference_video" },
    ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/services/api/video-reference.test.mts`

Expected: FAIL because `buildSeedanceVideoTaskPayload` is not exported.

- [ ] **Step 3: Write minimal implementation**

Change request signatures from `ReferenceImage[]` to `VideoReferenceInput[]` where needed:

```ts
type VideoReferenceInput = {
    images?: ReferenceImage[];
    videos?: ReferenceVideo[];
};
```

Export `buildSeedanceVideoTaskPayload(config, prompt, imageUrls, videoUrls)` and make `buildSeedanceVideoPayload` call it after resolving image/video URLs.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/services/api/video-reference.test.mts`

Expected: PASS.

### Task 3: Canvas Context Collects Video References

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-node-generation.ts`
- Test: `web/src/app/(user)/canvas/components/canvas-node-generation.test.mts`

- [ ] **Step 1: Write the failing test**

Add a test with one text node, one image node, and one video node connected to a target:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { buildNodeGenerationContext } from "./canvas-node-generation.ts";
import { CanvasNodeType } from "../types.ts";

test("builds generation context with upstream video references", () => {
    const context = buildNodeGenerationContext(
        "target",
        [
            { id: "text", type: CanvasNodeType.Text, title: "Text", position: { x: 0, y: 0 }, width: 1, height: 1, metadata: { content: "雨夜街道" } },
            { id: "image", type: CanvasNodeType.Image, title: "Image", position: { x: 0, y: 0 }, width: 1, height: 1, metadata: { content: "image-url", storageKey: "image:key", mimeType: "image/png" } },
            { id: "video", type: CanvasNodeType.Video, title: "Video", position: { x: 0, y: 0 }, width: 1, height: 1, metadata: { content: "video-url", storageKey: "video:key", mimeType: "video/mp4" } },
            { id: "target", type: CanvasNodeType.Video, title: "Target", position: { x: 0, y: 0 }, width: 1, height: 1, metadata: {} },
        ],
        [
            { id: "c1", fromNodeId: "text", toNodeId: "target" },
            { id: "c2", fromNodeId: "image", toNodeId: "target" },
            { id: "c3", fromNodeId: "video", toNodeId: "target" },
        ],
        "生成一个广告片",
    );
    assert.equal(context.videoCount, 1);
    assert.deepEqual(context.referenceVideos, [{ id: "video", name: "Video.mp4", url: "video-url", storageKey: "video:key", type: "video/mp4" }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'src/app/(user)/canvas/components/canvas-node-generation.test.mts'`

Expected: FAIL because `referenceVideos` is missing.

- [ ] **Step 3: Write minimal implementation**

Add `ReferenceVideo[]`, collect video nodes in `buildNodeGenerationInputs`, and hydrate only images in `hydrateNodeGenerationContext`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test 'src/app/(user)/canvas/components/canvas-node-generation.test.mts'`

Expected: PASS.

### Task 4: Wire Canvas Generate And Retry

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/types.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-config-node-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-generation.ts`

- [ ] **Step 1: Implement reference handoff**

In video generation calls, pass:

```ts
{
    images: generationContext.referenceImages,
    videos: generationContext.referenceVideos,
}
```

For retry, resolve saved `videoReferences` into `ReferenceVideo[]` using `resolveMediaUrl`.

- [ ] **Step 2: Save metadata**

Extend `buildVideoGenerationMetadata` to store:

```ts
videoReferences: references.videos.map(referenceMediaUrl).filter(Boolean)
```

- [ ] **Step 3: Update UI counts**

Show `参考视频 N 个` in config panel chips and preview modal.

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test src/services/api/video-reference.test.mts 'src/app/(user)/canvas/components/canvas-node-generation.test.mts'
```

Expected: PASS.

### Task 5: Docs And Browser Check

**Files:**
- Modify: `docs/pending-test.md`
- Modify: `docs/canvas-data-structure.md`
- Modify: `docs/canvas-node-manual.md`

- [ ] **Step 1: Update docs**

Add notes that Seedance video mode can use upstream image and video nodes as all-purpose references, with audio deferred.

- [ ] **Step 2: Browser check**

Start or reuse local dev server and run a Playwright check that creates a config node, switches to video, and verifies `参考视频` appears.

- [ ] **Step 3: Final verification**

Run focused node tests again.

