import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readCanvasFile = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("image, text, video, and config prompts use the structured mention editor", () => {
    const promptPanel = readCanvasFile("../components/canvas-node-prompt-panel.tsx");
    const configPanel = readCanvasFile("../components/canvas-config-node-panel.tsx");
    const configPreview = readCanvasFile("../components/canvas-config-node-preview.tsx");

    assert.doesNotMatch(promptPanel, /mode === "video"\s*\?\s*\(\s*<CanvasPromptEditor/);
    assert.match(promptPanel, /validatePromptDocument\(promptDocument, promptReferenceOptions\)/);
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

test("expanded prompt editing autosaves without a manual save action", () => {
    const promptPanel = readCanvasFile("../components/canvas-node-prompt-panel.tsx");

    assert.match(promptPanel, /const closeExpandedEditor = \(\) =>/);
    assert.match(promptPanel, /expanded\s+onChange=\{updatePromptDocument\}/);
    assert.match(promptPanel, /footer=\{null\}/);
    assert.doesNotMatch(promptPanel, /saveExpandedEditor/);
    assert.doesNotMatch(promptPanel, /okText="保存"/);
});

test("image and video generation preserve the active prompt document", () => {
    const flow = readCanvasFile("../hooks/use-canvas-generation-flow-actions.ts");
    const image = readCanvasFile("../hooks/use-canvas-image-generation-actions.ts");
    const video = readCanvasFile("../hooks/use-canvas-video-generation-actions.ts");

    assert.match(flow, /sourceConnections: connectionsRef\.current\.filter/);
    assert.match(image, /canvasPromptEditorDocument\(sourceNode\)/);
    assert.match(image, /referenceNodeIds: referenceImages\.map\(\(reference\) => reference\.id\)/);
    assert.match(video, /canvasPromptEditorDocument\(sourceNode\)/);
    assert.match(video, /referenceNodeIds: videoPlan\.references\.inputs/);
});

test("generation serializes structured references against the latest input order", () => {
    const promptPanel = readCanvasFile("../components/canvas-node-prompt-panel.tsx");
    const layer = readCanvasFile("../components/canvas-nodes-layer.tsx");

    assert.match(promptPanel, /serializePromptDocument\(promptDocument, promptReferenceOptions\)\.trim\(\)/);
    assert.match(layer, /serializePromptDocument\(target\.metadata\.promptDocument, buildReferenceMentionOptions\(inputs\)\)/);
});

test("video submit keeps the prompt visible while generation is running", () => {
    const promptPanel = readCanvasFile("../components/canvas-node-prompt-panel.tsx");

    assert.match(promptPanel, /if \(!isGeneratedMedia && mode !== "video"\)/);
});
