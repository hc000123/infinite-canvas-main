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
    assert.equal(canCreateEpisodeChildCanvas(main, [child, main]), true);
    assert.equal(canCreateEpisodeChildCanvas(child, [child, main]), false);
});

test("only the earliest untyped episode canvas is the fallback main canvas", () => {
    const later = { ...base, id: "later", title: "后创建", createdAt: "2" } as any;
    const earlier = { ...base, id: "earlier", title: "先创建", createdAt: "1" } as any;
    const projects = [later, earlier];
    assert.equal(episodeMainCanvas(projects, "p1", "e1")?.id, "earlier");
    assert.equal(canCreateEpisodeChildCanvas(earlier, projects), true);
    assert.equal(canCreateEpisodeChildCanvas(later, projects), false);
});

test("an explicit main canvas takes priority over untyped canvases", () => {
    const untyped = { ...base, id: "untyped", title: "普通画布", createdAt: "0" } as any;
    assert.equal(episodeMainCanvas([untyped, main], "p1", "e1")?.id, "main");
    assert.equal(canCreateEpisodeChildCanvas(untyped, [untyped, main]), false);
});
