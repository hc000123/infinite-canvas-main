import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasNodeData } from "../types.ts";
import { deriveCanvasNodePresentation } from "./canvas-node-presentation.ts";

const node = (type: CanvasNodeData["type"], metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id: `${type}-1`,
    type,
    title: `${type} node`,
    position: { x: 0, y: 0 },
    width: 320,
    height: 180,
    metadata,
});

test("uses the logo only for media nodes without real content", () => {
    assert.deepEqual(deriveCanvasNodePresentation(node("image")), { body: "logo", overlay: "none", preserveMedia: false });
    assert.deepEqual(deriveCanvasNodePresentation(node("video", { status: "loading" })), { body: "logo", overlay: "loading", preserveMedia: false });
    assert.deepEqual(deriveCanvasNodePresentation(node("audio")), { body: "logo", overlay: "none", preserveMedia: false });
    assert.deepEqual(deriveCanvasNodePresentation(node("image", { content: "blob:image" })), { body: "media", overlay: "none", preserveMedia: false });
    assert.deepEqual(deriveCanvasNodePresentation(node("text", { content: "剧本文本" })), { body: "content", overlay: "none", preserveMedia: false });
});

test("preserves old media beneath loading and error overlays", () => {
    assert.deepEqual(
        deriveCanvasNodePresentation(
            node("image", {
                content: "blob:old-image",
                status: "loading",
                pendingMediaVersion: { prompt: "新版本", startedAt: "2026-08-13T00:00:00.000Z" },
            }),
        ),
        { body: "media", overlay: "loading", preserveMedia: true },
    );
    assert.deepEqual(deriveCanvasNodePresentation(node("video", { content: "blob:old-video", status: "error" })), {
        body: "media",
        overlay: "error",
        preserveMedia: true,
    });
});
