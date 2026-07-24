import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readCanvasFile = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("image, text, video, and config prompts use the structured mention editor", () => {
    const promptPanel = readCanvasFile("../components/canvas-node-prompt-panel.tsx");
    const configPanel = readCanvasFile("../components/canvas-config-node-panel.tsx");
    const configPreview = readCanvasFile("../components/canvas-config-node-preview.tsx");

    assert.doesNotMatch(promptPanel, /mode === "video"\s*\?\s*\(\s*<CanvasPromptEditor/);
    assert.match(promptPanel, /validatePromptDocument\(promptDocument, referenceMentionOptions\)/);
    assert.match(configPanel, /validatePromptDocument\(ownPromptDocument, referenceMentionOptions\)/);
    assert.match(configPreview, /<CanvasPromptEditor/);
});

test("the nodes layer passes upstream mention options without a video-only gate", () => {
    const layer = readCanvasFile("../components/canvas-nodes-layer.tsx");

    assert.match(layer, /referenceMentionOptions=\{buildReferenceMentionOptions\(generationInputs\)\}/);
    assert.doesNotMatch(layer, /panelNode\.type === CanvasNodeType\.Video\s*\?\s*buildReferenceMentionOptions/);
});

test("the prompt editor uses the canvas mention matcher instead of Lexical's whitespace-only trigger", () => {
    const editor = readCanvasFile("../components/canvas-prompt-editor.tsx");

    assert.match(editor, /triggerFn=\{matchCanvasReferenceMention\}/);
    assert.doesNotMatch(editor, /useBasicTypeaheadTriggerMatch/);
});

test("all prompt node panels expose connected media preview and exact unlink actions", () => {
    const layer = readCanvasFile("../components/canvas-nodes-layer.tsx");
    const promptPanel = readCanvasFile("../components/canvas-node-prompt-panel.tsx");
    const configPanel = readCanvasFile("../components/canvas-config-node-panel.tsx");
    const page = readCanvasFile("../[id]/canvas-client-page.tsx");

    assert.match(layer, /buildCanvasConnectedMedia\(panelNode\.id, nodes, connections\)/);
    assert.match(layer, /onDisconnectConnectedMedia=\{deleteConnection\}/);
    assert.match(promptPanel, /<CanvasConnectedMediaStrip/);
    assert.match(configPanel, /<CanvasConnectedMediaStrip/);
    assert.match(page, /deleteConnection=\{deleteConnection\}/);
});
