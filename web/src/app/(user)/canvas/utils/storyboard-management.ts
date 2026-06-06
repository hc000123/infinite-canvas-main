import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata, Position } from "../types.ts";
import { buildAssetVersionReference, type AssetVersionReference } from "../../assets/asset-version-references.ts";
import { canvasAssetReferenceMetadata } from "./canvas-asset-reference.ts";
import type { ProductionBibleKind } from "./production-bible.ts";
import type { ScriptEpisode, ScriptScene } from "./script-management.ts";

export type StoryboardAssetKind = "image" | "video" | "audio";
export type StoryboardShotStatus = "draft" | "ready" | "in_canvas" | "generating" | "review" | "done" | "error";
export type ShotGroupStatus = "draft" | "prompt_ready" | "in_canvas" | "generating" | "done" | "error";

export type StoryboardAssetRef = {
    assetId: string;
    kind: StoryboardAssetKind;
    role: string;
    source?: "asset_breakdown" | "independent" | "agent_asset_extractor" | "manual" | "independent_image_brief" | "production_bible" | "unknown";
    sourceLabel?: string;
    assetVersion?: AssetVersionReference;
    isAutoMatched?: boolean;
    isPrimaryReference?: boolean;
    assetBreakdownItemId?: string;
    imageBriefId?: string;
    matchReasons?: string[];
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

export type StoryboardTableShot = {
    id: string;
    projectId: string;
    canvasId: string;
    episodeId: string;
    sceneId?: string;
    sceneName: string;
    location: string;
    timeOfDay: string;
    order: number;
    title: string;
    scriptText: string;
    visualDescription: string;
    characters: string[];
    dialogue: string;
    action: string;
    emotion: string;
    shotSize: string;
    cameraMovement: string;
    estimatedDuration: number;
    assetNeeds?: string[];
    assetRefs: StoryboardAssetRef[];
    productionBibleRefs?: StoryboardProductionBibleRef[];
    agentRunId?: string;
    agentConfigId?: string;
    agentConfigVersion?: string;
    inputScriptSnapshotHash?: string;
    sourceType?: string;
    workflowSource?: {
        sourceType: "workflow_mapping_preview";
        workflowId: string;
        workflowRunId: string;
        workflowVersion: string;
        stageId: string;
        agentId: string;
        sourceOutputId: string;
        previewId: string;
        previewItemId: string;
        sourceFiles: string[];
        qualityGateIds: string[];
        createdFromText: string;
    };
    createdAt: string;
    updatedAt: string;
};

export type ShotGroup = {
    id: string;
    projectId: string;
    canvasId: string;
    episodeId: string;
    sceneName: string;
    shotIds: string[];
    totalDuration: number;
    prompt: string;
    effectivePrompt: string;
    assetRefs: StoryboardAssetRef[];
    audioRefs: StoryboardAssetRef[];
    productionBibleRefs?: StoryboardProductionBibleRef[];
    agentRunId?: string;
    agentConfigId?: string;
    agentConfigVersion?: string;
    sourceType?: string;
    status: ShotGroupStatus;
    taskId?: string;
    resultAssetIds: string[];
    primaryAssetId?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
};

export type StoryboardGroupWriteInput = Omit<StoryboardGroup, "id" | "shotIds" | "createdAt" | "updatedAt">;
export type StoryboardShotWriteInput = Omit<StoryboardShot, "id" | "createdAt" | "updatedAt">;
export type StoryboardTableShotWriteInput = Omit<StoryboardTableShot, "id" | "createdAt" | "updatedAt">;
export type ShotGroupWriteInput = Omit<ShotGroup, "id" | "createdAt" | "updatedAt">;

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

export function normalizeStoryboardTableShot(input: StoryboardTableShotWriteInput): StoryboardTableShotWriteInput {
    return {
        ...input,
        sceneId: input.sceneId?.trim() || undefined,
        sceneName: input.sceneName.trim() || "未命名场次",
        location: input.location.trim(),
        timeOfDay: input.timeOfDay.trim(),
        title: input.title.trim() || `镜头 ${input.order}`,
        scriptText: input.scriptText.trim(),
        visualDescription: input.visualDescription.trim(),
        characters: uniqueStrings(input.characters.map((item) => item.trim()).filter(Boolean)),
        dialogue: input.dialogue.trim(),
        action: input.action.trim(),
        emotion: input.emotion.trim(),
        shotSize: input.shotSize.trim(),
        cameraMovement: input.cameraMovement.trim(),
        estimatedDuration: clampDuration(input.estimatedDuration),
        assetNeeds: uniqueStrings((input.assetNeeds || []).map((item) => item.trim()).filter(Boolean)),
        assetRefs: dedupeAssetRefs(input.assetRefs),
        productionBibleRefs: dedupeBibleRefs(input.productionBibleRefs || []),
        agentRunId: input.agentRunId?.trim() || undefined,
        agentConfigId: input.agentConfigId?.trim() || undefined,
        agentConfigVersion: input.agentConfigVersion?.trim() || undefined,
        inputScriptSnapshotHash: input.inputScriptSnapshotHash?.trim() || undefined,
        sourceType: input.sourceType?.trim() || undefined,
        workflowSource:
            input.workflowSource && input.workflowSource.sourceType === "workflow_mapping_preview"
                ? {
                      ...input.workflowSource,
                      workflowId: input.workflowSource.workflowId.trim(),
                      workflowRunId: input.workflowSource.workflowRunId.trim(),
                      workflowVersion: input.workflowSource.workflowVersion.trim(),
                      stageId: input.workflowSource.stageId.trim(),
                      agentId: input.workflowSource.agentId.trim(),
                      sourceOutputId: input.workflowSource.sourceOutputId.trim(),
                      previewId: input.workflowSource.previewId.trim(),
                      previewItemId: input.workflowSource.previewItemId.trim(),
                      sourceFiles: uniqueStrings((input.workflowSource.sourceFiles || []).map((item) => item.trim()).filter(Boolean)),
                      qualityGateIds: uniqueStrings((input.workflowSource.qualityGateIds || []).map((item) => item.trim()).filter(Boolean)),
                      createdFromText: input.workflowSource.createdFromText.trim(),
                  }
                : undefined,
    };
}

export function normalizeShotGroup(input: ShotGroupWriteInput): ShotGroupWriteInput {
    return {
        ...input,
        sceneName: input.sceneName.trim() || "未命名场次",
        shotIds: uniqueStrings(input.shotIds.map((id) => id.trim()).filter(Boolean)),
        totalDuration: clampDuration(input.totalDuration),
        prompt: input.prompt.trim(),
        effectivePrompt: input.effectivePrompt.trim(),
        assetRefs: dedupeAssetRefs(input.assetRefs),
        audioRefs: dedupeAssetRefs(input.audioRefs.filter((ref) => ref.kind === "audio")),
        productionBibleRefs: dedupeBibleRefs(input.productionBibleRefs || []),
        agentRunId: input.agentRunId?.trim() || undefined,
        agentConfigId: input.agentConfigId?.trim() || undefined,
        agentConfigVersion: input.agentConfigVersion?.trim() || undefined,
        sourceType: input.sourceType?.trim() || undefined,
        taskId: input.taskId?.trim() || undefined,
        resultAssetIds: uniqueStrings(input.resultAssetIds.map((id) => id.trim()).filter(Boolean)),
        primaryAssetId: input.primaryAssetId?.trim() || undefined,
        errorMessage: input.errorMessage?.trim() || undefined,
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

export function applyShotGroupGenerationStarted(groups: ShotGroup[], input: { shotGroupId?: string; taskId?: string }) {
    if (!input.shotGroupId) return groups;
    return groups.map((group) =>
        group.id === input.shotGroupId
            ? {
                  ...group,
                  status: "generating" as const,
                  taskId: input.taskId || group.taskId,
                  errorMessage: undefined,
                  updatedAt: new Date().toISOString(),
              }
            : group,
    );
}

export function applyShotGroupGenerationSuccess(groups: ShotGroup[], input: { shotGroupId?: string; assetId?: string; taskId?: string }) {
    if (!input.shotGroupId) return groups;
    return groups.map((group) => {
        if (group.id !== input.shotGroupId) return group;
        const resultAssetIds = input.assetId && !group.resultAssetIds.includes(input.assetId) ? [...group.resultAssetIds, input.assetId] : group.resultAssetIds;
        return {
            ...group,
            status: "done" as const,
            taskId: input.taskId || group.taskId,
            resultAssetIds,
            primaryAssetId: group.primaryAssetId || resultAssetIds[0],
            errorMessage: undefined,
            updatedAt: new Date().toISOString(),
        };
    });
}

export function applyShotGroupGenerationError(groups: ShotGroup[], input: { shotGroupId?: string; taskId?: string; errorMessage?: string }) {
    if (!input.shotGroupId) return groups;
    return groups.map((group) =>
        group.id === input.shotGroupId
            ? {
                  ...group,
                  status: "error" as const,
                  taskId: input.taskId || group.taskId,
                  errorMessage: input.errorMessage || "视频生成失败",
                  updatedAt: new Date().toISOString(),
              }
            : group,
    );
}

export function orderedStoryboardGroups(groups: StoryboardGroup[], projectId: string) {
    return groups.filter((group) => group.projectId === projectId).sort(compareOrder);
}

export function orderedStoryboardShots(shots: StoryboardShot[], groupId: string) {
    return shots.filter((shot) => shot.groupId === groupId).sort(compareOrder);
}

export function orderedStoryboardTableShots(shots: StoryboardTableShot[], canvasId: string, episodeId?: string) {
    return shots.filter((shot) => shot.canvasId === canvasId && (!episodeId || shot.episodeId === episodeId)).sort(compareOrder);
}

export function orderedShotGroups(groups: ShotGroup[], canvasId: string, episodeId?: string) {
    return groups.filter((group) => group.canvasId === canvasId && (!episodeId || group.episodeId === episodeId)).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
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

export function reorderStoryboardTableShots(shots: StoryboardTableShot[], id: string, direction: "up" | "down") {
    const current = shots.find((shot) => shot.id === id);
    if (!current) return shots;
    return reorderStoryboardItems(shots, id, direction, (shot) => shot.projectId === current.projectId && shot.canvasId === current.canvasId && shot.episodeId === current.episodeId);
}

export function buildStoryboardTableDraftsFromScript({
    projectId,
    canvasId,
    episodeId,
    scriptText,
    now = new Date().toISOString(),
    idFactory = (index: number) => `storyboard-table-shot-${index}`,
}: {
    projectId: string;
    canvasId: string;
    episodeId: string;
    scriptText: string;
    now?: string;
    idFactory?: (index: number) => string;
}): StoryboardTableShot[] {
    const paragraphs = scriptText
        .split(/\n\s*\n+/)
        .map((part) => part.trim())
        .filter(Boolean);
    const parts = paragraphs.length
        ? paragraphs
        : scriptText
              .split(/\n+/)
              .map((part) => part.trim())
              .filter(Boolean);
    return parts.map((part, index) => {
        const sceneInfo = parseSceneInfo(part);
        return {
            id: idFactory(index + 1),
            projectId,
            canvasId,
            episodeId,
            sceneName: sceneInfo.sceneName,
            location: sceneInfo.location,
            timeOfDay: sceneInfo.timeOfDay,
            order: index + 1,
            title: `镜头 ${index + 1} · ${sceneInfo.sceneName}`,
            scriptText: part,
            visualDescription: firstNonMetaLine(part),
            characters: extractCharacters(part),
            dialogue: extractDialogue(part),
            action: extractAction(part),
            emotion: extractField(part, "情绪"),
            shotSize: extractField(part, "景别"),
            cameraMovement: extractField(part, "运镜"),
            estimatedDuration: estimateShotDuration(part),
            assetNeeds: inferAssetNeeds(part),
            assetRefs: [],
            productionBibleRefs: [],
            createdAt: now,
            updatedAt: now,
        };
    });
}

export function validateShotGroupSelection(shots: StoryboardTableShot[], shotIds: string[]) {
    const selected = shotIds
        .map((id) => shots.find((shot) => shot.id === id))
        .filter((shot): shot is StoryboardTableShot => Boolean(shot))
        .sort(compareOrder);
    const errors: string[] = [];
    if (!selected.length) errors.push("请选择至少一个分镜头");
    const sceneNames = uniqueStrings(selected.map((shot) => shot.sceneName));
    if (sceneNames.length > 1) errors.push("生成镜头组必须属于同一个场次 / sceneName");
    const totalDuration = selected.reduce((sum, shot) => sum + shot.estimatedDuration, 0);
    if (totalDuration > 15) errors.push("生成镜头组总时长不能超过 15 秒");
    if (selected.length > 1) {
        const orders = selected.map((shot) => shot.order).sort((a, b) => a - b);
        for (let index = 1; index < orders.length; index += 1) {
            if (orders[index] !== orders[index - 1] + 1) {
                errors.push("生成镜头组只能选择连续分镜头，不能跳选");
                break;
            }
        }
    }
    return { valid: errors.length === 0, errors, shots: selected, totalDuration, sceneName: sceneNames[0] || "" };
}

export function createShotGroupFromSelection({ shots, id, now = new Date().toISOString() }: { shots: StoryboardTableShot[]; id: string; now?: string }): { ok: true; group: ShotGroup } | { ok: false; errors: string[] } {
    const validation = validateShotGroupSelection(
        shots,
        shots.map((shot) => shot.id),
    );
    if (!validation.valid) return { ok: false, errors: validation.errors };
    const prompt = buildShotGroupPrompt(validation.shots);
    const first = validation.shots[0];
    return {
        ok: true,
        group: {
            id,
            projectId: first.projectId,
            canvasId: first.canvasId,
            episodeId: first.episodeId,
            sceneName: validation.sceneName,
            shotIds: validation.shots.map((shot) => shot.id),
            totalDuration: validation.totalDuration,
            prompt,
            effectivePrompt: "",
            assetRefs: dedupeAssetRefs(validation.shots.flatMap((shot) => shot.assetRefs)),
            audioRefs: [],
            productionBibleRefs: dedupeBibleRefs(validation.shots.flatMap((shot) => shot.productionBibleRefs || [])),
            agentRunId: first.agentRunId,
            agentConfigId: first.agentConfigId,
            agentConfigVersion: first.agentConfigVersion,
            sourceType: first.sourceType,
            status: prompt ? "prompt_ready" : "draft",
            resultAssetIds: [],
            createdAt: now,
            updatedAt: now,
        },
    };
}

export function buildShotGroupGenerationTableRows(groups: ShotGroup[], shots: StoryboardTableShot[]) {
    return groups.map((group) => {
        const groupShots = group.shotIds
            .map((id) => shots.find((shot) => shot.id === id))
            .filter((shot): shot is StoryboardTableShot => Boolean(shot))
            .sort(compareOrder);
        const orders = groupShots.map((shot) => shot.order);
        return {
            group,
            shots: groupShots,
            shotRangeLabel: orders.length ? `${Math.min(...orders)}-${Math.max(...orders)}` : "-",
            promptReady: Boolean((group.effectivePrompt || group.prompt).trim()),
            assetReady: Boolean(group.assetRefs.length || group.audioRefs.length || group.productionBibleRefs?.length),
            status: group.status,
        };
    });
}

export function buildShotGroupCanvasInsertMetadata(group: ShotGroup, metadata: CanvasNodeMetadata = {}): CanvasNodeMetadata {
    const { role, ...rest } = metadata as CanvasNodeMetadata & { role?: string };
    return {
        episodeId: group.episodeId,
        shotGroupId: group.id,
        shotIds: group.shotIds,
        storyboardShotGroupId: group.id,
        storyboardTableShotIds: group.shotIds,
        ...(group.agentRunId ? { agentRunId: group.agentRunId } : {}),
        ...(group.agentConfigId ? { agentConfigId: group.agentConfigId } : {}),
        ...(group.agentConfigVersion ? { agentConfigVersion: group.agentConfigVersion } : {}),
        ...(role ? { storyboardRole: role } : {}),
        ...rest,
    };
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
    episodeTitle: _episodeTitle,
    idFactory,
    connectionIdFactory,
}: {
    group: StoryboardGroup;
    shots: StoryboardShot[];
    assets: StoryboardAssetLike[];
    position: Position;
    config: { provider?: "openai" | "volcengine-ark"; model?: string; size?: string; seconds?: string; vquality?: string };
    episodeTitle?: string;
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

export function planShotGroupCanvasInsert({
    group,
    shots,
    assets,
    autoAssetRefs = [],
    position,
    config,
    episodeTitle,
    idFactory,
    connectionIdFactory,
}: {
    group: ShotGroup;
    shots: StoryboardTableShot[];
    assets: StoryboardAssetLike[];
    autoAssetRefs?: StoryboardAssetRef[];
    position: Position;
    config: { provider?: "openai" | "volcengine-ark"; model?: string; size?: string; seconds?: string; vquality?: string };
    episodeTitle?: string;
    idFactory: (prefix: string) => string;
    connectionIdFactory: (index: number) => string;
}) {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const shotsById = new Map(shots.map((shot) => [shot.id, shot]));
    const prompt = group.effectivePrompt || group.prompt || buildShotGroupPrompt(group.shotIds.map((id) => shotsById.get(id)).filter((shot): shot is StoryboardTableShot => Boolean(shot)));
    const nodes: CanvasNodeData[] = [];
    const connections: CanvasConnection[] = [];
    const groupNodeRefs: StoryboardNodeRef[] = [];
    const mediaNodeRefs: Array<{ ref: StoryboardAssetRef; nodeId: string }> = [];
    let connectionIndex = 0;
    const promptId = idFactory("shot-group-text");
    const configId = idFactory("shot-group-config");

    nodes.push({
        id: promptId,
        type: "text" as CanvasNodeData["type"],
        title: `${group.sceneName} · 生成提示词`,
        position,
        width: NODE_SIZE.text.width,
        height: NODE_SIZE.text.height,
        metadata: buildShotGroupCanvasInsertMetadata(group, { content: prompt, prompt, status: "success", fontSize: 14, role: "prompt" } as CanvasNodeMetadata & { role: string }),
    });
    groupNodeRefs.push({ nodeId: promptId, role: "prompt" });

    const mediaRefs = dedupeAssetRefs([...group.assetRefs, ...group.audioRefs, ...autoAssetRefs]);
    for (const ref of mediaRefs) {
        const asset = assetsById.get(ref.assetId);
        if (!asset || (asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio")) continue;
        const nodeId = idFactory(`shot-group-${asset.kind}`);
        groupNodeRefs.push({ nodeId, role: ref.role || "reference" });
        mediaNodeRefs.push({ ref, nodeId });
        nodes.push(assetToCanvasNodeForShotGroup(asset, ref, nodeId, { x: position.x + NODE_SIZE.text.width + 80, y: position.y + (mediaNodeRefs.length - 1) * 160 }, group));
    }

    nodes.push({
        id: configId,
        type: "config" as CanvasNodeData["type"],
        title: "视频生成配置",
        position: { x: position.x + NODE_SIZE.text.width + 80 + NODE_SIZE.image.width + 80, y: position.y },
        width: NODE_SIZE.config.width,
        height: NODE_SIZE.config.height,
        metadata: buildShotGroupCanvasInsertMetadata(group, {
            content: "",
            status: "idle",
            generationMode: "video",
            prompt,
            finalPrompt: prompt,
            provider: config.provider,
            model: config.model,
            size: config.size,
            seconds: config.seconds,
            vquality: config.vquality,
            duration: String(group.totalDuration || config.seconds || ""),
            ratio: config.size,
            sourceType: "shot_group",
            sourceId: group.id,
            episodeTitle,
            role: "video_config",
            references: mediaNodeRefs.filter(({ ref }) => ref.kind === "image").map(({ ref }) => `asset:${ref.assetId}`),
            videoReferences: mediaNodeRefs.filter(({ ref }) => ref.kind === "video").map(({ ref }) => `asset:${ref.assetId}`),
            audioReferences: mediaNodeRefs.filter(({ ref }) => ref.kind === "audio").map(({ ref }) => `asset:${ref.assetId}`),
            referenceAssets: buildShotGroupReferenceAssets(mediaNodeRefs, assetsById),
            referenceRoles: mediaNodeRefs.map(({ ref, nodeId }, index) => ({ nodeId, kind: ref.kind, role: ref.role || "reference", index: index + 1 })),
            referenceOrder: mediaNodeRefs.map(({ ref, nodeId }, index) => ({ nodeId, kind: ref.kind, index: index + 1 })),
        } as CanvasNodeMetadata & { role: string }),
    });
    groupNodeRefs.push({ nodeId: configId, role: "video_config" });

    connections.push({ id: connectionIdFactory(connectionIndex++), fromNodeId: promptId, toNodeId: configId });
    mediaNodeRefs.forEach(({ nodeId }) => connections.push({ id: connectionIdFactory(connectionIndex++), fromNodeId: nodeId, toNodeId: configId }));
    return { nodes, connections, groupNodeRefs };
}

function buildShotGroupReferenceAssets(refs: Array<{ ref: StoryboardAssetRef; nodeId: string }>, assetsById: Map<string, StoryboardAssetLike>) {
    return refs.map(({ ref, nodeId }) => {
        const asset = assetsById.get(ref.assetId);
        const assetVersion = ref.assetVersion || (asset ? buildAssetVersionReference({ id: asset.id, updatedAt: asset.updatedAt || "", metadata: asset.metadata }) : undefined);
        return {
            assetId: ref.assetId,
            kind: ref.kind,
            role: ref.role || "reference",
            nodeId,
            ...(assetVersion ? { assetVersion } : {}),
            ...(ref.source ? { sourceType: ref.source } : {}),
            ...(ref.sourceLabel ? { sourceLabel: ref.sourceLabel } : {}),
            ...(ref.isAutoMatched ? { isAutoMatched: true } : {}),
            ...(ref.isPrimaryReference ? { isPrimaryReference: true } : {}),
            ...(ref.assetBreakdownItemId ? { assetBreakdownItemId: ref.assetBreakdownItemId } : {}),
            ...(ref.imageBriefId ? { imageBriefId: ref.imageBriefId } : {}),
            ...(ref.matchReasons?.length ? { matchReasons: ref.matchReasons } : {}),
        };
    });
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
    const node = buildAssetCanvasNode(asset, id, position);
    const assetVersion = ref.assetVersion || buildAssetVersionReference({ id: asset.id, updatedAt: asset.updatedAt || "", metadata: asset.metadata });
    return {
        ...node.base,
        metadata: storyboardMetadata(shot, group, {
            ...node.metadata,
            ...canvasAssetReferenceMetadata({ sourceAssetId: ref.assetId, assetVersion }),
            storyboardAssetRole: ref.role || "reference",
            storyboardRole: ref.role || "reference",
        }),
    };
}

function assetToCanvasNodeForShotGroup(asset: StoryboardAssetLike, ref: StoryboardAssetRef, id: string, position: Position, group: ShotGroup): CanvasNodeData {
    const node = buildAssetCanvasNode(asset, id, position);
    const assetVersion = ref.assetVersion || buildAssetVersionReference({ id: asset.id, updatedAt: asset.updatedAt || "", metadata: asset.metadata });
    return {
        ...node.base,
        metadata: buildShotGroupCanvasInsertMetadata(group, {
            ...node.metadata,
            ...canvasAssetReferenceMetadata({ sourceAssetId: ref.assetId, assetVersion }),
            storyboardAssetRole: ref.role || "reference",
            role: ref.role || "reference",
        } as CanvasNodeMetadata & { role: string }),
    };
}

function buildAssetCanvasNode(asset: StoryboardAssetLike, id: string, position: Position) {
    const data = asset.data || {};
    const type = asset.kind as CanvasNodeData["type"];
    const content = String(data.dataUrl || data.url || asset.coverUrl || "");
    const width = Number(data.width) || NODE_SIZE[type as keyof typeof NODE_SIZE]?.width || NODE_SIZE.image.width;
    const height = Number(data.height) || NODE_SIZE[type as keyof typeof NODE_SIZE]?.height || NODE_SIZE.image.height;
    return {
        base: {
            id,
            type,
            title: asset.title,
            position,
            width: type === "audio" ? NODE_SIZE.audio.width : Math.min(width, type === "video" ? NODE_SIZE.video.width : NODE_SIZE.image.width),
            height: type === "audio" ? NODE_SIZE.audio.height : Math.min(height, type === "video" ? NODE_SIZE.video.height : NODE_SIZE.image.height),
        },
        metadata: {
            content,
            status: "success",
            storageKey: typeof data.storageKey === "string" ? data.storageKey : undefined,
            bytes: typeof data.bytes === "number" ? data.bytes : undefined,
            mimeType: typeof data.mimeType === "string" ? data.mimeType : undefined,
            naturalWidth: typeof data.width === "number" ? data.width : undefined,
            naturalHeight: typeof data.height === "number" ? data.height : undefined,
        } satisfies CanvasNodeMetadata,
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
        result.push({
            assetId,
            kind: ref.kind,
            role: ref.role.trim() || "reference",
            source: ref.source,
            sourceLabel: ref.sourceLabel,
            ...(ref.assetVersion ? { assetVersion: ref.assetVersion } : {}),
            ...(ref.isAutoMatched ? { isAutoMatched: true } : {}),
            ...(ref.isPrimaryReference ? { isPrimaryReference: true } : {}),
            ...(ref.assetBreakdownItemId ? { assetBreakdownItemId: ref.assetBreakdownItemId } : {}),
            ...(ref.imageBriefId ? { imageBriefId: ref.imageBriefId } : {}),
            ...(ref.matchReasons?.length ? { matchReasons: ref.matchReasons } : {}),
        });
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

function parseSceneInfo(text: string) {
    const sceneLine = text.match(/(?:场景|场次|地点|场地)[：:]\s*([^\n/／，,]+)/);
    const location = (sceneLine?.[1] || text.match(/([\u4e00-\u9fa5A-Za-z0-9_]{2,18}(?:操场|教室|观礼区|主席台|办公室|街道|房间|现场))/)?.[1] || "未命名场次").trim();
    const timeOfDay = text.match(/(白天|夜晚|清晨|傍晚|黄昏|深夜|午后)/)?.[1] || "";
    return { sceneName: location, location, timeOfDay };
}

function extractField(text: string, label: string) {
    return text.match(new RegExp(`${label}[：:]\\s*([^\\n]+)`))?.[1]?.trim() || "";
}

function inferAssetNeeds(text: string) {
    const needs: string[] = [];
    if (/角色|人物|男主|女主|学生|老师|父亲|母亲|魏梁|周泽|姚澈|蒋文阔|姚渊/.test(text)) needs.push("character");
    if (/场景|地点|操场|教室|办公室|街道|房间|主席台|观礼区/.test(text)) needs.push("scene");
    if (/道具|话筒|手机|书|花|车|包|证书|学士帽/.test(text)) needs.push("prop");
    if (/服装|学士袍|妆容|发型|服化道/.test(text)) needs.push("costume");
    if (/声音|台词|对白|音乐|音频|掌声|风声/.test(text)) needs.push("audio");
    if (/参考视频|视频参考|复刻|镜头参考/.test(text)) needs.push("reference_video");
    if (/特效|转场|慢动作|光效|粒子/.test(text)) needs.push("effect");
    return uniqueStrings(needs);
}

function firstNonMetaLine(text: string) {
    return (
        text
            .split(/\n+/)
            .map((line) => line.trim())
            .find((line) => line && !/^(场景|场次|地点|对白|情绪|景别|运镜|时长)[：:]/.test(line)) || text.slice(0, 80).trim()
    );
}

function extractDialogue(text: string) {
    return extractField(text, "对白") || text.match(/[“"]([^”"]+)[”"]/)?.[1]?.trim() || "";
}

function extractCharacters(text: string) {
    const names = new Set<string>();
    for (const match of text.matchAll(/图片\s*\d+\s*([\u4e00-\u9fa5A-Za-z0-9_]{2,10})/g)) names.add(match[1]);
    for (const name of ["魏梁", "周泽", "姚澈", "蒋文阔", "姚渊"]) {
        if (text.includes(name)) names.add(name);
    }
    return Array.from(names);
}

function extractAction(text: string) {
    const line = firstNonMetaLine(text);
    return line.length > 80 ? `${line.slice(0, 80)}...` : line;
}

function estimateShotDuration(text: string) {
    const value = Number(text.match(/(?:时长|持续)[：:]?\s*(\d+(?:\.\d+)?)\s*秒?/)?.[1]);
    if (Number.isFinite(value) && value > 0) return clampDuration(value);
    return 5;
}

function buildShotGroupPrompt(shots: StoryboardTableShot[]) {
    return shots
        .map((shot) =>
            [
                `镜头 ${shot.order}：${shot.visualDescription || shot.scriptText}`,
                shot.scriptText && shot.scriptText !== shot.visualDescription ? `剧本：${shot.scriptText}` : "",
                shot.dialogue ? `对白：${shot.dialogue}` : "",
                shot.emotion ? `情绪：${shot.emotion}` : "",
                shot.shotSize ? `景别：${shot.shotSize}` : "",
                shot.cameraMovement ? `运镜：${shot.cameraMovement}` : "",
            ]
                .filter(Boolean)
                .join("\n"),
        )
        .join("\n\n");
}

function clampDuration(value: number) {
    if (!Number.isFinite(value)) return 5;
    return Math.max(1, Math.min(15, Math.round(value)));
}

function compareOrder<T extends { order: number; createdAt?: string }>(a: T, b: T) {
    if (a.order !== b.order) return a.order - b.order;
    return (a.createdAt || "").localeCompare(b.createdAt || "");
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values));
}
