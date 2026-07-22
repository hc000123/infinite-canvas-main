"use client";

import type { AiConfig } from "@/stores/use-config-store";
import type { Asset, AssetWriteInput } from "@/stores/use-asset-store";
import type { GeneratedImageResult } from "@/services/api/image";
import type { UploadedImage } from "@/services/image-storage";
import { buildAssetVersionedUpdatePatch } from "./asset-version-history.ts";

export type WorkflowAssetInfo = {
    assetId: string;
    logicalAssetId: string;
    libraryAssetId: string;
    episode: string;
    generatedAt: string;
    importKey: string;
    imagePrompt: string;
    prompt: string;
    projectSlug: string;
    sourcePath: string;
    sourceEpisodeId: string;
    sourceProjectId: string;
    status: string;
    type: string;
    version: string;
};

export function workflowAssetInfo(asset: Asset | null | undefined): WorkflowAssetInfo | null {
    const raw = readRecord(asset?.metadata?.originalWorkflow);
    if (!raw) return null;
    const importKey = readString(raw.importKey);
    const prompt = readString(raw.imagePrompt) || readString(raw.prompt) || readPromptFromAssetContent(asset);
    if (!importKey && !prompt) return null;
    return {
        assetId: readString(raw.assetId),
        logicalAssetId: readString(raw.logicalAssetId) || readString(raw.assetId),
        libraryAssetId: readString(raw.libraryAssetId) || asset?.id || "",
        episode: readString(raw.episode),
        generatedAt: readString(raw.generatedAt),
        importKey,
        imagePrompt: prompt,
        prompt,
        projectSlug: readString(raw.projectSlug),
        sourcePath: readString(raw.sourcePath),
        sourceEpisodeId: readString(raw.sourceEpisodeId),
        sourceProjectId: readString(raw.sourceProjectId),
        status: readString(raw.status) || (asset?.kind === "image" ? "image_generated" : "pending_image"),
        type: readString(raw.type),
        version: readString(raw.version) || "v1",
    };
}

export function workflowAssetCanGenerate(asset: Asset | null | undefined) {
    return Boolean(asset && workflowAssetInfo(asset)?.prompt);
}

export function workflowAssetPrompt(asset: Asset | null | undefined) {
    return workflowAssetInfo(asset)?.prompt || "";
}

export function workflowAssetSummary(asset: Asset) {
    const info = workflowAssetInfo(asset);
    if (!info) return "";
    const prefix = asset.kind === "image" ? "已生成图片" : "待生成图片";
    return summarizeText([prefix, info.type, info.prompt].filter(Boolean).join(" · "), 120);
}

export function buildWorkflowGeneratedImagePatch(
    asset: Asset,
    image: UploadedImage,
    context: {
        config: AiConfig;
        model: string;
        result?: GeneratedImageResult;
    },
) {
    const now = new Date().toISOString();
    const info = workflowAssetInfo(asset);
    const prompt = info?.prompt || "";
    const generation = {
        source: "original-workflow",
        actionType: "generate",
        prompt,
        effectivePrompt: prompt,
        model: context.model,
        provider: context.config.videoProtocol || "openai",
        config: {
            model: context.model,
            quality: context.config.quality,
            size: context.config.size,
            count: "1",
        },
        originalWorkflow: info,
        aiTaskId: context.result?.aiTask?.aiTaskId,
        localAiTaskId: context.result?.localAiTaskId,
        createdAt: now,
    };
    const existingGenerations = Array.isArray(asset.metadata?.generations) ? asset.metadata.generations : [];
    const patch = {
        kind: "image" as const,
        coverUrl: image.url,
        data: {
            dataUrl: image.url,
            storageKey: image.storageKey,
            width: image.width,
            height: image.height,
            bytes: image.bytes,
            mimeType: image.mimeType,
        },
        metadata: {
            ...(asset.metadata || {}),
            source: "original-workflow",
            prompt,
            originalWorkflow: {
                ...workflowAssetRaw(asset),
                ...(info || {}),
                imagePrompt: prompt,
                libraryAssetId: asset.id,
                prompt,
                status: "image_generated",
                generatedAt: now,
            },
            generation,
            generations: [...existingGenerations, generation],
        },
        source: asset.source || "视频工作流 Stage 2",
        tags: mergeTags(asset.tags, ["已生图"]),
    };
    return buildAssetVersionedUpdatePatch(asset, patch, now, "视频工作流提示词生图");
}

export function buildWorkflowUploadedImagePatch(asset: Asset, image: UploadedImage, input: { fileName?: string }) {
    const now = new Date().toISOString();
    const info = workflowAssetInfo(asset);
    const prompt = info?.prompt || "";
    const generation = {
        source: "original-workflow",
        actionType: "upload-match",
        prompt,
        fileName: input.fileName || "",
        originalWorkflow: info,
        createdAt: now,
    };
    const existingGenerations = Array.isArray(asset.metadata?.generations) ? asset.metadata.generations : [];
    const patch = {
        kind: "image" as const,
        coverUrl: image.url,
        data: {
            dataUrl: image.url,
            storageKey: image.storageKey,
            width: image.width,
            height: image.height,
            bytes: image.bytes,
            mimeType: image.mimeType,
        },
        metadata: {
            ...(asset.metadata || {}),
            source: "original-workflow",
            prompt,
            originalWorkflow: {
                ...workflowAssetRaw(asset),
                ...(info || {}),
                prompt,
                status: "image_generated",
                generatedAt: now,
            },
            generation,
            generations: [...existingGenerations, generation],
        },
        source: asset.source || "本地上传匹配",
        tags: mergeTags(asset.tags, ["已生图"]),
    };
    return buildAssetVersionedUpdatePatch(asset, patch, now, "上传图片匹配工作流素材");
}

export function buildWorkflowMatchedImagePatch(asset: Asset, source: Extract<Asset, { kind: "image" }>) {
    const now = new Date().toISOString();
    const info = workflowAssetInfo(asset);
    const prompt = info?.prompt || "";
    const generation = {
        source: "original-workflow",
        actionType: "match-existing",
        prompt,
        matchedAssetId: source.id,
        matchedAssetTitle: source.title,
        originalWorkflow: info,
        createdAt: now,
    };
    const existingGenerations = Array.isArray(asset.metadata?.generations) ? asset.metadata.generations : [];
    const patch = {
        kind: "image" as const,
        coverUrl: source.coverUrl || source.data.dataUrl,
        data: {
            ...source.data,
            dataUrl: source.data.dataUrl,
        },
        metadata: {
            ...(asset.metadata || {}),
            source: "original-workflow",
            prompt,
            originalWorkflow: {
                ...workflowAssetRaw(asset),
                ...(info || {}),
                prompt,
                status: "image_generated",
                generatedAt: now,
            },
            generation,
            generations: [...existingGenerations, generation],
            matchedAssetId: source.id,
        },
        source: asset.source || "复用已有素材",
        tags: mergeTags(asset.tags, ["已生图"]),
    };
    return buildAssetVersionedUpdatePatch(asset, patch, now, "匹配已有图片到工作流素材");
}

export function buildWorkflowPromptAssetInput(input: {
    assetId: string;
    content: string;
    episode: string;
    importKey: string;
    projectSlug: string;
    prompt: string;
    sourcePath: string;
    title: string;
    typeLabel: string;
}): AssetWriteInput {
    return {
        coverUrl: "",
        data: { content: input.content },
        kind: "text",
        metadata: {
            source: "original-workflow",
            prompt: input.prompt,
            originalWorkflow: {
                assetId: input.assetId,
                episode: input.episode,
                importKey: input.importKey,
                projectSlug: input.projectSlug,
                prompt: input.prompt,
                sourcePath: input.sourcePath,
                status: "pending_image",
                type: input.typeLabel,
            },
        },
        note: [input.assetId ? `素材ID：${input.assetId}` : "", `来源：${input.sourcePath}`, "状态：待生图"].filter(Boolean).join("\n"),
        source: "视频工作流 Stage 2",
        tags: ["视频工作流", "资产提示词", "待生图", input.episode, input.typeLabel].filter(Boolean),
        title: `${input.title} · ${input.typeLabel}`,
    };
}

function readPromptFromAssetContent(asset: Asset | null | undefined) {
    if (asset?.kind !== "text") return "";
    const match = asset.data.content.match(/\*\*提示词\*\*[:：]\s*([\s\S]*?)(?=\n\*\*[^：:\n]+?\*\*[:：]|\n#{2,3}\s|$)/);
    return match?.[1]?.trim() || "";
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function workflowAssetRaw(asset: Asset) {
    return readRecord(asset.metadata?.originalWorkflow) || {};
}

function readString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function mergeTags(current: string[] | undefined, next: string[]) {
    return Array.from(new Set([...(current || []).filter((tag) => tag !== "待生图"), ...next].filter(Boolean)));
}

function summarizeText(value: string, maxLength: number) {
    const text = value.replace(/\s+/g, " ").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
