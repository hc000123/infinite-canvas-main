import assert from "node:assert/strict";
import test from "node:test";

import { buildCanvasCapacitySnapshot, formatCanvasCapacityBytes } from "./canvas-capacity.ts";

const node = (id, type = "text", metadata = {}) => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 320,
    height: 180,
    metadata,
});

test("counts canvas pressure and deduplicates media bytes by storage key", () => {
    const nodes = Array.from({ length: 200 }, (_, index) => node(`node-${index}`));
    nodes[0] = node("config", "config");
    nodes[1] = node("image", "image", {
        storageKey: "image:shared",
        bytes: 10_000,
        mediaVersions: [
            { id: "v1", versionNumber: 1, kind: "image", createdAt: "now", prompt: "", width: 1, height: 1, metadata: { storageKey: "image:shared", bytes: 8_000 } },
            { id: "v2", versionNumber: 2, kind: "image", createdAt: "now", prompt: "", width: 1, height: 1, metadata: { storageKey: "image:unique", bytes: 2_000 } },
        ],
    });
    const connections = Array.from({ length: 400 }, (_, index) => ({ id: `connection-${index}`, fromNodeId: "image", toNodeId: "config" }));

    const snapshot = buildCanvasCapacitySnapshot(nodes, connections, { usage: 700, quota: 1_000 });

    assert.equal(snapshot.nodeCount, 200);
    assert.equal(snapshot.connectionCount, 400);
    assert.equal(snapshot.configNodeCount, 1);
    assert.equal(snapshot.mediaNodeCount, 1);
    assert.equal(snapshot.mediaVersionCount, 2);
    assert.equal(snapshot.mediaBytes, 12_000);
    assert.equal(snapshot.storageRatio, 0.7);
    assert.equal(snapshot.level, "warning");
    assert.match(snapshot.reasons.join(" "), /节点/);
    assert.match(snapshot.reasons.join(" "), /连线/);
    assert.match(snapshot.reasons.join(" "), /缓存/);
});

test("marks critical thresholds without requiring a storage estimate", () => {
    const nodes = Array.from({ length: 300 }, (_, index) =>
        node(`image-${index}`, "image", {
            mediaVersions: index < 200
                ? [
                      { id: `v-${index}-1`, versionNumber: 1, kind: "image", createdAt: "now", prompt: "", width: 1, height: 1, metadata: {} },
                      { id: `v-${index}-2`, versionNumber: 2, kind: "image", createdAt: "now", prompt: "", width: 1, height: 1, metadata: {} },
                  ]
                : [],
        }),
    );
    const connections = Array.from({ length: 800 }, (_, index) => ({ id: `connection-${index}`, fromNodeId: "image-0", toNodeId: "image-1" }));

    const snapshot = buildCanvasCapacitySnapshot(nodes, connections);

    assert.equal(snapshot.mediaVersionCount, 400);
    assert.equal(snapshot.level, "critical");
    assert.equal(snapshot.storageRatio, undefined);
});

test("keeps light canvases normal and formats byte totals", () => {
    const snapshot = buildCanvasCapacitySnapshot([node("text")], []);

    assert.equal(snapshot.level, "normal");
    assert.deepEqual(snapshot.reasons, []);
    assert.equal(formatCanvasCapacityBytes(0), "0 B");
    assert.equal(formatCanvasCapacityBytes(1536), "1.5 KB");
});
