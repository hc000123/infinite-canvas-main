import assert from "node:assert/strict";
import test from "node:test";

import { removeVariantVideoConnections } from "./canvas-connection-cleanup.ts";

const video = (id, metadata = {}) => ({
    id,
    type: "video",
    title: id,
    position: { x: 0, y: 0 },
    width: 420,
    height: 236,
    metadata,
});

const image = (id, metadata = {}) => ({
    id,
    type: "image",
    title: id,
    position: { x: 0, y: 0 },
    width: 320,
    height: 180,
    metadata,
});

test("removes only historical source-video to variant-video connections", () => {
    const nodes = [
        video("source"),
        video("variant", { relationType: "variant", videoActionType: "variant", sourceVideoNodeId: "source", variantOfNodeId: "source" }),
        video("other"),
        video("continuation", { relationType: "continuation", videoActionType: "continue", continuationOfNodeId: "source" }),
        video("derivative", { relationType: "derivative", videoActionType: "edit", sourceVideoNodeId: "source" }),
        image("current-frame", { capturedFrameSourceVideoNodeId: "source" }),
        image("tail-frame", { sourceVideoNodeId: "source" }),
    ];
    const connections = [
        { id: "remove-source-variant", fromNodeId: "source", toNodeId: "variant" },
        { id: "keep-other-variant", fromNodeId: "other", toNodeId: "variant" },
        { id: "keep-continuation", fromNodeId: "source", toNodeId: "continuation" },
        { id: "keep-derivative", fromNodeId: "source", toNodeId: "derivative" },
        { id: "keep-current-frame", fromNodeId: "source", toNodeId: "current-frame" },
        { id: "keep-tail-frame", fromNodeId: "source", toNodeId: "tail-frame" },
    ];

    assert.deepEqual(
        removeVariantVideoConnections(nodes, connections).map((connection) => connection.id),
        ["keep-other-variant", "keep-continuation", "keep-derivative", "keep-current-frame", "keep-tail-frame"],
    );
});

test("also recognizes actionType-only historical variant metadata", () => {
    const nodes = [video("source"), video("variant", { actionType: "variant", variantOfNodeId: "source" })];
    const connections = [{ id: "remove", fromNodeId: "source", toNodeId: "variant" }];

    assert.deepEqual(removeVariantVideoConnections(nodes, connections), []);
});
