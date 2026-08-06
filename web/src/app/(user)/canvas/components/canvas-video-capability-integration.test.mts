import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const promptPanel = readFileSync(new URL("./canvas-node-prompt-panel.tsx", import.meta.url), "utf8");
const configPanel = readFileSync(new URL("./canvas-config-node-panel.tsx", import.meta.url), "utf8");

test("both canvas video entry points use the shared capability UI and model patch", () => {
    for (const source of [promptPanel, configPanel]) {
        assert.match(source, /CanvasVideoCapabilityHint/);
        assert.match(source, /buildCanvasVideoModelPatch/);
        assert.match(source, /videoReferenceValidation\.error/);
    }
});

test("the config node identifies the fixed-model multi-frame mode", () => {
    assert.match(configPanel, /多帧故事 · 固定模型/);
});
