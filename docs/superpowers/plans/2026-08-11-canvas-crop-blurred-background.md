# Canvas Crop Blurred Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically place only undersized or out-of-range canvas crop results on a same-image blurred background without stretching the clear foreground.

**Architecture:** Keep image rendering in `canvas-image-data.ts`. `cropDataUrl` will decide from the cropped pixel dimensions whether the existing direct crop remains valid or a portrait/landscape normalized canvas must be rendered; the derivative action hook remains unchanged and continues uploading the returned PNG.

**Tech Stack:** TypeScript, browser Canvas 2D API, existing localforage-backed image upload flow.

---

### Task 1: Render invalid crop results on a blurred background

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/canvas-image-data.ts:11-93`

- [ ] **Step 1: Add crop compliance and target-size helpers**

Add constants for the 300px minimum, open `0.4–2.5` aspect-ratio range, and `576 × 1024` / `1024 × 576` outputs. Add a small pure helper that returns no target for compliant crops and returns the orientation-specific target for invalid crops:

```ts
const MIN_REFERENCE_EDGE = 300;
const MIN_REFERENCE_RATIO = 0.4;
const MAX_REFERENCE_RATIO = 2.5;
const PORTRAIT_CROP_SIZE = { width: 576, height: 1024 };
const LANDSCAPE_CROP_SIZE = { width: 1024, height: 576 };

function blurredCropTarget(width: number, height: number) {
    const ratio = width / height;
    if (width >= MIN_REFERENCE_EDGE && height >= MIN_REFERENCE_EDGE && ratio > MIN_REFERENCE_RATIO && ratio < MAX_REFERENCE_RATIO) return null;
    return width > height ? LANDSCAPE_CROP_SIZE : PORTRAIT_CROP_SIZE;
}
```

- [ ] **Step 2: Route crop rendering through the compliance decision**

In `cropDataUrl`, calculate the source crop rectangle once. Return the existing `drawCrop` result when `blurredCropTarget` is null; otherwise call the new blurred renderer with the same source rectangle and selected target dimensions. Preserve the existing square default-crop behavior when no crop rectangle is supplied.

- [ ] **Step 3: Add the Canvas 2D blurred renderer**

Add `drawCropWithBlurredBackground` beside `drawCrop`. Draw the source crop twice: first with cover sizing, `blur(32px) brightness(0.72)`, and 8% overscan; then reset the filter and draw the same crop with contain sizing as the clear centered foreground. Return PNG with `canvas.toDataURL("image/png")`; if no 2D context is available, fall back to the existing direct crop.

```ts
function drawCropWithBlurredBackground(image: HTMLImageElement, sx: number, sy: number, sw: number, sh: number, width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return drawCrop(image, sx, sy, sw, sh);

    const coverScale = Math.max(width / sw, height / sh) * 1.08;
    const backgroundWidth = sw * coverScale;
    const backgroundHeight = sh * coverScale;
    context.filter = "blur(32px) brightness(0.72)";
    context.drawImage(image, sx, sy, sw, sh, (width - backgroundWidth) / 2, (height - backgroundHeight) / 2, backgroundWidth, backgroundHeight);

    const containScale = Math.min(width / sw, height / sh);
    const foregroundWidth = sw * containScale;
    const foregroundHeight = sh * containScale;
    context.filter = "none";
    context.drawImage(image, sx, sy, sw, sh, (width - foregroundWidth) / 2, (height - foregroundHeight) / 2, foregroundWidth, foregroundHeight);
    return canvas.toDataURL("image/png");
}
```

- [ ] **Step 4: Review the focused diff**

Inspect only `canvas-image-data.ts` and confirm that valid crops still use `drawCrop`, invalid crops use the new renderer, no AI or network call was introduced, and the action hook remains untouched. Per project instructions, do not run typecheck, build, or tests unless the user explicitly requests them.

### Task 2: Record the new behavior for user acceptance

**Files:**
- Modify: `docs/pending-test.md`
- Check: `docs/todo.md`

- [ ] **Step 1: Add a current-version acceptance entry**

Under `## 当前版本验收清单`, record that invalid single and grid crop outputs receive a same-image blurred background, valid crops stay unchanged, the foreground keeps its aspect ratio, and no paid AI upscale is invoked. Include manual checks for `251 × 941`, a small landscape crop, a valid crop, and a nine-grid crop.

- [ ] **Step 2: Check todo impact**

Search `docs/todo.md` for an existing crop-size or Seedance reference-image item. If none exists, leave the file unchanged because this is a direct defect-prevention improvement rather than completion of an existing roadmap item.

- [ ] **Step 3: Review documentation changes**

Confirm the entry describes actual implemented behavior and stays in `pending-test.md` rather than prematurely updating `features.md`. Do not alter the user's unrelated pending documentation changes.
