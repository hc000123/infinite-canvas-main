import type { AssetWriteInput } from "@/stores/use-asset-store";
import type { ReferenceImage } from "@/types/image";
import type { StoryboardTableShot } from "../canvas/utils/storyboard-management";

export type StoryboardImageConfigValue = {
    imageModel: string;
    quality: string;
    size: string;
    count: string;
};

export type StoryboardTableShotWithImages = StoryboardTableShot & {
    imagePrompt?: string;
    imageConfig?: StoryboardImageConfigValue;
    referenceImageIds?: string[];
    selectedCandidateId?: string;
};

export type StoryboardCandidateLike = {
    id: string;
    shotId: string;
    title: string;
    dataUrl: string;
    storageKey?: string;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
    prompt?: string;
    model?: string;
    quality?: string;
    size?: string;
};

export function isAssetImageWorkbenchContext(params: Pick<URLSearchParams, "get">) {
    return ["libraryAssetId", "assetId", "briefId"].some((key) => Boolean(params.get(key)?.trim()));
}

export function defaultShotImagePrompt(shot: StoryboardTableShotWithImages) {
    if (shot.imagePrompt?.trim()) return shot.imagePrompt.trim();
    const framing = [shot.shotSize, shot.cameraMovement].filter(Boolean).join("，");
    const scene = [shot.sceneName, shot.location, shot.timeOfDay].filter(Boolean).join(" / ");
    const performance = [shot.visualDescription, shot.action, shot.emotion ? `情绪：${shot.emotion}` : ""].filter(Boolean).join("。 ");
    const dialogue = shot.dialogue ? `对白情境：${shot.dialogue}` : "";
    return [framing, scene ? `场景：${scene}` : "", performance || shot.scriptText, dialogue].filter(Boolean).join("。 ").replace(/。\s*。/g, "。").trim();
}

export function orderedEpisodeShots(shots: StoryboardTableShotWithImages[], canvasId: string, episodeId: string) {
    return shots.filter((shot) => shot.canvasId === canvasId && shot.episodeId === episodeId).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

export function reorderShotIds(ids: string[], activeId: string, overId: string) {
    const activeIndex = ids.indexOf(activeId);
    const overIndex = ids.indexOf(overId);
    if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return ids;
    const next = [...ids];
    const [active] = next.splice(activeIndex, 1);
    next.splice(overIndex, 0, active);
    return next;
}

export function copyableShotConfig(source: StoryboardTableShotWithImages) {
    return {
        imagePrompt: defaultShotImagePrompt(source),
        imageConfig: source.imageConfig ? { ...source.imageConfig } : undefined,
        referenceImageIds: [...(source.referenceImageIds || [])],
    };
}

export function referenceToken(index: number) {
    return `@参考图${index + 1}`;
}

export function buildShotReferencePrompt(prompt: string, references: ReferenceImage[]) {
    const lines = references.flatMap((reference, index) => {
        const token = referenceToken(index);
        const used = new RegExp(`${escapeRegExp(token)}(?!\\d)`).test(prompt);
        if (!used) return [];
        const label = reference.name?.replace(/\s+/g, " ").trim().slice(0, 40);
        return [`${token} 对应随请求附带的第 ${index + 1} 张参考图${label ? `（${label}）` : ""}。`];
    });
    return lines.length ? `${prompt}\n\n参考图引用：\n${lines.join("\n")}` : prompt;
}

export function storyboardCandidateAssetInput(shot: StoryboardTableShotWithImages, candidate: StoryboardCandidateLike): AssetWriteInput {
    return {
        kind: "image",
        title: `${shot.title || `镜头 ${shot.order}`} · 分镜图`,
        coverUrl: candidate.dataUrl,
        tags: ["分镜", shot.sceneName].filter(Boolean),
        source: "分镜制作台",
        note: candidate.prompt || defaultShotImagePrompt(shot),
        data: {
            dataUrl: candidate.dataUrl,
            storageKey: candidate.storageKey,
            width: candidate.width,
            height: candidate.height,
            bytes: candidate.bytes,
            mimeType: candidate.mimeType || "image/png",
        },
        metadata: {
            source: "storyboard-workbench",
            projectId: shot.projectId,
            episodeId: shot.episodeId,
            canvasId: shot.canvasId,
            storyboardShotId: shot.id,
            generation: {
                prompt: candidate.prompt || defaultShotImagePrompt(shot),
                model: candidate.model || "",
                quality: candidate.quality || "",
                size: candidate.size || `${candidate.width}x${candidate.height}`,
            },
        },
    };
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
