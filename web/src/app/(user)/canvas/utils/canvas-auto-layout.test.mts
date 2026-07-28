import assert from "node:assert/strict";
import test from "node:test";

import { organizeCanvasNodes } from "./canvas-auto-layout.ts";

const node = (id: string, type = "image", x = 400, y = 400, patch: Record<string, unknown> = {}) => ({ id, type, title: id, position: { x, y }, width: 240, height: 180, ...patch }) as any;
const edge = (fromNodeId: string, toNodeId: string) => ({ id: `${fromNodeId}-${toNodeId}`, fromNodeId, toNodeId });

test("lays connected production flow from left to right", () => {
    const result = organizeCanvasNodes([node("result"), node("source")], [edge("source", "result")]);
    const source = result.find((item) => item.id === "source")!;
    const target = result.find((item) => item.id === "result")!;
    assert.ok(target.position.x >= source.position.x + source.width + 120);
});

test("stacks nodes in one layer without overlap", () => {
    const result = organizeCanvasNodes([node("a"), node("b"), node("target")], [edge("a", "target"), edge("b", "target")]);
    const [a, b] = [result.find((item) => item.id === "a")!, result.find((item) => item.id === "b")!].sort((left, right) => left.position.y - right.position.y);
    assert.ok(b.position.y >= a.position.y + a.height + 72);
});

test("places disconnected type lanes below the connected flow", () => {
    const result = organizeCanvasNodes([node("source"), node("result"), node("loose-image", "image"), node("loose-video", "video")], [edge("source", "result")]);
    const flowBottom = Math.max(...result.filter((item) => item.id === "source" || item.id === "result").map((item) => item.position.y + item.height));
    assert.ok(result.find((item) => item.id === "loose-image")!.position.y > flowBottom);
    assert.ok(result.find((item) => item.id === "loose-video")!.position.y > result.find((item) => item.id === "loose-image")!.position.y);
});

test("handles cycles deterministically and preserves batch child offsets", () => {
    const root = node("root", "image", 300, 300, { metadata: { isBatchRoot: true, batchChildIds: ["child"] } });
    const child = node("child", "image", 330, 520, { metadata: { batchRootId: "root" } });
    const result = organizeCanvasNodes([root, child, node("cycle-a"), node("cycle-b")], [edge("cycle-a", "cycle-b"), edge("cycle-b", "cycle-a")]);
    const nextRoot = result.find((item) => item.id === "root")!;
    const nextChild = result.find((item) => item.id === "child")!;
    assert.deepEqual({ x: nextChild.position.x - nextRoot.position.x, y: nextChild.position.y - nextRoot.position.y }, { x: 30, y: 220 });
    assert.notDeepEqual(result.find((item) => item.id === "cycle-a")!.position, result.find((item) => item.id === "cycle-b")!.position);
});
