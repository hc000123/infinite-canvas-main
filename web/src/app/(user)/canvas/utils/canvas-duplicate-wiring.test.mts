import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readCanvasFile = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("context duplicate and keyboard paste use the same canvas clipboard planner", () => {
    const crud = readCanvasFile("../hooks/use-canvas-node-crud-actions.ts");
    const clipboard = readCanvasFile("../hooks/use-canvas-clipboard-actions.ts");
    const page = readCanvasFile("../[id]/canvas-client-page.tsx");

    assert.match(crud, /copySelectedCanvasItems/);
    assert.match(crud, /pasteCanvasClipboard/);
    assert.match(crud, /setConnections\(\(prev\) => \[\.\.\.prev, \.\.\.pasted\.connections\]\)/);
    assert.match(clipboard, /pasteCanvasClipboard/);
    assert.match(page, /useCanvasNodeCrudActions\(\{[\s\S]*?connectionsRef,\s*nodesRef,/);
});
