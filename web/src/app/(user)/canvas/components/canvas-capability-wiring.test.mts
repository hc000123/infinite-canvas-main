import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("canvas node Skill action uses the shared capability drawer and Artifact writeback planner", async () => {
    const [toolbar, toolActions, page, hook, sideInspector, contextInspector, nodeInspector, drawer] = await Promise.all([
        read("./canvas-node-hover-toolbar.tsx"),
        read("../hooks/use-canvas-node-tool-actions.ts"),
        read("../[id]/canvas-client-page.tsx"),
        read("../hooks/use-canvas-capability-actions.ts"),
        read("./canvas-side-inspector.tsx"),
        read("./canvas-context-inspector.tsx"),
        read("./canvas-node-inspector.tsx"),
        read("../../../../components/capability-runtime/capability-run-drawer.tsx"),
    ]);

    assert.match(toolbar, /onRunSkill:\s*\(node: CanvasNodeData\)/);
    assert.match(toolbar, /key:\s*"run-skill"[\s\S]*label:\s*"Skill"/);
    assert.match(toolActions, /onRunSkill:\s*openNodeCapability/);
    assert.match(page, /<CapabilityRunDrawer[\s\S]*source="canvas_chat"[\s\S]*targetKind="node"/);
    assert.match(page, /onConsume=\{canvasCapability\.consume\}/);
    assert.match(hook, /planCanvasCapabilityOutput/);
    assert.match(sideInspector, /onRunSkill=\{nodeToolActions\.onRunSkill\}/);
    assert.match(contextInspector, /<NodeInspector[\s\S]*onRunSkill=\{onRunSkill\}/);
    assert.match(nodeInspector, /label="运行 Skill"[\s\S]*onClick=\{\(\) => onRunSkill\(node\)\}/);
    assert.match(drawer, /\(run\.preflight\?\.blockReasons \|\| \[\]\)\.map/);
});
