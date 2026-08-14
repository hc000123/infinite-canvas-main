import type { SeedanceImageRoleMode, VideoReferenceMode } from "@/services/api/video-reference";
import type { AgentSkillRef } from "@/services/api/agent-registry";
import type { ArtifactRefInput } from "@/services/api/invocations-contract";
import type { AssetVersionReference } from "../assets/asset-version-references";
import type { AssistantCanvasAction } from "./utils/canvas-assistant-actions";
import type { CanvasPromptDocument } from "./utils/canvas-prompt-document";

export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Config = "config",
    Video = "video",
    Audio = "audio",
}

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasGenerationMode = "text" | "image" | "video";
export type CanvasImageGenerationType = "generation" | "edit";
export type CanvasVideoActionType = "generate" | "regenerate" | "variant" | "continue" | "edit" | "extend";
export type CanvasVideoRelationType = "variant" | "continuation" | "derivative";
export type CanvasVideoTaskMode = "generate" | "edit" | "extend";
export type CanvasVideoEditType = "replace" | "add" | "remove" | "inpaint";
export type CanvasVideoExtendDirection = "forward" | "backward";
export type CanvasProductionPackageRole = "script" | "asset" | "prompt" | "video_config" | "video_result" | "reference" | "manual";

export type CanvasImageUpscaleMetadata = {
    jobId: string;
    provider: string;
    providerRequestId?: string;
    scale: 2 | 4;
    status: "queued" | "processing" | "downloading" | "succeeded" | "failed";
    progress: number;
    attempt: number;
    sourceNodeId: string;
    sourceAssetId?: string;
    inputWidth: number;
    inputHeight: number;
    outputWidth?: number;
    outputHeight?: number;
    model?: string;
    strategy?: string;
    cloudProcessing: true;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    errorCode?: string;
};

export type CanvasVideoUpscaleMetadata = {
    jobId: string;
    provider: string;
    runId?: string;
    providerRequestId?: string;
    target: "1080p" | "2k";
    status: "queued" | "uploading" | "processing" | "downloading" | "succeeded" | "failed";
    progress: number;
    attempt: number;
    processingStage?: string;
    sourceNodeId: string;
    sourceAssetId?: string;
    inputWidth: number;
    inputHeight: number;
    inputDurationSeconds: number;
    inputFrameRate?: number;
    outputWidth?: number;
    outputHeight?: number;
    outputDurationSeconds?: number;
    outputQualityMode?: "compatible" | "balanced" | "master";
    preserveAudio?: boolean;
    frameInterpolationMode?: "keep" | "to25" | "to30" | "double" | "to60";
    interpolationMode?: "ultra-fast" | "fast" | "medium";
    interpolationTargetFrameRate?: number;
    interpolationRunId?: string;
    estimatedBillableMinutes?: number;
    estimatedCostCny?: number;
    costEstimateAvailable?: boolean;
    pricingRuleVersion?: string;
    estimatedInterpolationBillableMinutes?: number;
    estimatedInterpolationCostCny?: number;
    interpolationCostEstimateAvailable?: boolean;
    interpolationPricingRuleVersion?: string;
    estimatedTotalCostCny?: number;
    cloudProcessing: true;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    errorCode?: string;
};

export type CanvasVideoSubtitleEraseMetadata = {
    jobId: string;
    provider: string;
    runId?: string;
    providerRequestId?: string;
    status: "queued" | "uploading" | "processing" | "downloading" | "succeeded" | "failed";
    progress: number;
    attempt: number;
    processingStage?: string;
    sourceNodeId: string;
    sourceAssetId?: string;
    inputWidth: number;
    inputHeight: number;
    inputDurationSeconds: number;
    outputWidth?: number;
    outputHeight?: number;
    outputDurationSeconds?: number;
    estimatedBillableMinutes?: number;
    estimatedCostCny?: number;
    costEstimateAvailable?: boolean;
    pricingRuleVersion?: string;
    cloudProcessing: true;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    errorCode?: string;
};

export type CanvasMediaVersion = {
    id: string;
    versionNumber: number;
    kind: "image" | "video";
    createdAt: string;
    prompt: string;
    promptDocument?: CanvasPromptDocument;
    width: number;
    height: number;
    metadata: Partial<CanvasNodeMetadata>;
};

export type CanvasPendingMediaVersion = {
    prompt: string;
    promptDocument?: CanvasPromptDocument;
    startedAt: string;
    taskId?: string;
};

export type CanvasNodeMetadata = {
    assetNodeNumber?: number;
    content?: string;
    prompt?: string;
    promptDocument?: CanvasPromptDocument;
    mediaVersions?: CanvasMediaVersion[];
    currentMediaVersionId?: string;
    promptDraft?: string;
    promptDraftDocument?: CanvasPromptDocument;
    pendingMediaVersion?: CanvasPendingMediaVersion;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    imageUpscale?: CanvasImageUpscaleMetadata;
    videoUpscale?: CanvasVideoUpscaleMetadata;
    subtitleErase?: CanvasVideoSubtitleEraseMetadata;
    fontSize?: number;
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    model?: string;
    size?: string;
    quality?: string;
    count?: number;
    imagePresetId?: string;
    imagePresetLabel?: string;
    imageCameraName?: string;
    imageLensName?: string;
    imageFocalLength?: string;
    imageAperture?: string;
    seconds?: string;
    vquality?: string;
    duration?: string;
    ratio?: string;
    resolution?: string;
    generateAudio?: string;
    watermark?: string;
    seed?: string;
    videoPromptReviewEnabled?: string;
    returnLastFrame?: string;
    channelMode?: "remote" | "local";
    provider?: "openai" | "volcengine-ark" | "jimeng-cli" | "xinglian-cloud" | "minimax";
    actionType?: CanvasVideoActionType;
    videoActionType?: CanvasVideoActionType;
    relationType?: CanvasVideoRelationType;
    videoTaskMode?: CanvasVideoTaskMode;
    videoEditType?: CanvasVideoEditType;
    videoExtendDirection?: CanvasVideoExtendDirection;
    videoReferenceImageMode?: SeedanceImageRoleMode;
    videoReferenceMode?: VideoReferenceMode;
    sourceVideoNodeId?: string;
    capturedFrameSourceVideoNodeId?: string;
    capturedFrameTime?: number;
    capturedFrameAt?: string;
    capturedFrameSource?: "current_frame";
    storyboardGroupId?: string;
    storyboardShotId?: string;
    shotGroupId?: string;
    shotIds?: string[];
    storyboardShotGroupId?: string;
    storyboardTableShotIds?: string[];
    storyboardRole?: string;
    storyboardAssetRole?: string;
    productionPackageId?: string;
    productionPackageLabel?: string;
    productionPackageTitle?: string;
    productionPackageRole?: CanvasProductionPackageRole;
    productionVideoVersionId?: string;
    productionVideoVersionNumber?: number;
    productionVideoVersionCreatedAt?: string;
    productionVideoVersionNote?: string;
    productionVideoVersionHidden?: boolean;
    isCurrentProductionVersion?: boolean;
    usePreviousPackageTailFrame?: boolean;
    previousPackageVersionId?: string;
    previousPackageVersionNodeId?: string;
    previousPackageVersionLabel?: string;
    episodeId?: string;
    episodeTitle?: string;
    scriptId?: string;
    scriptSnapshot?: string;
    assetBreakdownItemId?: string;
    agentRunId?: string;
    agentConfigId?: string;
    agentConfigVersion?: string;
    assetBriefId?: string;
    briefId?: string;
    briefKind?: "scene" | "character" | "prop" | "mood";
    briefMode?: "standard" | "reminder" | "free";
    briefSnapshot?: Record<string, unknown>;
    finalPrompt?: string;
    sourceType?: "asset_breakdown" | "production_bible" | "storyboard" | "manual" | "shot_group" | "workflow_mapping_preview";
    sourceId?: string;
    canvasSource?: {
        projectId?: string;
        projectTitle?: string;
        canvasId: string;
        canvasTitle?: string;
        nodeId: string;
        sourceNodeId?: string;
        sourceAssetId?: string;
        prompt?: string;
        generationParams?: Record<string, unknown>;
        cropRect?: { x: number; y: number; width: number; height: number };
        originalImage?: { nodeId: string; storageKey?: string; url?: string };
        import?: { fileName: string; order: number; batchId?: string };
    };
    productionBibleItemId?: string;
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
    capabilityArtifact?: {
        source: "canvas_chat";
        sourceNodeId: string;
        invocationId: string;
        artifactId: string;
        artifactType: string;
        artifactHash: string;
        artifactIds: string[];
        skillVersionId: string;
        appliedAt: string;
    };
    agentArtifact?: {
        source: "canvas_chat";
        agentPlanId: string;
        sourceMessageId: string;
        sourceNodeIds: string[];
        invocationId: string;
        artifactId: string;
        artifactType: string;
        artifactHash: string;
        artifactIds: string[];
        skillVersionId: string;
        appliedAt: string;
    };
    referenceAssets?: Array<Record<string, unknown>>;
    sourceAssetId?: string;
    assetVersion?: AssetVersionReference;
    assetReferenceMode?: "fixed-version";
    variantOfNodeId?: string;
    continuationOfNodeId?: string;
    videoReferences?: string[];
    audioReferences?: string[];
    referenceOrder?: Array<{ nodeId?: string; kind: "image" | "video" | "audio"; index: number }>;
    referenceRoles?: Array<{ nodeId: string; kind: "image" | "video" | "audio"; role: string; index?: number }>;
    taskId?: string;
    taskStatus?: string;
    rawTaskStatus?: string;
    aiTaskId?: string;
    upstreamTaskId?: string;
    aiTaskStatus?: string;
    aiTaskCredits?: number;
    creditLogId?: string;
    creditsRefunded?: number;
    refundedAt?: string;
    finishedAt?: string;
    generationStartedAt?: number;
    videoUrl?: string;
    cacheUrl?: string;
    cachePath?: string;
    cacheFilename?: string;
    projectCache?: {
        fileId?: string;
        relativePath?: string;
        status: "ready" | "pending" | "error";
        error?: string;
    };
    lastFrameUrl?: string;
    lastFrameStorageKey?: string;
    taskCreatedAt?: number;
    taskUpdatedAt?: number;
    taskDuration?: string;
    executionExpiresAfter?: number;
    videoUrlExpiresAt?: number;
    localStoredAt?: string;
    references?: string[];
    naturalWidth?: number;
    naturalHeight?: number;
    freeResize?: boolean;
    isBatchRoot?: boolean;
    batchRootId?: string;
    batchChildIds?: string[];
    batchUsesReferenceImages?: boolean;
    primaryImageId?: string;
    imageBatchExpanded?: boolean;
    inputOrder?: string[];
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    volcengineAsset?: {
        assetId: string;
        groupId: string;
        projectName: string;
        status: "Processing" | "Active" | "Failed" | string;
        error?: string;
        publicUrl: string;
        submittedAt: string;
        updatedAt: string;
    };
};

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeType;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    fromHandle?: string;
    toHandle?: string;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeType;
    title: string;
    dataUrl?: string;
    storageKey?: string;
    text?: string;
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    sourceAssetId?: string;
    assetVersion?: AssetVersionReference;
    prompt: string;
    volcengineAsset?: CanvasNodeMetadata["volcengineAsset"];
};

export type CanvasAgentPlanRun = {
    planId: string;
    agentVersionId: string;
    sourceArtifactRef: ArtifactRefInput;
    sourceNodeIds: string[];
    skillRefs: AgentSkillRef[];
    confirmationRequirementCodes?: string[];
    appliedAt?: string;
};

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant";
    mode: "ask" | "image";
    text: string;
    isLoading?: boolean;
    references?: CanvasAssistantReference[];
    images?: CanvasAssistantImage[];
    assistantActions?: AssistantCanvasAction[];
    assistantActionStatus?: "pending" | "applied" | "cancelled";
    assistantActionAppliedAt?: string;
    agentPlanRun?: CanvasAgentPlanRun;
};

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
    handleId?: string;
};

export type SelectionBox = {
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
    additive: boolean;
    initialSelectedNodeIds: string[];
};

export type ContextMenuState = {
    type: "node";
    x: number;
    y: number;
    nodeId: string;
};
