import assert from "node:assert/strict";
import test from "node:test";

import { collectBatchAwareDeletedNodeIds, isHiddenBatchChild, isHiddenBatchConnectionEndpoint, removeDeletedNodesFromBatches, setBatchPrimaryInNodes, toggleBatchExpandedInNodes } from "./canvas-batch-nodes.ts";
import type { CanvasNodeData } from "../types.ts";

const node = (id: string, metadata: CanvasNodeData["metadata"] = {}, size = { width: 100, height: 80 }): CanvasNodeData => ({
    id,
    type: "image",
    title: id,
    position: { x: 0, y: 0 },
    width: size.width,
    height: size.height,
    metadata,
});

test("collects children when deleting a batch root", () => {
    const root = node("root", { isBatchRoot: true, batchChildIds: ["child-a", "child-b"] });

    const deletedIds = collectBatchAwareDeletedNodeIds([root, node("child-a"), node("child-b"), node("other")], new Set(["root"]));

    assert.deepEqual(Array.from(deletedIds).sort(), ["child-a", "child-b", "root"]);
});

test("removes deleted batch children and promotes the next primary image", () => {
    const root = node("root", { isBatchRoot: true, batchChildIds: ["child-a", "child-b"], primaryImageId: "child-a", content: "old-root", naturalWidth: 10, naturalHeight: 10 });
    const childA = node("child-a", { batchRootId: "root", content: "image-a", naturalWidth: 100, naturalHeight: 80 });
    const childB = node("child-b", { batchRootId: "root", content: "image-b", naturalWidth: 200, naturalHeight: 160 });

    const result = removeDeletedNodesFromBatches([root, childA, childB], new Set(["child-a"]));
    const nextRoot = result.find((item) => item.id === "root");

    assert.deepEqual(
        result.map((item) => item.id),
        ["root", "child-b"],
    );
    assert.deepEqual(nextRoot?.metadata?.batchChildIds, ["child-b"]);
    assert.equal(nextRoot?.metadata?.primaryImageId, "child-b");
    assert.equal(nextRoot?.metadata?.content, "image-b");
    assert.equal(nextRoot?.metadata?.naturalWidth, 200);
});

test("toggles expanded state and reports hidden batch children", () => {
    const root = node("root", { isBatchRoot: true, imageBatchExpanded: false });
    const child = node("child", { batchRootId: "root" });
    const expanded = toggleBatchExpandedInNodes([root, child], "root");

    assert.equal(expanded[0].metadata?.imageBatchExpanded, true);
    assert.equal(isHiddenBatchChild(child, [root, child]), true);
    assert.equal(isHiddenBatchChild(child, [root, child], new Set(["root"])), false);
    assert.equal(isHiddenBatchConnectionEndpoint(child, [root, child]), true);
    assert.equal(isHiddenBatchChild(child, expanded), false);
});

test("sets a batch child as the root primary image", () => {
    const root = node("root", { isBatchRoot: true, primaryImageId: "child-a", content: "old-root" });
    const child = node("child-b", { batchRootId: "root", content: "image-b", naturalWidth: 640, naturalHeight: 360, freeResize: true }, { width: 320, height: 180 });

    const result = setBatchPrimaryInNodes([root, child], child);
    const nextRoot = result[0];

    assert.deepEqual([nextRoot.width, nextRoot.height], [320, 180]);
    assert.equal(nextRoot.metadata?.primaryImageId, "child-b");
    assert.equal(nextRoot.metadata?.content, "image-b");
    assert.equal(nextRoot.metadata?.naturalWidth, 640);
    assert.equal(nextRoot.metadata?.freeResize, true);
});
