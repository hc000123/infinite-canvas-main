# Canvas Interaction Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make canvas deletion and zoom reliable, render stable media references inline inside video prompts, add an expanded text editor, and make every prompt-library layer close predictably.

**Architecture:** Keep canvas mutations in hooks, keep reference serialization and wheel decisions as pure utilities, and add one canvas-private Lexical editor for video prompts. Persist a compact structured prompt document next to the existing plain prompt, then serialize it to the unchanged Seedance request contract at generation time.

**Tech Stack:** Next.js 16, React 19, TypeScript, Ant Design 6, Zustand, Lexical 0.44, Node test runner

---

## File map

- Create `web/src/app/(user)/canvas/utils/canvas-prompt-document.ts`: structured prompt types, plain-text serialization, current reference resolution, invalid-reference detection.
- Create `web/src/app/(user)/canvas/utils/canvas-prompt-document.test.mts`: prompt serialization and reference identity regression tests.
- Create `web/src/app/(user)/canvas/components/canvas-prompt-editor.tsx`: canvas-private Lexical composer, inline reference node, `@` menu, controlled document synchronization.
- Modify `web/src/app/(user)/canvas/types.ts`: persist `promptDocument` in node metadata.
- Modify `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`: use the rich prompt editor for video mode and keep plain textarea for text/image modes.
- Modify `web/src/app/(user)/canvas/components/canvas-nodes-layer.tsx`: pass structured prompt updates and preview/locate actions.
- Modify `web/src/app/(user)/canvas/hooks/use-canvas-node-crud-actions.ts`: save plain prompt and structured prompt atomically.
- Create `web/src/app/(user)/canvas/hooks/use-canvas-delete-actions.ts`: central node-or-connection delete dispatcher.
- Modify `web/src/app/(user)/canvas/hooks/use-canvas-keyboard-shortcuts.ts`: use the central action and only treat visible overlays as blockers.
- Modify `web/src/app/(user)/canvas/components/canvas-connections.tsx`: show a visible active-connection delete control.
- Modify `web/src/app/(user)/canvas/components/canvas-connections-layer.tsx`: pass connection deletion.
- Modify `web/src/app/(user)/canvas/components/infinite-canvas.tsx`: reserve plain wheel for canvas and modifier-wheel for the browser.
- Create `web/src/app/(user)/canvas/utils/canvas-wheel.ts`: pure wheel-scope decision.
- Create `web/src/app/(user)/canvas/utils/canvas-wheel.test.mts`: modifier and excluded-target cases.
- Create `web/src/app/(user)/canvas/components/canvas-text-editor-modal.tsx`: draft-based expanded text editor.
- Modify `web/src/app/(user)/canvas/components/canvas-node.tsx`, `canvas-node-content.tsx`, `canvas-node-hover-toolbar.tsx`: expose the expanded editor action.
- Modify `web/src/app/(user)/canvas/hooks/use-canvas-page-local-state.ts`, `use-canvas-node-tool-actions.ts`, `canvas-client-page.tsx`, `canvas-page-overlays.tsx`: own and wire the expanded text editor state.
- Modify `web/src/components/prompts/prompt-select-dialog.tsx`: centralize close/reset behavior and destroy hidden temporary UI.
- Modify `docs/pending-test.md` and `docs/todo.md`: record the completed testable change and remove any matching pending work.

### Task 1: Structured prompt document

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-prompt-document.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-prompt-document.test.mts`
- Modify: `web/src/app/(user)/canvas/types.ts`

- [ ] **Step 1: Write failing serialization tests**

```ts
test("serializes references from current node identity and order", () => {
    const document = promptDocumentFromBlocks([
        { type: "text", text: "让" },
        { type: "reference", nodeId: "image-b", kind: "image", label: "旧标签" },
        { type: "text", text: "跟随" },
        { type: "reference", nodeId: "image-a", kind: "image", label: "旧标签" },
    ]);
    assert.deepEqual(serializeCanvasPromptDocument(document, [
        { id: "image-a", label: "图片 1", previewType: "image" },
        { id: "image-b", label: "图片 2", previewType: "image" },
    ]), { text: "让图片 2跟随图片 1", invalidReferenceIds: [] });
});

test("keeps missing references visible and reports them", () => {
    const document = promptDocumentFromBlocks([{ type: "reference", nodeId: "missing", kind: "image", label: "图片 1" }]);
    assert.deepEqual(serializeCanvasPromptDocument(document, []), { text: "图片 1", invalidReferenceIds: ["missing"] });
});
```

- [ ] **Step 2: Run the tests and verify the missing module failure**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-prompt-document.test.mts'`

Expected: FAIL because `canvas-prompt-document.ts` does not exist.

- [ ] **Step 3: Implement the document types and serializer**

```ts
export type CanvasPromptBlock =
    | { type: "text"; text: string }
    | { type: "reference"; nodeId: string; kind: "image" | "video" | "audio"; label: string };

export type CanvasPromptDocument = { version: 1; blocks: CanvasPromptBlock[] };

export function serializeCanvasPromptDocument(document: CanvasPromptDocument, options: CanvasReferenceMentionOption[]) {
    const optionById = new Map(options.map((option) => [option.id, option]));
    const invalidReferenceIds: string[] = [];
    const text = document.blocks.map((block) => {
        if (block.type === "text") return block.text;
        const option = optionById.get(block.nodeId);
        if (!option) invalidReferenceIds.push(block.nodeId);
        return option?.label || block.label;
    }).join("");
    return { text, invalidReferenceIds: Array.from(new Set(invalidReferenceIds)) };
}
```

Add `promptDocument?: CanvasPromptDocument` to `CanvasNodeMetadata` and import the type with `import type`.

- [ ] **Step 4: Run the serialization tests**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-prompt-document.test.mts'`

Expected: PASS.

### Task 2: Inline media reference editor

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Create: `web/src/app/(user)/canvas/components/canvas-prompt-editor.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-nodes-layer.tsx`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-node-crud-actions.ts`

- [ ] **Step 1: Install the focused editor dependencies**

Run: `cd web && npm install lexical@0.44.0 @lexical/react@0.44.0`

Expected: `package.json` and `package-lock.json` contain matching `0.44.0` packages.

- [ ] **Step 2: Create an inline DecoratorNode**

```tsx
class CanvasReferenceNode extends DecoratorNode<ReactNode> {
    __nodeId: string;
    __kind: CanvasPromptReferenceKind;
    __label: string;

    static getType() { return "canvas-reference"; }
    isInline() { return true; }
    isKeyboardSelectable() { return true; }
    decorate() {
        return <CanvasReferenceChip nodeId={this.__nodeId} kind={this.__kind} fallbackLabel={this.__label} />;
    }
}
```

The chip resolves its current option by `nodeId`, shows the image thumbnail inside the line, marks missing inputs as “引用失效”, and invokes preview/locate callbacks without editing text.

- [ ] **Step 3: Add `@` typeahead insertion and controlled document sync**

Use `LexicalTypeaheadMenuPlugin` with the existing `findReferenceMentionTrigger` matching rules. Selecting an option removes the active `@query`, inserts one `CanvasReferenceNode`, and inserts a trailing space. `OnChangePlugin` converts root children back to `CanvasPromptDocument` and calls:

```ts
onChange(document, serializeCanvasPromptDocument(document, referenceOptions));
```

- [ ] **Step 4: Replace only the video textarea**

In `CanvasNodePromptPanel`, keep the current textarea for image and text generation. For video mode render:

```tsx
<CanvasPromptEditor
    document={promptDocument}
    referenceOptions={referenceMentionOptions}
    onChange={(document, serialized) => updatePrompt(serialized.text, document)}
    onPreviewReference={onPreviewReference}
    onLocateReference={onLocateReference}
/>
```

Block submit when `serialized.invalidReferenceIds.length > 0` and show “请先删除失效引用或重新连接对应节点”.

- [ ] **Step 5: Save structured and plain prompt together**

Change the prompt update callback to:

```ts
handleNodePromptChange(nodeId, prompt, promptDocument) {
    setNodes((prev) => prev.map((node) => node.id === nodeId
        ? { ...node, metadata: { ...node.metadata, prompt, promptDocument } }
        : node));
}
```

- [ ] **Step 6: Run prompt tests and TypeScript**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-prompt-document.test.mts' 'src/app/(user)/canvas/utils/canvas-reference-mentions.test.mts' && npm run typecheck`

Expected: all selected tests PASS and TypeScript exits 0.

### Task 3: Reliable selection deletion

**Files:**
- Create: `web/src/app/(user)/canvas/hooks/use-canvas-delete-actions.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-keyboard-shortcuts.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-connections.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-connections-layer.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

- [ ] **Step 1: Centralize node-or-connection deletion**

```ts
export function useCanvasDeleteActions({ deleteNodes, setConnections, setSelectedConnectionId }: Options) {
    const deleteConnection = useCallback((id: string) => {
        setConnections((items) => items.filter((item) => item.id !== id));
        setSelectedConnectionId((current) => current === id ? null : current);
    }, [setConnections, setSelectedConnectionId]);
    const deleteSelection = useCallback((nodeIds: Set<string>, connectionId: string | null) => {
        if (nodeIds.size) deleteNodes(new Set(nodeIds));
        else if (connectionId) deleteConnection(connectionId);
    }, [deleteConnection, deleteNodes]);
    return { deleteConnection, deleteSelection };
}
```

- [ ] **Step 2: Remove the hidden-overlay false positive**

Replace the unconditional global modal query with a visibility check:

```ts
const hasVisibleBlockingOverlay = Array.from(document.querySelectorAll(".ant-modal-root .ant-modal, .ant-drawer-content-wrapper"))
    .some((element) => element.getClientRects().length > 0);
```

Keep the target/active-element exclusions for inputs, editors, modal content and drawers.

- [ ] **Step 3: Route keyboard deletion through `deleteSelection`**

`Delete / Backspace` calls the shared action and calls `event.preventDefault()` only when a canvas item is actually selected.

- [ ] **Step 4: Add an active-connection delete button**

At the Bezier midpoint render an SVG `foreignObject` containing a theme-aware icon button. Stop pointer/mouse propagation and call `onDelete(connection.id)`. Keep the button invisible for inactive connections.

- [ ] **Step 5: Run TypeScript**

Run: `cd web && npm run typecheck`

Expected: exit 0.

### Task 4: Plain-wheel canvas zoom

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-wheel.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-wheel.test.mts`
- Modify: `web/src/app/(user)/canvas/components/infinite-canvas.tsx`

- [ ] **Step 1: Write failing wheel-scope tests**

```ts
test("plain wheel controls the canvas", () => assert.equal(shouldZoomCanvasWithWheel({ ctrlKey: false, metaKey: false, excluded: false }), true));
test("browser modifier wheel stays with the browser", () => assert.equal(shouldZoomCanvasWithWheel({ ctrlKey: true, metaKey: false, excluded: false }), false));
test("canvas controls do not zoom", () => assert.equal(shouldZoomCanvasWithWheel({ ctrlKey: false, metaKey: false, excluded: true }), false));
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-wheel.test.mts'`

Expected: FAIL because `canvas-wheel.ts` does not exist.

- [ ] **Step 3: Implement and apply the wheel decision**

```ts
export function shouldZoomCanvasWithWheel(input: { ctrlKey: boolean; metaKey: boolean; excluded: boolean }) {
    return !input.ctrlKey && !input.metaKey && !input.excluded;
}
```

Both the React wheel handler and native `preventDefault` listener must call the same decision. Modifier-wheel must return before `preventDefault` so the browser retains its shortcut.

- [ ] **Step 4: Run the wheel tests**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-wheel.test.mts'`

Expected: PASS.

### Task 5: Expanded text editing and prompt-library closing

**Files:**
- Create: `web/src/app/(user)/canvas/components/canvas-text-editor-modal.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-content.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-page-local-state.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-node-tool-actions.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-page-overlays.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/components/prompts/prompt-select-dialog.tsx`

- [ ] **Step 1: Create the draft-based text modal**

```tsx
export function CanvasTextEditorModal({ node, open, onCancel, onSave }: Props) {
    const [draft, setDraft] = useState("");
    useEffect(() => { if (open) setDraft(node?.metadata?.content || ""); }, [node?.id, open]);
    return <Modal open={open} title="扩大编辑文本" width="min(960px, calc(100vw - 32px))" onCancel={onCancel} onOk={() => onSave(draft)} destroyOnHidden>
        <Input.TextArea value={draft} onChange={(event) => setDraft(event.target.value)} autoSize={false} style={{ height: "70vh" }} />
    </Modal>;
}
```

- [ ] **Step 2: Wire one expanded text node ID through existing page state**

Add `expandedTextNodeId`, derive the node in `canvas-client-page.tsx`, open it from both the text-node content button and hover toolbar, save with `handleNodeContentChange`, and close by clearing the ID.

- [ ] **Step 3: Centralize prompt dialog closure**

```ts
const closeDialog = () => {
    setSelectedPrompt(null);
    setCreateOpen(false);
    createForm.resetFields();
    onOpenChange(false);
};
```

Use `closeDialog` for the main Modal `onCancel`, explicit close button, and successful prompt selection. Add `destroyOnHidden` to the main and detail modals. When `open` becomes false, clear nested state even when the parent closes externally.

- [ ] **Step 4: Run TypeScript**

Run: `cd web && npm run typecheck`

Expected: exit 0.

### Task 6: Verification and project documentation

**Files:**
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md` only if a matching open item exists

- [ ] **Step 1: Run focused tests**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-prompt-document.test.mts' 'src/app/(user)/canvas/utils/canvas-reference-mentions.test.mts' 'src/app/(user)/canvas/utils/canvas-wheel.test.mts'`

Expected: all tests PASS.

- [ ] **Step 2: Run TypeScript validation**

Run: `cd web && npm run typecheck`

Expected: exit 0.

- [ ] **Step 3: Perform browser interaction checks**

Verify on a disposable local canvas:

1. Delete one node through toolbar and one connection through its visible button.
2. Confirm Delete inside the prompt editor removes text/reference content but not the canvas node.
3. Confirm plain wheel changes the canvas percentage and `Ctrl / Cmd + wheel` changes browser zoom only.
4. Insert two connected images with `@`, reorder inputs, refresh, and confirm thumbnails keep their node identity while labels renumber.
5. Remove an upstream image and confirm the inline chip becomes invalid and generation is blocked.
6. Expand a text node, cancel once, save once, and compare node content.
7. Close prompt library from the main layer, detail layer, new-prompt layer, mask, and Escape.

- [ ] **Step 4: Update pending-test documentation**

Add one concise section describing the five user-visible changes and the seven manual checks above. Remove a matching todo entry if present; do not alter unrelated roadmap items.

- [ ] **Step 5: Review the final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; the pre-existing unrelated conflict may remain but no unrelated files are changed by this plan.

