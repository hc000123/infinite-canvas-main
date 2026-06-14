import { buildWorkflowPromptAssetInput } from "../assets/workflow-asset-image.ts";
import type { WorkflowVideoReference } from "../video/use-video-package-store";

export type ParsedWorkflowAssetPrompt = {
    assetId: string;
    content: string;
    episode: string;
    importKey: string;
    prompt: string;
    projectSlug: string;
    sourcePath: string;
    title: string;
    typeLabel: string;
};

export type ParsedWorkflowVideoPrompt = {
    duration: string;
    episode: string;
    id: string;
    importKey: string;
    prompt: string;
    projectSlug: string;
    segment: string;
    sourcePath: string;
};

type ParseContext = {
    episode: string;
    projectSlug: string;
    sourcePath: string;
};

export function parseWorkflowAssetPrompts(markdown: string, context: ParseContext) {
    const sections = splitMarkdownSections(markdown);
    return sections
        .map((section) => parseAssetSection(section, context))
        .filter((item): item is ParsedWorkflowAssetPrompt => Boolean(item));
}

export const buildWorkflowTextAssetInput = buildWorkflowPromptAssetInput;

export function parseWorkflowImageReferenceTable(markdown: string): WorkflowVideoReference[] {
    const tableMatch = markdown.match(/##\s+素材对应表\s*\n([\s\S]*?)(?=\n##\s|$)/);
    const table = tableMatch?.[1] || "";
    return table
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^\|\s*@图\s*\d+\s*\|/.test(line))
        .map((line) => {
            const cells = line
                .split("|")
                .slice(1, -1)
                .map((cell) => cell.trim());
            return {
                name: cells[2] || "",
                ref: normalizeImageRef(cells[0]),
                type: cells[1] || "",
                usage: cells[3] || "",
            };
        })
        .filter((item) => item.ref && item.name);
}

export function parseWorkflowCopyOnlyPrompts(markdown: string, context: ParseContext) {
    const prompts: ParsedWorkflowVideoPrompt[] = [];
    const blockPattern = /^##\s+(.+?)\s*\n```(?:text)?\s*\n([\s\S]*?)\n```/gm;
    let match: RegExpExecArray | null;
    while ((match = blockPattern.exec(markdown))) {
        const heading = match[1].trim();
        const prompt = match[2].trim();
        if (!prompt) continue;
        const parts = heading.split("｜").map((item) => item.trim()).filter(Boolean);
        const id = parts[0] || `P${String(prompts.length + 1).padStart(2, "0")}`;
        const duration = parts.find((item) => /\d+\s*秒/.test(item)) || "";
        const segment = parts.find((item, index) => index > 0 && item !== duration) || heading.replace(id, "").replace(duration, "").replace(/[｜|]/g, "").trim() || id;
        prompts.push({
            duration,
            episode: readEpisodeFromText(heading) || context.episode,
            id,
            importKey: `${context.sourcePath}:${id}`,
            prompt,
            projectSlug: context.projectSlug,
            segment,
            sourcePath: context.sourcePath,
        });
    }
    return prompts;
}

function parseAssetSection(section: MarkdownSection, context: ParseContext): ParsedWorkflowAssetPrompt | null {
    if (!section.body.includes("**提示词**")) return null;
    const prompt = readField(section.body, "提示词");
    if (!prompt) return null;
    const assetId = readField(section.body, "素材ID") || readHeadingAssetId(section.title);
    const typeLabel = normalizeAssetType(readField(section.body, "素材类型"), context.sourcePath, assetId, section.title);
    const title = cleanAssetTitle(section.title, assetId);
    const episode = readEpisodeFromText(assetId) || readEpisodeFromText(section.title) || context.episode;
    const content = [
        `# ${title}`,
        "",
        assetId ? `素材ID：${assetId}` : "",
        `素材类型：${typeLabel}`,
        `来源文件：${context.sourcePath}`,
        "",
        section.body.trim(),
    ]
        .filter(Boolean)
        .join("\n");
    return {
        assetId,
        content,
        episode,
        importKey: `${context.sourcePath}:${assetId || title}`,
        prompt,
        projectSlug: context.projectSlug,
        sourcePath: context.sourcePath,
        title,
        typeLabel,
    };
}

type MarkdownSection = {
    body: string;
    title: string;
};

function splitMarkdownSections(markdown: string) {
    const matches = [...markdown.matchAll(/^(#{2,3})\s+(.+)$/gm)];
    const sections: MarkdownSection[] = [];
    matches.forEach((match, index) => {
        const title = match[2].trim();
        if (/规范读取记录|场景描述提示词|互动道具资产提示词/.test(title)) return;
        const start = match.index === undefined ? 0 : match.index + match[0].length;
        const end = matches[index + 1]?.index ?? markdown.length;
        sections.push({ body: markdown.slice(start, end).trim(), title });
    });
    return sections;
}

function readField(body: string, label: string) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = body.match(new RegExp(`\\*\\*${escaped}\\*\\*[:：]\\s*([\\s\\S]*?)(?=\\n\\*\\*[^\\n]+\\*\\*[:：]|\\n#{2,3}\\s|$)`));
    return match?.[1]?.trim() || "";
}

function readHeadingAssetId(title: string) {
    const match = title.match(/^(ep[\w-]+-[A-Z]+-\d+)/i);
    return match?.[1] || "";
}

function readEpisodeFromText(text: string) {
    return text.match(/ep[\w-]+/i)?.[0] || "";
}

function cleanAssetTitle(title: string, assetId: string) {
    const withoutId = assetId && title.startsWith(assetId) ? title.slice(assetId.length) : title;
    return withoutId
        .replace(/^｜/, "")
        .replace(/（[^）]*新增[^）]*）/g, "")
        .replace(/\([^)]*新增[^)]*\)/g, "")
        .trim();
}

function normalizeAssetType(type: string, sourcePath: string, assetId: string, title: string) {
    const text = `${type} ${sourcePath} ${assetId} ${title}`.toLowerCase();
    if (/角色|人物|char/.test(text)) return "角色";
    if (/道具|prop/.test(text)) return "道具";
    if (/服装|costume/.test(text)) return "服装";
    if (/场景|scene|sc\d+/.test(text)) return "场景";
    return "资产";
}

function normalizeImageRef(value: string) {
    const match = value.match(/@图\s*(\d+)/);
    return match ? `@图${Number(match[1])}` : "";
}
