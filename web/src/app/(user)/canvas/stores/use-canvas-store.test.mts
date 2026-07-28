import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const sourceRoot = new URL("../../../../", import.meta.url);
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, sourceRoot).href, context);
        return nextResolve(specifier, context);
    },
});

const { useCanvasStore } = await import("./use-canvas-store.ts");

test("initializes the script node only for a newly created episode main canvas", () => {
    useCanvasStore.setState({ projects: [] });
    const input = {
        projectId: "project-1",
        title: "EP01-第一集",
        episodeContext: { episodeId: "episode-1", episodeTitle: "第一集", scriptId: "project-1", scriptSnapshot: "优化后剧本" },
    };

    const mainCanvasId = useCanvasStore.getState().ensureEpisodeMainCanvas(input);
    let mainCanvas = useCanvasStore.getState().projects.find((canvas) => canvas.id === mainCanvasId);
    assert.equal(mainCanvas?.nodes.length, 1);
    assert.equal(mainCanvas?.nodes[0]?.type, "text");
    assert.equal(mainCanvas?.nodes[0]?.title, "本集剧本");
    assert.equal(mainCanvas?.nodes[0]?.metadata?.content, "优化后剧本");

    const editedNode = { ...mainCanvas!.nodes[0], metadata: { ...mainCanvas!.nodes[0].metadata, content: "画布内已编辑" } };
    useCanvasStore.getState().updateProject(mainCanvasId, { nodes: [editedNode] });
    assert.equal(useCanvasStore.getState().ensureEpisodeMainCanvas({ ...input, episodeContext: { ...input.episodeContext, scriptSnapshot: "更新后优化稿" } }), mainCanvasId);
    mainCanvas = useCanvasStore.getState().projects.find((canvas) => canvas.id === mainCanvasId);
    assert.equal(mainCanvas?.nodes.length, 1);
    assert.equal(mainCanvas?.nodes[0]?.metadata?.content, "画布内已编辑");

    const childCanvasId = useCanvasStore.getState().createEpisodeChildCanvas(mainCanvasId, "分场画布");
    const childCanvas = useCanvasStore.getState().projects.find((canvas) => canvas.id === childCanvasId);
    assert.deepEqual(childCanvas?.nodes, []);

    const emptyMainCanvasId = useCanvasStore.getState().ensureEpisodeMainCanvas({
        ...input,
        episodeContext: { ...input.episodeContext, episodeId: "episode-2", scriptSnapshot: "  " },
    });
    assert.deepEqual(useCanvasStore.getState().projects.find((canvas) => canvas.id === emptyMainCanvasId)?.nodes, []);
    useCanvasStore.setState({ projects: [] });
});
