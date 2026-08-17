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

export function autoMentionPromptImageReferences(document: CanvasPromptDocument, options: CanvasReferenceMentionOption[]): CanvasPromptDocument {
    const existingIds = new Set(document.blocks.flatMap((block) => (block.type === "reference" ? [block.nodeId] : [])));
    const imageOptions = options.filter((option) => option.previewType === "image" && !existingIds.has(option.id)).map((option) => ({ option, name: referenceImageName(option) })).filter((item) => item.name);
    if (!imageOptions.length) return document;

    const blocks: CanvasPromptDocument["blocks"] = [];
    const usedIds = new Set(existingIds);
    for (const block of document.blocks) {
        if (block.type === "reference") {
            blocks.push(block);
            continue;
        }
        blocks.push(...autoMentionTextBlock(block.text, imageOptions, usedIds));
    }
    return { version: 1, blocks: mergePromptTextBlocks(blocks) };
}

export function serializePromptDocument(document: CanvasPromptDocument, options: CanvasReferenceMentionOption[]) {
    const labelById = new Map(options.map((option) => [option.id, option.label]));
    return document.blocks.reduce((text, block) => {
        const value = block.type === "text" ? block.text : labelById.get(block.nodeId) || block.label;
        return block.type === "reference" && value.startsWith("@") ? `${text.replace(/@+$/, "")}${value}` : text + value;
    }, "");
}

export function validatePromptDocument(document: CanvasPromptDocument, options: CanvasReferenceMentionOption[]) {
    const availableIds = new Set(options.map((option) => option.id));
    return document.blocks.flatMap((block) => (block.type === "reference" && !availableIds.has(block.nodeId) ? [block.nodeId] : []));
}

export function remapPromptReferenceIds(document: CanvasPromptDocument, idMap: ReadonlyMap<string, string>): CanvasPromptDocument {
    return {
        ...document,
        blocks: document.blocks.map((block) => (block.type === "reference" ? { ...block, nodeId: idMap.get(block.nodeId) || block.nodeId } : { ...block })),
    };
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

function referenceImageName(option: CanvasReferenceMentionOption) {
    return (option.label.startsWith("@") ? option.label.slice(1) : option.detail || option.label).trim();
}

function autoMentionTextBlock(text: string, options: Array<{ option: CanvasReferenceMentionOption; name: string }>, usedIds: Set<string>) {
    const blocks: CanvasPromptDocument["blocks"] = [];
    let rest = text;
    while (rest) {
        const match = findNextImageNameMatch(rest, options, usedIds);
        if (!match) {
            blocks.push({ type: "text", text: rest });
            break;
        }
        const before = rest.slice(0, match.replaceStart);
        const after = rest.slice(match.index + match.name.length);
        if (before) blocks.push({ type: "text", text: before });
        blocks.push({ type: "reference", nodeId: match.option.id, kind: "image", label: match.option.label });
        usedIds.add(match.option.id);
        rest = needsSpaceAfterReference(after) ? ` ${after}` : after;
    }
    return blocks;
}

function findNextImageNameMatch(text: string, options: Array<{ option: CanvasReferenceMentionOption; name: string }>, usedIds: Set<string>) {
    return options
        .filter((item) => !usedIds.has(item.option.id))
        .map((item) => {
            const index = text.indexOf(item.name);
            return { ...item, index, replaceStart: index > 0 && text[index - 1] === "@" ? index - 1 : index };
        })
        .filter((item) => item.index >= 0)
        .sort((left, right) => left.replaceStart - right.replaceStart || right.name.length - left.name.length)[0];
}

function needsSpaceAfterReference(text: string) {
    return Boolean(text) && !/^[\s，。！？、；：,.!?;:]/.test(text);
}
