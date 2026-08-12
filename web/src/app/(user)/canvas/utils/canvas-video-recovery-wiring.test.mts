import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../[id]/canvas-client-page.tsx", import.meta.url), "utf8");
const recoveryHook = readFileSync(new URL("../hooks/use-canvas-video-task-recovery.ts", import.meta.url), "utf8");

test("keeps the video recovery dependencies stable between node status updates", () => {
    assert.match(page, /const getNodes = useCallback\(\(\) => nodesRef\.current, \[nodesRef\]\)/);
    assert.equal(page.match(/getNodes,/g)?.length, 3);
    assert.doesNotMatch(page, /getNodes: \(\) => nodesRef\.current/);
});

test("does not restart the video recovery timer when recovery callbacks change", () => {
    assert.match(recoveryHook, /const recoveryOptionsRef = useRef\(\{ canvasAiConfig, cacheUploadedCanvasMedia, toVideoMetadata, archiveRecoveredVideoNode \}\)/);
    assert.match(recoveryHook, /recoveryOptionsRef\.current = \{ canvasAiConfig, cacheUploadedCanvasMedia, toVideoMetadata, archiveRecoveredVideoNode \}/);
    assert.match(recoveryHook, /\[nodesRef, projectLoaded, recoveringVideoTaskIdsRef, setNodes\]/);
});
