import assert from "node:assert/strict";
import test from "node:test";

import { insertPromptReference, promptDocumentFromText, serializePromptDocument, validatePromptDocument } from "./canvas-prompt-document.ts";

const options = [
    { id: "image-a", label: "图片 1", previewType: "image" as const, previewUrl: "data:image/png;base64,a" },
    { id: "image-b", label: "图片 2", previewType: "image" as const, previewUrl: "data:image/png;base64,b" },
];

test("inserts a structured image reference bound to its node id", () => {
    const document = insertPromptReference(promptDocumentFromText("让 @ 更明亮"), 2, 3, options[1]);

    assert.deepEqual(document.blocks, [
        { type: "text", text: "让 " },
        { type: "reference", nodeId: "image-b", kind: "image", label: "图片 2" },
        { type: "text", text: " 更明亮" },
    ]);
});

test("serializes references by current upstream order instead of a stale label", () => {
    const document = {
        version: 1 as const,
        blocks: [
            { type: "text" as const, text: "参考 " },
            { type: "reference" as const, nodeId: "image-b", kind: "image" as const, label: "旧图片" },
        ],
    };

    assert.equal(serializePromptDocument(document, options), "参考 图片 2");
});

test("reports references whose source node no longer exists", () => {
    const document = {
        version: 1 as const,
        blocks: [{ type: "reference" as const, nodeId: "missing", kind: "image" as const, label: "图片 3" }],
    };

    assert.deepEqual(validatePromptDocument(document, options), ["missing"]);
});

test("inserting another reference keeps existing structured references", () => {
    const document = {
        version: 1 as const,
        blocks: [
            { type: "reference" as const, nodeId: "image-a", kind: "image" as const, label: "图片 1" },
            { type: "text" as const, text: " 后接 @" },
        ],
    };

    const next = insertPromptReference(document, 8, 9, options[1]);

    assert.deepEqual(next.blocks, [
        { type: "reference", nodeId: "image-a", kind: "image", label: "图片 1" },
        { type: "text", text: " 后接 " },
        { type: "reference", nodeId: "image-b", kind: "image", label: "图片 2" },
    ]);
});
