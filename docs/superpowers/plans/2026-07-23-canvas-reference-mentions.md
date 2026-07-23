# Canvas Reference Mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore inline `@` media references, including image thumbnails, in every canvas prompt editor while showing only media already connected upstream.

**Architecture:** Reuse `CanvasPromptEditor`, `CanvasPromptDocument`, and `buildReferenceMentionOptions` as the single structured prompt path for image, video, text, and config nodes. The nodes layer derives candidates exclusively from `buildNodeGenerationInputs`; editor selection only updates prompt metadata and never writes canvas connections.

**Tech Stack:** Next.js App Router, React, TypeScript, Lexical, Ant Design, Node test runner

---

### Task 1: Regression test for editor wiring

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts`

- [ ] **Step 1: Write a source-level regression test for the lost wiring**

Create a test that reads the three UI assembly files and asserts the required integration points:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readCanvasFile = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("image, text, video, and config prompts use the structured mention editor", () => {
    const promptPanel = readCanvasFile("../components/canvas-node-prompt-panel.tsx");
    const configPanel = readCanvasFile("../components/canvas-config-node-panel.tsx");
    const configPreview = readCanvasFile("../components/canvas-config-node-preview.tsx");
    assert.doesNotMatch(promptPanel, /mode === "video"\s*\?\s*\(\s*<CanvasPromptEditor/);
    assert.match(promptPanel, /validatePromptDocument\(promptDocument, referenceMentionOptions\)/);
    assert.match(configPanel, /validatePromptDocument\(ownPromptDocument, referenceMentionOptions\)/);
    assert.match(configPreview, /<CanvasPromptEditor/);
});

test("the nodes layer passes upstream mention options without a video-only gate", () => {
    const layer = readCanvasFile("../components/canvas-nodes-layer.tsx");
    assert.match(layer, /referenceMentionOptions=\{buildReferenceMentionOptions\(generationInputs\)\}/);
    assert.doesNotMatch(layer, /panelNode\.type === CanvasNodeType\.Video\s*\?\s*buildReferenceMentionOptions/);
});
```

- [ ] **Step 2: Run the test and verify it fails on the current regression**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts'
```

Expected: FAIL because image/text nodes still use a textarea, config preview lacks `CanvasPromptEditor`, and the nodes layer gates options to video nodes.

- [ ] **Step 3: Commit the failing regression test**

```bash
git add 'web/src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts'
git commit -m 'test: cover canvas prompt mention wiring'
```

### Task 2: Restore mentions in image, video, and text node prompts

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-nodes-layer.tsx`
- Test: `web/src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts`
- Test: `web/src/app/(user)/canvas/utils/canvas-prompt-document.test.mts`
- Test: `web/src/app/(user)/canvas/utils/canvas-reference-mentions.test.mts`

- [ ] **Step 1: Pass upstream media options to every generated node panel**

Replace the video-only expression in `canvas-nodes-layer.tsx` with:

```tsx
referenceMentionOptions={buildReferenceMentionOptions(generationInputs)}
```

Keep `generationInputs` as the source so unconnected canvas media never appears and selecting an `@` result cannot create a connection.

- [ ] **Step 2: Use one structured document path in all node modes**

In `canvas-node-prompt-panel.tsx`:

- render `CanvasPromptEditor` unconditionally for image, text, and video modes;
- choose only mode-specific placeholder copy;
- calculate `missingReferenceIds` with `validatePromptDocument(promptDocument, referenceMentionOptions)` for every mode;
- make `updatePrompt` rebuild and persist a `CanvasPromptDocument` for every mode, including edit instructions on an existing text node;
- make `saveExpandedEditor` always call `updatePromptDocument`;
- render the expanded `CanvasPromptEditor` for every mode;
- when a non-generated prompt is cleared after submission, clear both text and document for every mode.

The compact editor should remain:

```tsx
<CanvasPromptEditor
    key={`${node.id}:${editorRevision}`}
    initialDocument={promptDocument}
    options={referenceMentionOptions}
    placeholder={promptPlaceholder(mode, hasImageContent, hasTextContent)}
    onChange={updatePromptDocument}
    onPreviewReference={onPreviewReference}
    onExpand={openExpandedEditor}
/>
```

The expanded editor should use `expandedPromptDocument`, serialize changes with the current options, and preserve the existing modal save/cancel behavior. Initialize existing text nodes from their saved prompt document instead of forcing an empty local value. Leave `handleNodePromptChange` unchanged so generated image/video edits continue writing `promptDraftDocument` and do not overwrite historical version prompts.

- [ ] **Step 3: Run focused prompt tests**

Run:

```bash
cd web && node --experimental-strip-types --test \
  'src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts' \
  'src/app/(user)/canvas/utils/canvas-prompt-document.test.mts' \
  'src/app/(user)/canvas/utils/canvas-reference-mentions.test.mts' \
  'src/app/(user)/canvas/utils/canvas-prompt-editor-layout.test.mts'
```

Expected: prompt document, thumbnail option, missing-reference, layout, and node-layer wiring tests pass.

- [ ] **Step 4: Commit generated-node mention restoration**

```bash
git add 'web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx' 'web/src/app/(user)/canvas/components/canvas-nodes-layer.tsx'
git commit -m 'fix: restore canvas prompt media mentions'
```

### Task 3: Add the structured editor to config-node prompts

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-config-node-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-config-node-preview.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-nodes-layer.tsx`
- Test: `web/src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts`

- [ ] **Step 1: Build config mention options from the same upstream inputs**

In `canvas-config-node-panel.tsx`, derive:

```ts
const referenceMentionOptions = buildReferenceMentionOptions(inputs);
const ownPromptDocument = node.metadata?.promptDocument || promptDocumentFromText(ownPrompt);
const missingReferenceIds = validatePromptDocument(ownPromptDocument, referenceMentionOptions);
const changeOwnPrompt = (document: CanvasPromptDocument) => onConfigChange(node.id, {
    promptDocument: document,
    prompt: serializePromptDocument(document, referenceMentionOptions),
});
```

Add an optional `onPreviewReference` prop and pass the document, options, change callback, and preview callback into both `CanvasConfigNodePreview` call sites. Disable both config-node generate buttons while `missingReferenceIds` is non-empty and render an Ant Design warning alert telling the user to remove or reconnect invalid references.

- [ ] **Step 2: Make the config preview's own prompt editable with thumbnails**

In `canvas-config-node-preview.tsx`, dynamically load `CanvasPromptEditor`. Replace the read-only `OwnPromptPreviewCard` path with a structured editor available even when `ownPrompt` is empty:

```tsx
<CanvasPromptEditor
    key={`config-prompt:${open}`}
    initialDocument={ownPromptDocument}
    options={referenceMentionOptions}
    placeholder="输入 @ 选择已连接的图片、视频或音频参考素材"
    expanded
    onChange={onOwnPromptChange}
    onPreviewReference={onPreviewReference}
/>
```

Keep upstream text cards and their existing edit action separate: they edit their source text nodes, whereas this editor writes only the config node's own `prompt` and `promptDocument`.

Remove the modal-level `hasPreviewContent ? ... : <Empty>` gate so an empty config node can open its own prompt editor. Empty media and upstream-text sections should continue using their existing local empty states.

- [ ] **Step 3: Wire config image preview without changing connections**

In `canvas-nodes-layer.tsx`, pass an `onPreviewReference` callback to `CanvasConfigNodePanel` that resolves the referenced node from `nodesRef.current` and opens the existing image viewer only for image nodes. Do not call `setConnections` or any connection action.

- [ ] **Step 4: Run the regression and mention tests**

Run the Task 2 focused test command.

Expected: all tests pass, including the config editor assertion.

- [ ] **Step 5: Commit config-node mention restoration**

```bash
git add 'web/src/app/(user)/canvas/components/canvas-config-node-panel.tsx' 'web/src/app/(user)/canvas/components/canvas-config-node-preview.tsx' 'web/src/app/(user)/canvas/components/canvas-nodes-layer.tsx'
git commit -m 'fix: add media mentions to config prompts'
```

### Task 4: Documentation and full verification

**Files:**
- Modify: `docs/pending-test.md`
- Modify only if an existing matching item is present: `docs/todo.md`

- [ ] **Step 1: Record user-visible mention acceptance cases**

Add a `docs/pending-test.md` entry covering image/video/text/config prompt `@` menus, inline image thumbnails, upstream-only candidates, no connection-count change after insertion, invalid styling after disconnect, blocked generation for invalid references, and generated media draft/version preservation. Remove only an existing matching todo from `docs/todo.md`.

- [ ] **Step 2: Run the complete test command**

Run:

```bash
cd web && npm test
```

Expected: all tests pass with 0 failures.

- [ ] **Step 3: Run a production type/build verification**

Run:

```bash
cd web && npm run build
```

Expected: Next.js build and TypeScript checking complete successfully.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/pending-test.md docs/todo.md
git commit -m 'docs: add canvas mention preview acceptance cases'
```
