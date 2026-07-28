import assert from "node:assert/strict";
import test from "node:test";

import { canCreateEpisodeChildCanvas, episodeChildCanvases, episodeMainCanvas } from "./episode-canvas-hierarchy.ts";

const base = { projectId: "p1", episodeId: "e1", createdAt: "1", updatedAt: "1", nodes: [], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } } as const;
const main = { ...base, id: "main", title: "EP01 主画布", canvasRole: "main" } as any;
const child = { ...base, id: "child", title: "分场 A", canvasRole: "child", parentCanvasId: "main", createdAt: "2" } as any;

test("one main canvas owns one-level children", () => {
    assert.equal(episodeMainCanvas([child, main], "p1", "e1")?.id, "main");
    assert.deepEqual(
        episodeChildCanvases([child, main], "main").map((item) => item.id),
        ["child"],
    );
    assert.equal(canCreateEpisodeChildCanvas(main), true);
    assert.equal(canCreateEpisodeChildCanvas(child), false);
});
