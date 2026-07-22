import type { CanvasReferenceMentionOption } from "./canvas-reference-mentions";

export type CanvasPromptTextBlock = { type: "text"; text: string };
export type CanvasPromptReferenceBlock = {
    type: "reference";
    nodeId: string;
    kind: "image" | "video" | "audio";
    label: string;
};
export type CanvasPromptDocument = {
    version: 1;
    blocks: Array<CanvasPromptTextBlock | CanvasPromptReferenceBlock>;
};

export function promptDocumentFromText(text: string): CanvasPromptDocument {
    return { version: 1, blocks: text ? [{ type: "text", text }] : [] };
}

export function insertPromptReference(document: CanvasPromptDocument, start: number, end: number, option: CanvasReferenceMentionOption): CanvasPromptDocument {
    const kind = option.previewType || "image";
    return {
        version: 1,
        blocks: mergePromptTextBlocks([
            ...slicePromptBlocks(document.blocks, 0, start),
            { type: "reference", nodeId: option.id, kind, label: option.label },
            ...slicePromptBlocks(document.blocks, end, Number.POSITIVE_INFINITY),
        ]),
    };
}

export function serializePromptDocument(document: CanvasPromptDocument, options: CanvasReferenceMentionOption[]) {
    const labelById = new Map(options.map((option) => [option.id, option.label]));
    return document.blocks.map((block) => (block.type === "text" ? block.text : labelById.get(block.nodeId) || block.label)).join("");
}

export function validatePromptDocument(document: CanvasPromptDocument, options: CanvasReferenceMentionOption[]) {
    const availableIds = new Set(options.map((option) => option.id));
    return document.blocks.flatMap((block) => (block.type === "reference" && !availableIds.has(block.nodeId) ? [block.nodeId] : []));
}

function slicePromptBlocks(blocks: CanvasPromptDocument["blocks"], from: number, to: number) {
    const result: CanvasPromptDocument["blocks"] = [];
    let offset = 0;
    for (const block of blocks) {
        const length = block.type === "text" ? block.text.length : block.label.length;
        const blockEnd = offset + length;
        if (block.type === "reference") {
            if (offset >= from && blockEnd <= to) result.push(block);
        } else {
            const start = Math.max(0, from - offset);
            const end = Math.min(length, to - offset);
            if (end > start) result.push({ type: "text", text: block.text.slice(start, end) });
        }
        offset = blockEnd;
    }
    return result;
}

function mergePromptTextBlocks(blocks: CanvasPromptDocument["blocks"]): CanvasPromptDocument["blocks"] {
    const result: CanvasPromptDocument["blocks"] = [];
    for (const block of blocks) {
        const previous = result.at(-1);
        if (block.type === "text" && previous?.type === "text") previous.text += block.text;
        else result.push(block);
    }
    return result;
}
