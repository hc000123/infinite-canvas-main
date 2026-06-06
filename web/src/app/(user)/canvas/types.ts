import type { SeedanceImageRoleMode } from "@/services/api/video-reference";
import type { AssetVersionReference } from "../assets/asset-version-references";
import type { AssistantCanvasAction } from "./utils/canvas-assistant-actions";

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

export type CanvasNodeMetadata = {
    content?: string;
    prompt?: string;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    model?: string;
    size?: string;
    quality?: string;
    count?: number;
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
    provider?: "openai" | "volcengine-ark";
    actionType?: CanvasVideoActionType;
    videoActionType?: CanvasVideoActionType;
    relationType?: CanvasVideoRelationType;
    videoTaskMode?: CanvasVideoTaskMode;
    videoEditType?: CanvasVideoEditType;
    videoExtendDirection?: CanvasVideoExtendDirection;
    videoReferenceImageMode?: SeedanceImageRoleMode;
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
    episodeId?: string;
    episodeTitle?: string;
    scriptId?: string;
    scriptSnapshot?: string;
    assetBreakdownItemId?: string;
    assetBriefId?: string;
    briefId?: string;
    briefKind?: "scene" | "character" | "prop" | "mood";
    briefMode?: "standard" | "reminder" | "free";
    briefSnapshot?: Record<string, unknown>;
    finalPrompt?: string;
    sourceType?: "asset_breakdown" | "production_bible" | "storyboard" | "manual";
    sourceId?: string;
    productionBibleItemId?: string;
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
    lastFrameUrl?: string;
    lastFrameStorageKey?: string;
    taskCreatedAt?: number;
    taskUpdatedAt?: number;
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
