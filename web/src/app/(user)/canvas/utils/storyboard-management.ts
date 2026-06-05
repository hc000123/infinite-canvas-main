import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata, Position } from "../types.ts";
import { buildAssetVersionReference, type AssetVersionReference } from "../../assets/asset-version-references.ts";
import { canvasAssetReferenceMetadata } from "./canvas-asset-reference.ts";
import type { ProductionBibleKind } from "./production-bible.ts";
import type { ScriptEpisode, ScriptScene } from "./script-management.ts";

export type StoryboardAssetKind = "image" | "video" | "audio";
export type StoryboardShotStatus = "draft" | "ready" | "in_canvas" | "generating" | "review" | "done" | "error";

export type StoryboardAssetRef = {
    assetId: string;
    kind: StoryboardAssetKind;
    role: string;
    assetVersion?: AssetVersionReference;
};

export type StoryboardNodeRef = {
    nodeId: string;
    role: string;
};

export type StoryboardProductionBibleRef = {
    itemId: string;
    kind: ProductionBibleKind;
};

export type StoryboardGroup = {
    id: string;
    projectId: string;
    order: number;
    title: string;
    description: string;
    preset: Record<string, unknown>;
    shotIds: string[];
    createdAt: string;
    updatedAt: string;
};

export type StoryboardShot = {
    id: string;
    groupId: string;
    order: number;
    title: string;
    description: string;
    prompt: string;
    effectivePrompt: string;
    assetRefs: StoryboardAssetRef[];
    nodeRefs: StoryboardNodeRef[];
    resultAssetIds: string[];
    primaryAssetId?: string;
    lastResultNodeId?: string;
    lastTaskId?: string;
    errorMessage?: string;
    productionBibleRefs?: StoryboardProductionBibleRef[];
    status: StoryboardShotStatus;
    createdAt: string;
    updatedAt: string;
};

export type StoryboardGroupWriteInput = Omit<StoryboardGroup, "id" | "shotIds" | "createdAt" | "updatedAt">;
export type StoryboardShotWriteInput = Omit<StoryboardShot, "id" | "createdAt" | "updatedAt">;

type StoryboardAssetLike = {
    id: string;
    kind: string;
    title: string;
    coverUrl?: string;
    updatedAt?: string;
    metadata?: Record<string, unknown>;
    data?: Record<string, unknown>;
};

const NODE_SIZE = {
    text: { width: 340, height: 240 },
    image: { width: 340, height: 240 },
    video: { width: 420, height: 236 },
    audio: { width: 340, height: 120 },
    config: { width: 340, height: 240 },
};

export function normalizeStoryboardGroup(input: StoryboardGroupWriteInput): StoryboardGroupWriteInput {
    return {
        ...input,
        title: input.title.trim() || "未命名分镜组",
        description: input.description.trim(),
        preset: input.preset || {},
    };
}

export function normalizeStoryboardShot(input: StoryboardShotWriteInput): StoryboardShotWriteInput {
    return {
        ...input,
        title: input.title.trim() || `分镜 ${input.order}`,
        description: input.description.trim(),
        prompt: input.prompt.trim(),
        effectivePrompt: input.effectivePrompt.trim(),
        assetRefs: dedupeAssetRefs(input.assetRefs),
        nodeRefs: dedupeNodeRefs(input.nodeRefs),
        resultAssetIds: uniqueStrings(input.resultAssetIds.map((id) => id.trim()).filter(Boolean)),
        primaryAssetId: input.primaryAssetId?.trim() || undefined,
        lastResultNodeId: input.lastResultNodeId?.trim() || undefined,
        lastTaskId: input.lastTaskId?.trim() || undefined,
        errorMessage: input.errorMessage?.trim() || undefined,
        productionBibleRefs: dedupeBibleRefs(input.productionBibleRefs || []),
        status: input.status || "draft",
    };
}

export function applyStoryboardShotGenerationStarted(shots: StoryboardShot[], input: { storyboardShotId?: string; nodeId?: string; taskId?: string }) {
    if (!input.storyboardShotId) return shots;
    return shots.map((shot) => {
        if (shot.id !== input.storyboardShotId) return shot;
        return {
            ...shot,
            status: "generating" as const,
            lastResultNodeId: input.nodeId || shot.lastResultNodeId,
            lastTaskId: input.taskId || shot.lastTaskId,
            errorMessage: undefined,
            nodeRefs: mergeNodeRefs(shot.nodeRefs, resultNodeRefs(input.nodeId, input.taskId)),
            updatedAt: new Date().toISOString(),
        };
    });
}

export function applyStoryboardShotGenerationSuccess(shots: StoryboardShot[], input: { storyboardShotId?: string; assetId?: string; nodeId?: string; taskId?: string }) {
    if (!input.storyboardShotId) return shots;
    return shots.map((shot) => {
        if (shot.id !== input.storyboardShotId) return shot;
        const resultAssetIds = input.assetId && !shot.resultAssetIds.includes(input.assetId) ? [...shot.resultAssetIds, input.assetId] : shot.resultAssetIds;
        return {
            ...shot,
            status: "done" as const,
            resultAssetIds,
            primaryAssetId: shot.primaryAssetId || resultAssetIds[0],
            lastResultNodeId: input.nodeId || shot.lastResultNodeId,
            lastTaskId: input.taskId || shot.lastTaskId,
            errorMessage: undefined,
            nodeRefs: mergeNodeRefs(shot.nodeRefs, resultNodeRefs(input.nodeId, input.taskId)),
            updatedAt: new Date().toISOString(),
        };
    });
}

export function applyStoryboardShotGenerationError(shots: StoryboardShot[], input: { storyboardShotId?: string; nodeId?: string; taskId?: string; errorMessage?: string }) {
    if (!input.storyboardShotId) return shots;
    return shots.map((shot) => {
        if (shot.id !== input.storyboardShotId) return shot;
        return {
            ...shot,
            status: "error" as const,
            lastResultNodeId: input.nodeId || shot.lastResultNodeId,
            lastTaskId: input.taskId || shot.lastTaskId,
            errorMessage: input.errorMessage || "视频生成失败",
            nodeRefs: mergeNodeRefs(shot.nodeRefs, resultNodeRefs(input.nodeId, input.taskId)),
            updatedAt: new Date().toISOString(),
        };
    });
}

export function orderedStoryboardGroups(groups: StoryboardGroup[], projectId: string) {
    return groups.filter((group) => group.projectId === projectId).sort(compareOrder);
}

export function orderedStoryboardShots(shots: StoryboardShot[], groupId: string) {
    return shots.filter((shot) => shot.groupId === groupId).sort(compareOrder);
}

export function reorderStoryboardItems<T extends { id: string; order: number }>(items: T[], id: string, direction: "up" | "down", inScope: (item: T) => boolean = () => true) {
    const ordered = items.filter(inScope).sort(compareOrder);
    const index = ordered.findIndex((item) => item.id === id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return items;
    const current = ordered[index];
    const target = ordered[targetIndex];
    return items.map((item) => {
        if (item.id === current.id) return { ...item, order: target.order };
        if (item.id === target.id) return { ...item, order: current.order };
        return item;
    });
}

export function buildStoryboardGroupFromScriptScene(scene: ScriptScene, options: { projectId: string; groupId: string; shotId: string; preset?: Record<string, unknown> }) {
    const now = new Date().toISOString();
    const group: StoryboardGroup = {
        id: options.groupId,
        projectId: options.projectId,
        order: 1,
        title: scene.location ? `场 ${scene.order} · ${scene.location}` : `场 ${scene.order} 分镜`,
        description: scene.beat,
        preset: options.preset || {},
        shotIds: [options.shotId],
        createdAt: now,
        updatedAt: now,
    };
    return { group, shots: [{ ...scriptSceneToShot(scene, options.groupId, options.shotId, 1), createdAt: now, updatedAt: now }] };
}

export function buildStoryboardGroupFromScriptEpisode(episode: ScriptEpisode, scenes: ScriptScene[], options: { projectId: string; groupId: string; shotIds: string[]; preset?: Record<string, unknown> }) {
    const now = new Date().toISOString();
    const orderedScenes = [...scenes].sort(compareOrder);
    const shotIds = options.shotIds.slice(0, orderedScenes.length);
    const group: StoryboardGroup = {
        id: options.groupId,
        projectId: options.projectId,
        order: 1,
        title: `${episode.title} · 分镜组`,
        description: episode.summary,
        preset: options.preset || {},
        shotIds,
        createdAt: now,
        updatedAt: now,
    };
    return {
        group,
        shots: orderedScenes.map((scene, index) => ({ ...scriptSceneToShot(scene, options.groupId, shotIds[index], index + 1), createdAt: now, updatedAt: now })),
    };
}

export function planStoryboardGroupCanvasInsert({
    group,
    shots,
    assets,
    position,
    config,
    idFactory,
    connectionIdFactory,
}: {
    group: StoryboardGroup;
    shots: StoryboardShot[];
    assets: StoryboardAssetLike[];
    position: Position;
    config: { provider?: "openai" | "volcengine-ark"; model?: string; size?: string; seconds?: string; vquality?: string };
    idFactory: (prefix: string) => string;
    connectionIdFactory: (index: number) => string;
}) {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const nodes: CanvasNodeData[] = [];
    const connections: CanvasConnection[] = [];
    const shotNodeRefs: Record<string, StoryboardNodeRef[]> = {};
    let connectionIndex = 0;

    orderedStoryboardShots(shots, group.id).forEach((shot, shotIndex) => {
        const y = position.y + shotIndex * 340;
        const promptId = idFactory("storyboard-text");
        const configId = idFactory("storyboard-config");
        const rowRefs: StoryboardNodeRef[] = [{ nodeId: promptId, role: "prompt" }];
        const prompt = shot.effectivePrompt || shot.prompt || shot.description;

        nodes.push({
            id: promptId,
            type: "text" as CanvasNodeData["type"],
            title: shot.title || "分镜提示词",
            position: { x: position.x, y },
            width: NODE_SIZE.text.width,
            height: NODE_SIZE.text.height,
            metadata: storyboardMetadata(shot, group, { content: prompt, prompt, status: "success", fontSize: 14, storyboardRole: "prompt" }),
        });

        const assetNodeIds = shot.assetRefs
            .map((ref, index) => {
                const asset = assetsById.get(ref.assetId);
                if (!asset || (asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio")) return null;
                const nodeId = idFactory(`storyboard-${asset.kind}`);
                rowRefs.push({ nodeId, role: ref.role || "reference" });
                nodes.push(assetToCanvasNode(asset, ref, nodeId, { x: position.x + NODE_SIZE.text.width + 80, y: y + index * 160 }, group, shot));
                return nodeId;
            })
            .filter((id): id is string => Boolean(id));

        nodes.push({
            id: configId,
            type: "config" as CanvasNodeData["type"],
            title: "视频生成配置",
            position: { x: position.x + NODE_SIZE.text.width + 80 + NODE_SIZE.image.width + 80, y },
            width: NODE_SIZE.config.width,
            height: NODE_SIZE.config.height,
            metadata: storyboardMetadata(shot, group, {
                content: "",
                status: "idle",
                generationMode: "video",
                prompt,
                provider: config.provider,
                model: config.model,
                size: config.size,
                seconds: config.seconds,
                vquality: config.vquality,
                storyboardRole: "video_config",
                references: shot.assetRefs.map((ref) => `asset:${ref.assetId}`),
                referenceRoles: shot.assetRefs.map((ref, index) => ({ nodeId: assetNodeIds[index] || ref.assetId, kind: ref.kind, role: ref.role || "reference", index: index + 1 })),
            }),
        });
        rowRefs.push({ nodeId: configId, role: "video_config" });

        connections.push({ id: connectionIdFactory(connectionIndex++), fromNodeId: promptId, toNodeId: configId });
        assetNodeIds.forEach((nodeId) => connections.push({ id: connectionIdFactory(connectionIndex++), fromNodeId: nodeId, toNodeId: configId }));
        shotNodeRefs[shot.id] = rowRefs;
    });

    return { nodes, connections, shotNodeRefs };
}

function scriptSceneToShot(scene: ScriptScene, groupId: string, id: string, order: number): StoryboardShot {
    return {
        id,
        groupId,
        order,
        title: scene.location ? `场 ${scene.order} · ${scene.location}` : `场 ${scene.order}`,
        description: scene.beat,
        prompt: [scene.location ? `场景：${scene.location}` : "", scene.beat, scene.dialogue ? `对白：${scene.dialogue}` : "", scene.emotion ? `情绪：${scene.emotion}` : "", scene.durationHint ? `时长：${scene.durationHint}` : ""]
            .filter(Boolean)
            .join("\n"),
        effectivePrompt: "",
        assetRefs: [],
        nodeRefs: [],
        resultAssetIds: [],
        productionBibleRefs: [...scene.characterIds.map((itemId) => ({ itemId, kind: "character" as const })), ...(scene.sceneSettingId ? [{ itemId: scene.sceneSettingId, kind: "scene" as const }] : [])],
        status: "draft",
        createdAt: "",
        updatedAt: "",
    };
}

function assetToCanvasNode(asset: StoryboardAssetLike, ref: StoryboardAssetRef, id: string, position: Position, group: StoryboardGroup, shot: StoryboardShot): CanvasNodeData {
    const data = asset.data || {};
    const type = asset.kind as CanvasNodeData["type"];
    const content = String(data.dataUrl || data.url || asset.coverUrl || "");
    const width = Number(data.width) || NODE_SIZE[type as keyof typeof NODE_SIZE]?.width || NODE_SIZE.image.width;
    const height = Number(data.height) || NODE_SIZE[type as keyof typeof NODE_SIZE]?.height || NODE_SIZE.image.height;
    const assetVersion = ref.assetVersion || buildAssetVersionReference({ id: asset.id, updatedAt: asset.updatedAt || "", metadata: asset.metadata });
    return {
        id,
        type,
        title: asset.title,
        position,
        width: type === "audio" ? NODE_SIZE.audio.width : Math.min(width, type === "video" ? NODE_SIZE.video.width : NODE_SIZE.image.width),
        height: type === "audio" ? NODE_SIZE.audio.height : Math.min(height, type === "video" ? NODE_SIZE.video.height : NODE_SIZE.image.height),
        metadata: storyboardMetadata(shot, group, {
            content,
            status: "success",
            storageKey: typeof data.storageKey === "string" ? data.storageKey : undefined,
            bytes: typeof data.bytes === "number" ? data.bytes : undefined,
            mimeType: typeof data.mimeType === "string" ? data.mimeType : undefined,
            naturalWidth: typeof data.width === "number" ? data.width : undefined,
            naturalHeight: typeof data.height === "number" ? data.height : undefined,
            ...canvasAssetReferenceMetadata({ sourceAssetId: ref.assetId, assetVersion }),
            storyboardAssetRole: ref.role || "reference",
            storyboardRole: ref.role || "reference",
        }),
    };
}

function storyboardMetadata(shot: StoryboardShot, group: StoryboardGroup, metadata: CanvasNodeMetadata): CanvasNodeMetadata {
    return { ...metadata, storyboardGroupId: group.id, storyboardShotId: shot.id };
}

function dedupeAssetRefs(refs: StoryboardAssetRef[]) {
    const seen = new Set<string>();
    const result: StoryboardAssetRef[] = [];
    for (const ref of refs) {
        const assetId = ref.assetId.trim();
        if (!assetId || seen.has(assetId)) continue;
        seen.add(assetId);
        result.push({ assetId, kind: ref.kind, role: ref.role.trim() || "reference", ...(ref.assetVersion ? { assetVersion: ref.assetVersion } : {}) });
    }
    return result;
}

function dedupeNodeRefs(refs: StoryboardNodeRef[]) {
    const seen = new Set<string>();
    const result: StoryboardNodeRef[] = [];
    for (const ref of refs) {
        const nodeId = ref.nodeId.trim();
        if (!nodeId || seen.has(nodeId)) continue;
        seen.add(nodeId);
        result.push({ nodeId, role: ref.role.trim() || "reference" });
    }
    return result;
}

function resultNodeRefs(nodeId?: string, taskId?: string) {
    return [...(nodeId ? [{ nodeId, role: "result_video" }] : []), ...(taskId ? [{ nodeId: taskId, role: "video_task" }] : [])];
}

function mergeNodeRefs(current: StoryboardNodeRef[], next: StoryboardNodeRef[]) {
    return dedupeNodeRefs([...current, ...next]);
}

function dedupeBibleRefs(refs: StoryboardProductionBibleRef[]) {
    const seen = new Set<string>();
    const result: StoryboardProductionBibleRef[] = [];
    for (const ref of refs) {
        const itemId = ref.itemId.trim();
        const key = `${ref.kind}:${itemId}`;
        if (!itemId || seen.has(key)) continue;
        seen.add(key);
        result.push({ itemId, kind: ref.kind });
    }
    return result;
}

function compareOrder<T extends { order: number; createdAt?: string }>(a: T, b: T) {
    if (a.order !== b.order) return a.order - b.order;
    return (a.createdAt || "").localeCompare(b.createdAt || "");
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values));
}
