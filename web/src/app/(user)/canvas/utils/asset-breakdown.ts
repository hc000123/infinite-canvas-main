import type { ProductionBibleAssetRef, ProductionBibleItem, ProductionBibleKind } from "./production-bible.ts";

export type AssetBreakdownKind = "character" | "scene" | "prop" | "style";
export type AssetBreakdownStatus = "draft" | "brief_ready" | "generated" | "linked";

export type AssetBreakdownBriefDraft = {
    id: string;
    title: string;
    kind: AssetBreakdownKind;
    prompt: string;
    createdAt: string;
};

export type AssetBreakdownItem = {
    id: string;
    projectId: string;
    canvasId: string;
    episodeId: string;
    episodeTitle: string;
    scriptId: string;
    kind: AssetBreakdownKind;
    name: string;
    description: string;
    sourceText: string;
    tags: string[];
    productionBibleItemId?: string;
    briefId?: string;
    briefDraft?: AssetBreakdownBriefDraft;
    assetIds: string[];
    status: AssetBreakdownStatus;
    createdAt: string;
    updatedAt: string;
};

export type AssetBreakdownWriteInput = Omit<AssetBreakdownItem, "id" | "createdAt" | "updatedAt">;

export function buildAssetBreakdownDraftsFromScript(input: { projectId: string; canvasId: string; episodeId: string; episodeTitle: string; scriptId: string; scriptText: string; now?: string }) {
    const now = input.now || new Date().toISOString();
    const base = {
        projectId: input.projectId,
        canvasId: input.canvasId,
        episodeId: input.episodeId,
        episodeTitle: input.episodeTitle,
        scriptId: input.scriptId,
        assetIds: [],
        status: "draft" as const,
        createdAt: now,
        updatedAt: now,
    };
    return mergeAssetBreakdownItems(
        [
            ...extractNamedItems(input.scriptText, "character", [/图片\s*\d+\s*([\u4e00-\u9fa5A-Za-z0-9_]{2,10})/g, /(?:角色|人物)[：:]\s*([^\n，,；;]+)/g], ["人物", "角色"]),
            ...extractNamedItems(
                input.scriptText,
                "scene",
                [
                    /(?:场景|地点|环境)[：:]\s*([^\n，,；;]+)/g,
                    /(?:走向|来到|进入|位于)([\u4e00-\u9fa5A-Za-z0-9_]{2,14}(?:现场|操场|教室|主席台|观礼区|办公室|街道|房间))/g,
                    /([\u4e00-\u9fa5A-Za-z0-9_]{2,14}(?:现场|操场|教室|主席台|观礼区|办公室|街道|房间))/g,
                ],
                ["场景", "地点"],
            ),
            ...extractNamedItems(input.scriptText, "prop", [/(?:道具|物件)[：:]\s*([^\n，,；;]+)/g, /(话筒|学士袍|信|手机|照片|戒指|书包|奖杯)/g], ["道具"]),
            ...extractStyleItems(input.scriptText),
        ].map((item, index) => ({ ...base, ...item, id: `asset-breakdown-draft-${index + 1}` })),
    );
}

export function mergeAssetBreakdownItems(items: AssetBreakdownItem[]) {
    const map = new Map<string, AssetBreakdownItem>();
    for (const item of items) {
        const key = `${item.projectId}:${item.episodeId}:${item.kind}:${normalizeName(item.name)}`;
        const existing = map.get(key);
        if (!existing) {
            map.set(key, { ...item, name: item.name.trim(), tags: uniqueStrings(item.tags) });
            continue;
        }
        map.set(key, {
            ...existing,
            description: [existing.description, item.description].filter(Boolean).join("\n"),
            sourceText: [existing.sourceText, item.sourceText].filter(Boolean).join("\n"),
            tags: uniqueStrings([...existing.tags, ...item.tags]),
            assetIds: uniqueStrings([...existing.assetIds, ...item.assetIds]),
            updatedAt: item.updatedAt > existing.updatedAt ? item.updatedAt : existing.updatedAt,
        });
    }
    return Array.from(map.values());
}

export function linkAssetBreakdownToProductionBible(item: AssetBreakdownItem, productionBibleItemId?: string): AssetBreakdownItem {
    return {
        ...item,
        productionBibleItemId: productionBibleItemId || undefined,
        status: productionBibleItemId ? "linked" : item.status,
        updatedAt: new Date().toISOString(),
    };
}

export function createAssetBreakdownBriefDraft(item: AssetBreakdownItem, id = `brief-${Date.now()}`, now = new Date().toISOString()): AssetBreakdownItem {
    const label = assetBreakdownKindLabel(item.kind);
    const briefDraft = {
        id,
        title: `${item.name} · ${label} Brief`,
        kind: item.kind,
        prompt: [
            `为短剧项目《${item.episodeTitle}》创建${label}参考图。`,
            `名称：${item.name}`,
            item.description ? `描述：${item.description}` : "",
            item.sourceText ? `剧本依据：${item.sourceText}` : "",
            item.tags.length ? `标签：${item.tags.join("、")}` : "",
        ]
            .filter(Boolean)
            .join("\n"),
        createdAt: now,
    };
    return { ...item, briefId: id, briefDraft, status: "brief_ready", updatedAt: now };
}

export function bindAssetBreakdownAssets(item: AssetBreakdownItem, assetIds: string[], now = new Date().toISOString()): AssetBreakdownItem {
    const nextAssetIds = uniqueStrings([...item.assetIds, ...assetIds]);
    return { ...item, assetIds: nextAssetIds, status: nextAssetIds.length ? "linked" : item.status, updatedAt: now };
}

export function buildAssetBreakdownAssetMetadata(metadata: Record<string, unknown> | undefined, item: AssetBreakdownItem): Record<string, unknown> {
    const records = Array.isArray(metadata?.assetBreakdownItems) ? metadata.assetBreakdownItems : [];
    return {
        ...(metadata || {}),
        episodeId: item.episodeId,
        episodeTitle: item.episodeTitle,
        assetBreakdownItemId: item.id,
        assetBreakdownItems: [...records.filter((record) => isAssetBreakdownRecord(record) && record.itemId !== item.id), { itemId: item.id, projectId: item.projectId, episodeId: item.episodeId, kind: item.kind, name: item.name }],
    };
}

export function buildAssetBreakdownProductionBibleAssetRefs(item: AssetBreakdownItem, assetIds: string[]): ProductionBibleAssetRef[] {
    return uniqueStrings(assetIds).map((assetId) => ({ assetId, role: assetBreakdownProductionBibleAssetRole(item.kind) }));
}

export function assetBreakdownProductionBibleAssetRole(kind: AssetBreakdownKind) {
    if (kind === "scene") return "environment";
    if (kind === "style") return "style";
    return "reference";
}

export function productionBibleKindForAssetBreakdown(kind: AssetBreakdownKind): ProductionBibleKind | undefined {
    return kind === "style" ? undefined : kind;
}

export function matchProductionBibleItem(item: AssetBreakdownItem, bibleItems: ProductionBibleItem[]) {
    const bibleKind = productionBibleKindForAssetBreakdown(item.kind);
    if (!bibleKind) return undefined;
    const normalizedName = normalizeName(item.name);
    return bibleItems.find((bible) => bible.projectId === item.projectId && bible.kind === bibleKind && normalizeName(bible.name) === normalizedName);
}

export function assetBreakdownKindLabel(kind: AssetBreakdownKind) {
    if (kind === "character") return "角色图";
    if (kind === "scene") return "场景图";
    if (kind === "prop") return "道具图";
    return "氛围参考图";
}

function extractNamedItems(text: string, kind: AssetBreakdownKind, patterns: RegExp[], tags: string[]) {
    const items: Array<Pick<AssetBreakdownItem, "kind" | "name" | "description" | "sourceText" | "tags">> = [];
    for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
            const name = cleanName(match[1] || match[0]);
            if (!name || name.length < 2) continue;
            items.push({ kind, name, description: "", sourceText: sourceSnippet(text, match.index || 0), tags });
        }
    }
    return items;
}

function extractStyleItems(text: string) {
    const keywords = ["白天", "夜晚", "暖光", "冷光", "逆光", "自然光", "电影感", "短剧", "真实", "毕业典礼"];
    return keywords
        .filter((keyword) => text.includes(keyword))
        .map((keyword) => ({
            kind: "style" as const,
            name: keyword,
            description: `${keyword} 视觉参考`,
            sourceText: sourceSnippet(text, text.indexOf(keyword)),
            tags: ["风格", "光影"],
        }));
}

function sourceSnippet(text: string, index: number) {
    const start = Math.max(0, index - 36);
    const end = Math.min(text.length, index + 80);
    return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function cleanName(value: string) {
    return (
        value
            .replace(/[。,.，、；;：:]/g, " ")
            .trim()
            .split(/[穿看坐走站抬注视来到进入位于拿着手持准备\s]+/)[0]
            .trim() || ""
    );
}

function normalizeName(value: string) {
    return value.trim().toLowerCase();
}

function isAssetBreakdownRecord(value: unknown): value is { itemId?: string } {
    return typeof value === "object" && Boolean(value);
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
