import type { Asset } from "@/stores/use-asset-store";
import type { ReferenceImage } from "@/types/image";
import { activeVolcengineAssetURI } from "../../../services/volcengine-asset-metadata.ts";

import type { AssetKind, ProductionPackage, WorkflowShotDraft, WorkflowVideoReference } from "./use-video-package-store";

export function buildImportedVideoPackage(input: { duration: string; episode: string; episodeId?: string; id: string; order?: number; projectId?: string; projectSlug?: string; sceneKey?: string; sourceProjectId?: string; prompt: string; references?: WorkflowVideoReference[]; segment: string; sourcePath: string; sourceScript?: string; shotDraft?: WorkflowShotDraft }): ProductionPackage {
    const duration = input.duration || inferDuration(input.prompt) || "6秒";
    const references = input.references || [];
    const usedReferences = referencesUsedByPrompt(input.prompt, references);
    const fallbackReferences = references.length
        ? []
        : promptReferenceRefs(input.prompt).map((ref): WorkflowVideoReference => ({ name: "未解析参考图", ref, type: "参考图" }));
    const packageReferences = references.length ? references : fallbackReferences;
    const declaredAssets = usedReferences.length ? usedReferences : fallbackReferences;
    const item: ProductionPackage = {
        assetStatus: declaredAssets.length ? "缺角色图" : "完整",
        assets: declaredAssets.map((item) => ({ kind: workflowReferenceAssetKind(item), name: `${item.ref} ${item.name}`, status: "缺失" })),
        canvasStatus: "未导入",
        config: { duration, frames: "按提示词引用素材", model: "Seedance 2.0", motion: "中", ratio: "9:16", resolution: "1080p" },
        duration,
        episodeId: input.episodeId || input.episode || "unscoped-episode",
        id: input.id,
        order: input.order ?? Number(input.id.match(/\d+/)?.[0] || 0),
        prompt: input.prompt,
        promptStatus: input.prompt ? "已确认" : "待审核",
        projectId: input.projectId || input.sourceProjectId || input.projectSlug || "unscoped-project",
        risks: [{ level: "提示", text: "来自视频工作流 Copy-only，已按最终提示词确认；如提示词含 @图N，可在生成前按需补充参考素材。" }],
        sceneKey: input.sceneKey || input.segment || input.id,
        segment: input.segment,
        source: input.sourcePath,
        sourceEpisode: input.episode,
        sourceProjectId: input.sourceProjectId,
        sourceProjectSlug: input.projectSlug,
        sourceScript: input.sourceScript || input.segment,
        shotDraft: input.shotDraft,
        shotStatus: input.shotDraft ? "confirmed" : "draft",
        promptInputHash: "",
        referenceBindings: [],
        tags: summarizePromptTags(input.prompt),
        workflowReferences: packageReferences,
    };
    item.promptInputHash = input.prompt ? workflowPromptInputHash(item) : "";
    return item;
}

export function workflowPromptInputHash(item: ProductionPackage) {
    const payload = JSON.stringify({
        continuityVersion: item.continuityReference?.version || "",
        references: [...(item.referenceBindings || [])]
            .map(({ logicalAssetId, libraryAssetId, version, usage }) => ({ logicalAssetId: cleanHashText(logicalAssetId), libraryAssetId: cleanHashText(libraryAssetId), version: cleanHashText(version), usage: cleanHashText(usage) }))
            .sort((left, right) => `${left.logicalAssetId}:${left.libraryAssetId}`.localeCompare(`${right.logicalAssetId}:${right.libraryAssetId}`)),
        shotDraft: normalizeHashRecord(item.shotDraft),
        sourceScript: cleanHashText(item.sourceScript || ""),
    });
    let hash = 2166136261;
    for (let index = 0; index < payload.length; index += 1) {
        hash ^= payload.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `wf2-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeHashRecord(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalizeHashRecord);
    if (!value || typeof value !== "object") return typeof value === "string" ? cleanHashText(value) : value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, normalizeHashRecord(entry)]));
}

function cleanHashText(value: string) {
    return value.trim().replace(/\s+/g, " ");
}

export function referencesUsedByPrompt(prompt: string, references: WorkflowVideoReference[]) {
    const referenceMap = new Map(references.map((item) => [item.ref, item]));
    return promptReferenceRefs(prompt)
        .map((ref) => referenceMap.get(ref))
        .filter((item): item is WorkflowVideoReference => Boolean(item));
}

function workflowReferencesForSubmission(item: ProductionPackage) {
    const references = item.workflowReferences || [];
    if (!item.referenceBindings?.length) return referencesUsedByPrompt(item.prompt, references);
    return [...references].sort((left, right) => referenceNumber(left.ref) - referenceNumber(right.ref));
}

export function resolveWorkflowReferenceImages(item: ProductionPackage, assets: Asset[]): ReferenceImage[] {
    const references = workflowReferencesForSubmission(item);
    const resolved = references
        .map((reference): ReferenceImage | null => {
            const asset = findWorkflowReferenceAsset(reference, assets);
            if (!asset || asset.kind !== "image") return null;
            const image: ReferenceImage = {
                assetUri: activeVolcengineAssetURI(asset.metadata?.volcengineAsset),
                dataUrl: asset.data.dataUrl,
                id: asset.id,
                name: `${reference.ref} ${reference.name}`.trim(),
                seedanceRole: "reference_image",
                storageKey: asset.data.storageKey,
                type: asset.data.mimeType,
                url: asset.data.dataUrl,
                volcengineAssetId: readString(asset.metadata?.volcengineAsset?.assetId),
                volcengineAssetStatus: readString(asset.metadata?.volcengineAsset?.status),
            };
            return image;
        })
        .filter((image): image is ReferenceImage => Boolean(image));
    const continuity = item.continuityReference ? assets.find((asset) => asset.id === item.continuityReference?.libraryAssetId && asset.kind === "image") : null;
    const regular = resolved.slice(0, continuity ? 8 : 9);
    if (continuity?.kind === "image") regular.push({ dataUrl: continuity.data.dataUrl, id: continuity.id, name: `@图${regular.length + 1} 上一镜尾帧连续性参考`, seedanceRole: "reference_image", storageKey: continuity.data.storageKey, type: continuity.data.mimeType, url: continuity.data.dataUrl });
    return regular;
}

export function isWorkflowReferenceAssetBound(item: ProductionPackage, assetName: string, assets: Asset[]) {
    return Boolean(resolveWorkflowReferenceAssetForName(item, assetName, assets)?.kind === "image");
}

export function resolveWorkflowReferenceAssetForName(item: ProductionPackage, assetName: string, assets: Asset[]) {
    const ref = promptReferenceRefs(assetName)[0];
    if (!ref) return null;
    const reference = item.workflowReferences?.find((entry) => entry.ref === ref);
    return reference ? findWorkflowReferenceAsset(reference, assets) || null : null;
}

export function resolveWorkflowReferenceAssets(item: ProductionPackage, assets: Asset[]) {
    const references = item.workflowReferences?.length ? referencesUsedByPrompt(item.prompt, item.workflowReferences) : [];
    return references.map((reference) => findWorkflowReferenceAsset(reference, assets)).filter((asset): asset is Asset => Boolean(asset));
}

export function workflowReferenceBindingSummary(item: ProductionPackage, assets: Asset[]) {
    const references = workflowReferencesForSubmission(item);
    const bound = references.filter((reference) => findWorkflowReferenceAsset(reference, assets)?.kind === "image").length;
    return { bound, total: references.length };
}

export function workflowVideoGenerationReadiness(item: ProductionPackage, assets: Asset[], videoProtocol?: string) {
    const summary = workflowReferenceBindingSummary(item, assets);
    const images = resolveWorkflowReferenceImages(item, assets);
    if (item.shotDraft && item.promptInputHash !== workflowPromptInputHash(item)) {
        return { message: "当前提示词与分镜或参考图版本不一致，请重新生成并确认。", status: "blocked" as const };
    }
    const authoringIssue = workflowPromptAuthoringIssue(item.prompt, item.duration);
    if (authoringIssue) return { message: authoringIssue, status: "blocked" as const };
    if (!item.workflowReferences?.length && item.assetStatus !== "完整") {
        return { message: "当前生产包缺少素材对应表，建议从视频工作流重新同步 Copy-only；也可以继续按纯文本生成。", status: "warning" as const };
    }
    if (videoProtocol === "volcengine-ark") {
        const pending = images.find((image) => image.volcengineAssetStatus && image.volcengineAssetStatus !== "Active");
        if (pending) {
            return { message: `${pending.name} 的火山加白状态为 ${pending.volcengineAssetStatus}，需要刷新到 Active 后再生成。`, status: "blocked" as const };
        }
        const missingAssetUri = images.find((image) => image.volcengineAssetStatus === "Active" && !image.assetUri);
        if (missingAssetUri) {
            return { message: `${missingAssetUri.name} 已显示 Active 但缺少 asset:// 素材 ID，需要重新加白或刷新后再生成。`, status: "blocked" as const };
        }
    }
    if (summary.total > summary.bound) {
        return { message: `还有 ${summary.total - summary.bound} 个 @图N 未匹配到我的素材；可以继续按文本生成，也可以先补参考图。`, status: "warning" as const };
    }
    return { message: summary.total ? "参考资产已匹配，可提交企业视频生成。" : "当前生产包没有声明参考图，可直接按文本生成。", status: "ready" as const };
}

export function workflowPromptAuthoringIssue(prompt: string, durationText: string) {
    return promptDialogueBudgetIssue(prompt, durationText) || promptStructureIssue(prompt);
}

export function alignWorkflowPromptReferencesForSeedance(prompt: string, images: ReferenceImage[]) {
    return images.reduce((text, image, index) => {
        const ref = image.name.match(/@图\s*(\d+)/)?.[1];
        if (!ref) return text;
        return text.replace(new RegExp(`@图\\s*${ref}(?!\\d)`, "g"), `图片 ${index + 1}`);
    }, prompt);
}

export function enterpriseVideoChannelReadiness(input: { isPublicSettingsLoading?: boolean; videoProtocol?: string }) {
    if (input.isPublicSettingsLoading) return { message: "正在读取企业视频配置，请稍后再试。", status: "checking" as const };
    if (input.videoProtocol === "volcengine-ark") return { message: "企业 Ark / Seedance 视频通道已启用。", status: "ready" as const };
    return { message: "当前视频通道不是企业 Ark / Seedance，请先确认后台系统设置已把视频模型映射到 volcengine-ark。", status: "blocked" as const };
}

function promptReferenceRefs(prompt: string) {
    return [...new Set([...prompt.matchAll(/@图\s*(\d+)/g)].map((match) => `@图${Number(match[1])}`))];
}

function referenceNumber(ref: string) {
    return Number(ref.match(/\d+/)?.[0] || Number.MAX_SAFE_INTEGER);
}

function findWorkflowReferenceAsset(reference: WorkflowVideoReference, assets: Asset[]) {
    if (reference.libraryAssetId) {
        const stable = assets.find((asset) => asset.id === reference.libraryAssetId);
        if (stable) return stable;
    }
    const refName = normalizeText(reference.name);
    const exactMatchOnly = /人物|角色/.test(reference.type);
    return assets.find((asset) => {
        const info = readRecord(asset.metadata?.originalWorkflow);
        const assetId = normalizeText(readString(info?.assetId));
        const title = normalizeText(asset.title);
        if (exactMatchOnly) return Boolean(refName && (title === refName || assetId === refName));
        return Boolean(refName && (title.includes(refName) || refName.includes(title.replace(/·.+$/, "").trim()) || assetId.includes(refName)));
    });
}

function workflowReferenceAssetKind(reference: WorkflowVideoReference): AssetKind {
    if (/人物|角色/.test(reference.type)) return "角色图";
    if (/场景/.test(reference.type)) return "场景图";
    return "道具图";
}

function inferDuration(prompt: string) {
    return prompt.match(/目标生成时长[:：]\s*(\d+\s*秒)/)?.[1] || prompt.match(/(\d+\s*秒)/)?.[1] || "";
}

function promptDialogueBudgetIssue(prompt: string, durationText: string) {
    const shotBudgets = promptShotDurationBudgets(prompt);
    const blocks = promptShotBlocks(prompt);
    const targets = blocks.length ? blocks : [{ label: "", text: prompt }];
    const fallbackSeconds = parseSeconds(durationText || inferDuration(prompt));
    for (const block of targets) {
        const seconds = block.label ? shotBudgets.get(block.label) || parseSeconds(block.text) || fallbackSeconds : fallbackSeconds;
        if (!seconds) continue;
        const dialogueText = extractDialogueText(block.text);
        const dialogueChars = countSpokenChars(dialogueText);
        if (!dialogueChars) continue;
        const maxChars = Math.max(8, Math.floor(seconds * 5 + 5));
        if (dialogueChars > maxChars) {
            const label = block.label ? `分镜${block.label}` : "当前片段";
            return `${label} 台词约 ${dialogueChars} 字，${seconds} 秒内建议不超过 ${maxChars} 字；请缩短台词、拆分镜头或增加时长后再生成。`;
        }
    }
    return "";
}

function promptStructureIssue(prompt: string) {
    if (looksLikeCopyOnlyPrompt(prompt)) return copyOnlyPromptStructureIssue(prompt);
    if (looksLikeSkill5Prompt(prompt)) return skill5PromptStructureIssue(prompt);
    return legacyWorkflowPromptStructureIssue(prompt);
}

function copyOnlyPromptStructureIssue(prompt: string) {
    const requiredSections = ["场景", "声音", "画面内容", "限制"];
    const missingSection = requiredSections.find((section) => !new RegExp(`${section}[：:]`).test(prompt));
    if (missingSection) return `提示词缺少“${missingSection}”，疑似简化版提示词；请回到 Stage 3 重新生成 Copy-only。`;
    if (!/\b\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?秒/.test(prompt)) return "提示词缺少逐时间段描述，请回到 Stage 3 重新生成 Copy-only。";
    if (/简化版提示词|摘要版|骨架版|占位符|后续补充/.test(prompt)) return "提示词包含简化/摘要/占位符写法，请回到 Stage 3 输出完整 Copy-only。";
    return "";
}

function skill5PromptStructureIssue(prompt: string) {
    const requiredSections = ["场景", "人物位置关系", "情绪基调"];
    const missingSection = requiredSections.find((section) => !new RegExp(`${section}[：:]`).test(prompt));
    if (missingSection) return `提示词缺少“${missingSection}”，疑似简化版提示词；请回到 Stage 3 重新生成完整 Skill 5 执行稿。`;
    const shotBlocks = promptShotBlocks(prompt);
    if (shotBlocks.length < 2) return "提示词少于 2 个分镜，疑似摘要版提示词；请回到 Stage 3 重写。";
    const shotFields = ["焦段", "光圈", "机位", "构图", "运镜", "主体动作/表情"];
    for (const block of shotBlocks) {
        const missingField = shotFields.find((field) => !new RegExp(`${field}[：:]`).test(block.text));
        if (missingField) return `分镜${block.label} 缺少“${missingField}”字段，请补齐 Skill 5 的 6 字段分镜后再生成视频。`;
    }
    if (/简化版提示词|摘要版|骨架版|占位符|后续补充/.test(prompt)) return "提示词包含简化/摘要/占位符写法，请回到 Stage 3 输出完整执行稿。";
    return "";
}

function legacyWorkflowPromptStructureIssue(prompt: string) {
    const requiredSections = ["基础设定", "场景起始状态", "场景固定视觉设定", "画面内容分镜", "兜底约束", "生产审核用时间预算校验"];
    const missingSection = requiredSections.find((section) => !prompt.includes(section));
    if (missingSection) return `提示词缺少“${missingSection}”，疑似简化版提示词；请回到 Stage 3 重新生成完整 Skill 5 / 执行稿。`;
    const fixedVisualFields = ["场景空间", "场景材质", "固定道具", "固定光源", "固定色彩影调", "摄影机与成像系统", "固定画幅", "固定景深原则", "环境颗粒", "画面稳定目标"];
    const missingFixedField = fixedVisualFields.find((field) => !prompt.includes(field));
    if (missingFixedField) return `场景固定视觉设定缺少“${missingFixedField}”，请补完整后再同步视频生产包。`;
    const shotBlocks = promptShotBlocks(prompt);
    if (shotBlocks.length < 2) return "提示词少于 2 个分镜，疑似摘要版提示词；请回到 Stage 3 重写。";
    const shotFields = ["景别", "构图", "运镜手法", "画面内容", "声音/台词"];
    for (const block of shotBlocks) {
        const missingField = shotFields.find((field) => !new RegExp(`${field}[：:]`).test(block.text));
        if (missingField) return `分镜${block.label} 缺少“${missingField}”字段，请补齐字段式分镜后再生成视频。`;
    }
    if (!/分镜\s*[一二三四五六七八九十百\d]+\s*约\s*\d+(?:\.\d+)?\s*秒/.test(prompt)) return "生产审核用时间预算校验缺少逐分镜秒数预算，请补齐后再同步视频生产包。";
    if (/简化版提示词|摘要版|骨架版|占位符|后续补充/.test(prompt)) return "提示词包含简化/摘要/占位符写法，请回到 Stage 3 输出完整执行稿。";
    return "";
}

function looksLikeSkill5Prompt(prompt: string) {
    return ["焦段", "光圈", "机位", "主体动作/表情"].every((field) => new RegExp(`${field}[：:]`).test(prompt));
}

function looksLikeCopyOnlyPrompt(prompt: string) {
    return ["场景", "声音", "画面内容", "限制"].every((field) => new RegExp(`${field}[：:]`).test(prompt));
}

function promptShotDurationBudgets(prompt: string) {
    const budgets = new Map<string, number>();
    for (const match of prompt.matchAll(/分镜\s*([一二三四五六七八九十百\d]+)\s*约\s*(\d+(?:\.\d+)?)\s*秒/g)) {
        budgets.set(match[1], Number(match[2]));
    }
    return budgets;
}

function promptShotBlocks(prompt: string) {
    const matches = [...prompt.matchAll(/(?:^|\n|[▸•\-]\s*)[【\[]?\s*分镜\s*([一二三四五六七八九十百\d]+)(?:[】\]])?/g)];
    return matches.map((match, index) => {
        const start = match.index || 0;
        const end = index + 1 < matches.length ? matches[index + 1].index || prompt.length : prompt.length;
        return { label: match[1], text: prompt.slice(start, end) };
    });
}

function parseSeconds(text: string) {
    const match = text.match(/(\d+(?:\.\d+)?)\s*秒/);
    return match ? Number(match[1]) : 0;
}

function extractDialogueText(text: string) {
    const parts: string[] = [];
    for (const match of text.matchAll(/[“「『"]([^”」』"]{2,})[”」』"]/g)) parts.push(match[1]);
    for (const match of text.matchAll(/(?:台词|对白|旁白|声音\/台词|声音台词)[：:]\s*([^\n]+)/g)) {
        if (!/[“「『"]/.test(match[1])) parts.push(match[1]);
    }
    return parts
        .map((item) => item.replace(/（[^）]*）|\([^)]*\)/g, "").trim())
        .filter((item) => item && !/^(无|没有|环境音|掌声|音乐|音效|沉默|静默)/.test(item))
        .join("");
}

function countSpokenChars(text: string) {
    return (text.match(/[\p{Script=Han}A-Za-z0-9]/gu) || []).length;
}

function summarizePromptTags(prompt: string): ProductionPackage["tags"] {
    const text = prompt.replace(/\s+/g, " ");
    return {
        光影: pickSentence(text, /(光源|色彩|影调|暖光|冷光|暗部|主光|辅光)/),
        主体动作: pickSentence(text, /(动作|姿态|表演|行动|反应|站|走|看|握|抬头)/),
        环境: pickSentence(text, /(场景空间|空间|环境|仓库|巷|旅馆|房间|街|港)/),
        节奏: pickSentence(text, /(时长|节奏|停顿|缓慢|快速|悬停)/),
        运镜: pickSentence(text, /(运镜|镜头|推近|横移|固定|摇|跟随)/),
    };
}

function pickSentence(text: string, pattern: RegExp) {
    const parts = text
        .split(/[。；\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    return parts.find((item) => pattern.test(item))?.slice(0, 80) || "待确认";
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function normalizeText(value: string) {
    return value
        .replace(/^@图\s*\d+/, "")
        .replace(/[·｜|（(].*$/g, "")
        .replace(/\s+/g, "")
        .toLowerCase();
}
