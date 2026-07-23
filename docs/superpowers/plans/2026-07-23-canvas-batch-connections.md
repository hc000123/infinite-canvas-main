# Canvas Batch Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user drag from the ordinary output handle of one selected node and connect every selected node to one existing or newly created target node.

**Architecture:** Add a pure connection planner that freezes eligible source handles, normalizes each source through the existing connection rules, and removes invalid or duplicate drafts. Keep pointer interaction, target detection, node creation, and React state updates in `use-canvas-connections.ts`; the page only supplies the current selection ref.

**Tech Stack:** Next.js App Router, React, TypeScript, Node test runner, nanoid

---

### Task 1: Pure batch connection planning

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-batch-connections.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-batch-connections.test.mts`

- [ ] **Step 1: Write the failing planner tests**

Create `canvas-batch-connections.test.mts` with these imports and fixtures before the test cases:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { freezeCanvasConnectionSources, planCanvasBatchConnections } from "./canvas-batch-connections.ts";

const node = (id: string, type: "image" | "video" | "config") => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 320,
    height: 180,
    metadata: {},
});

test("freezes every selected node for an ordinary source drag", () => {
    assert.deepEqual(
        freezeCanvasConnectionSources(
            { nodeId: "image-2", handleType: "source" },
            new Set(["image-1", "image-2", "image-3"]),
            [node("image-1", "image"), node("image-2", "image"), node("image-3", "image")],
        ).map((source) => source.nodeId),
        ["image-1", "image-2", "image-3"],
    );
});

test("keeps input, specialized, and unselected drags single-source", () => {
    const selected = new Set(["image-1", "image-2"]);
    const nodes = [node("image-1", "image"), node("image-2", "image"), node("image-3", "image")];
    assert.equal(freezeCanvasConnectionSources({ nodeId: "image-1", handleType: "target" }, selected, nodes).length, 1);
    assert.equal(freezeCanvasConnectionSources({ nodeId: "image-1", handleType: "source", handleId: "first_frame" }, selected, nodes).length, 1);
    assert.equal(freezeCanvasConnectionSources({ nodeId: "image-3", handleType: "source" }, selected, nodes).length, 1);
});

test("plans valid connections while skipping invalid and duplicate sources", () => {
    const result = planCanvasBatchConnections({
        sources: [
            { nodeId: "image-1", handleType: "source" },
            { nodeId: "image-2", handleType: "source" },
            { nodeId: "config-1", handleType: "source" },
        ],
        targetNodeId: "video-1",
        nodes: [node("image-1", "image"), node("image-2", "image"), node("config-1", "config"), node("video-1", "video")],
        existingConnections: [{ id: "existing", fromNodeId: "image-1", toNodeId: "video-1" }],
        normalizeConnection: (fromNodeId, toNodeId) => fromNodeId === "config-1" ? null : { fromNodeId, toNodeId },
    });
    assert.deepEqual(result.connections, [{ fromNodeId: "image-2", toNodeId: "video-1" }]);
    assert.equal(result.skippedDuplicate, 1);
    assert.equal(result.skippedInvalid, 1);
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-batch-connections.test.mts'
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `canvas-batch-connections.ts`.

- [ ] **Step 3: Implement the pure source freezer and planner**

Create `canvas-batch-connections.ts` with these public contracts:

```ts
import type { CanvasConnection, CanvasNodeData, ConnectionHandle } from "../types";

export type CanvasConnectionDraft = Omit<CanvasConnection, "id">;

export type CanvasBatchConnectionPlan = {
    connections: CanvasConnectionDraft[];
    skippedDuplicate: number;
    skippedInvalid: number;
};

export function freezeCanvasConnectionSources(anchor: ConnectionHandle, selectedNodeIds: Set<string>, nodes: CanvasNodeData[]): ConnectionHandle[] {
    if (anchor.handleType !== "source" || anchor.handleId || selectedNodeIds.size < 2 || !selectedNodeIds.has(anchor.nodeId)) return [anchor];
    return nodes.filter((node) => selectedNodeIds.has(node.id)).map((node) => ({ nodeId: node.id, handleType: "source" as const }));
}

export function planCanvasBatchConnections({ sources, targetNodeId, nodes, existingConnections, normalizeConnection }: {
    sources: ConnectionHandle[];
    targetNodeId: string;
    nodes: CanvasNodeData[];
    existingConnections: CanvasConnection[];
    normalizeConnection: (firstNodeId: string, secondNodeId: string, nodes: CanvasNodeData[], firstHandleType: "source" | "target", firstHandleId?: string) => CanvasConnectionDraft | null;
}): CanvasBatchConnectionPlan {
    const connections: CanvasConnectionDraft[] = [];
    let skippedDuplicate = 0;
    let skippedInvalid = 0;
    for (const source of sources) {
        if (source.nodeId === targetNodeId) {
            skippedInvalid += 1;
            continue;
        }
        const draft = normalizeConnection(source.nodeId, targetNodeId, nodes, source.handleType, source.handleId);
        if (!draft) {
            skippedInvalid += 1;
            continue;
        }
        const exists = [...existingConnections, ...connections].some((item) => item.fromNodeId === draft.fromNodeId && item.toNodeId === draft.toNodeId && item.fromHandle === draft.fromHandle && item.toHandle === draft.toHandle);
        if (exists) skippedDuplicate += 1;
        else connections.push(draft);
    }
    return { connections, skippedDuplicate, skippedInvalid };
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run the Step 2 command.

Expected: 3 tests pass and 0 fail.

- [ ] **Step 5: Commit the pure planner**

```bash
git add 'web/src/app/(user)/canvas/utils/canvas-batch-connections.ts' 'web/src/app/(user)/canvas/utils/canvas-batch-connections.test.mts'
git commit -m 'feat: plan canvas batch connections'
```

### Task 2: Existing-target and new-target integration

**Files:**
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-connections.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Test: `web/src/app/(user)/canvas/utils/canvas-batch-connections.test.mts`

- [ ] **Step 1: Extend the test with the frozen new-target case**

Append a test that freezes the source list before a target exists, adds one target node, then plans against that same frozen list:

```ts
test("reuses the frozen sources when one new target is created", () => {
    const sourceNodes = [node("image-1", "image"), node("image-2", "image")];
    const frozen = freezeCanvasConnectionSources({ nodeId: "image-1", handleType: "source" }, new Set(sourceNodes.map((item) => item.id)), sourceNodes);
    const target = node("video-new", "video");
    const result = planCanvasBatchConnections({
        sources: frozen,
        targetNodeId: target.id,
        nodes: [...sourceNodes, target],
        existingConnections: [],
        normalizeConnection: (fromNodeId, toNodeId) => ({ fromNodeId, toNodeId }),
    });
    assert.deepEqual(result.connections.map((item) => item.fromNodeId), ["image-1", "image-2"]);
});
```

- [ ] **Step 2: Run the test and verify the new behavior is covered**

Run the Task 1 focused command.

Expected: 4 tests pass. The hook still lacks integration, which is completed next.

- [ ] **Step 3: Freeze selected sources at drag start**

In `use-canvas-connections.ts`:

- add `selectedNodeIdsRef: RefObject<Set<string>>` to `UseCanvasConnectionsOptions`;
- add a `connectingSourcesRef` initialized to `[]`;
- change `CanvasPendingConnectionCreate` to carry `connections: ConnectionHandle[]` in addition to the anchor `connection` and position;
- in `handleConnectStart`, call `freezeCanvasConnectionSources(anchor, selectedNodeIdsRef.current, nodesRef.current)` and store the result;
- clear the frozen list in `setConnecting(null)`.

Use the frozen array only for committing. Keep `connectingParams` as the anchor so the existing preview line and hover target remain unchanged.

- [ ] **Step 4: Commit all valid drafts to an existing target**

Keep the current single-source path, including `inferFrameTargetHandle`, for one frozen handle. For multiple handles call `planCanvasBatchConnections`, add every returned draft with `nanoid()`, and show `没有可新增的有效连线` only when the returned connection list is empty. This preserves special first/last-frame behavior because specialized handles never enter a batch.

- [ ] **Step 5: Create one target and connect every frozen source**

When dropping on blank space, store:

```ts
const pending = {
    connection: currentConnection,
    connections: connectingSourcesRef.current.length ? connectingSourcesRef.current : [currentConnection],
    position,
};
```

In `createConnectedNode`, create and place one node, run the planner against `[...nodesRef.current, newNode]`, abort before state changes when every draft is invalid, otherwise add the node once and append all planned connections with `nanoid()` IDs. Select only the new node and retain the existing dialog-opening rules.

- [ ] **Step 6: Supply the live selection ref from the page**

Add `selectedNodeIdsRef` to the options passed to `useCanvasConnections` in `canvas-client-page.tsx`. Do not add another selection state or prop chain.

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd web && node --experimental-strip-types --test \
  'src/app/(user)/canvas/utils/canvas-batch-connections.test.mts' \
  'src/app/(user)/canvas/utils/canvas-connection-cleanup.test.mts'
```

Expected: all focused tests pass.

- [ ] **Step 8: Commit the hook integration**

```bash
git add 'web/src/app/(user)/canvas/hooks/use-canvas-connections.ts' 'web/src/app/(user)/canvas/[id]/canvas-client-page.tsx' 'web/src/app/(user)/canvas/utils/canvas-batch-connections.test.mts'
git commit -m 'feat: connect selected canvas nodes in one drag'
```

### Task 3: User-test documentation and verification

**Files:**
- Modify: `docs/pending-test.md`
- Modify only if an existing matching item is present: `docs/todo.md`

- [ ] **Step 1: Record the batch-linking acceptance cases**

Add a concise entry to `docs/pending-test.md` covering: multi-select ordinary output to an existing target; multi-select ordinary output to blank space creates one target; duplicates and invalid pairs are skipped; input and first/last-frame handles stay single-source. Remove an already-existing matching todo from `docs/todo.md`; otherwise leave that file unchanged.

- [ ] **Step 2: Run the complete test command**

Run:

```bash
cd web && npm test
```

Expected: all tests pass with 0 failures.

- [ ] **Step 3: Commit documentation**

```bash
git add docs/pending-test.md docs/todo.md
git commit -m 'docs: add canvas batch connection acceptance cases'
```
