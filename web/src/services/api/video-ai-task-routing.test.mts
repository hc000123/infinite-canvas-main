import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const videoApi = readFileSync(new URL("./video.ts", import.meta.url), "utf8");
const canvasRefresh = readFileSync(new URL("../../app/(user)/canvas/hooks/use-canvas-video-task-refresh.ts", import.meta.url), "utf8");
const canvasRecovery = readFileSync(new URL("../../app/(user)/canvas/hooks/use-canvas-video-task-recovery.ts", import.meta.url), "utf8");
const videoPage = readFileSync(new URL("../../app/(user)/video/page.tsx", import.meta.url), "utf8");
const workflowActions = readFileSync(new URL("../../app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-video-actions.ts", import.meta.url), "utf8");

test("sends the local ai task id on video status and content requests", () => {
    assert.match(videoApi, /queryVideoTask\(config, taskId, model, initialTask\.aiTaskId\)/);
    assert.match(videoApi, /headers: \{ \.\.\.aiHeaders\(config\), \.\.\.aiTaskRequestHeaders\(aiTaskId\) \}/g);
    assert.match(videoApi, /fetchVideoContentDirect\(config, model, task\.id, task\.aiTaskId\)/);
});

test("preserves the supplied local ai task id on a refreshed task", () => {
    assert.match(videoApi, /return \{ \.\.\.normalizeVideoTask\(unwrapVideoResponse\(response\.data\)\), aiTaskId: aiTaskId\?\.trim\(\) \|\| undefined \}/);
});

test("passes persisted local ai task ids from every manual video refresh entry", () => {
    assert.match(canvasRefresh, /refreshVideoTask\(generationConfig, node\.metadata\.taskId, node\.metadata\.aiTaskId\)/);
    assert.match(canvasRecovery, /refreshVideoTask\(generationConfig, node\.metadata\?\.taskId \|\| "", node\.metadata\?\.aiTaskId\)/);
    assert.match(videoPage, /refreshVideoTask\(config, taskId, item\.generation\?\.aiTaskId\)/);
    assert.match(workflowActions, /refreshVideoTask\(config, taskId, item\.generation\?\.aiTaskId\)/);
});
