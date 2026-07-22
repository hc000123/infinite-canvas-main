"use client";

import { useState } from "react";

import { buildWorkflowGeneratedImagePatch, workflowAssetPrompt } from "@/app/(user)/assets/workflow-asset-image";
import { requestGeneration } from "@/services/api/image";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { mapWithConcurrency } from "./workflow-background-task";

export function useWorkflowAssetImageActions() {
    const config = useEffectiveConfig();
    const model = (config.imageModel || config.model).trim();
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const [generatingIds, setGeneratingIds] = useState<string[]>([]);

    const generate = async (assets: Asset[]) => {
        const succeededIds: string[] = [];
        const failed: Array<{ id: string; message: string }> = [];
        setGeneratingIds(assets.map((asset) => asset.id));
        try {
            await mapWithConcurrency(assets, 2, async (asset) => {
                try {
                    const prompt = workflowAssetPrompt(asset);
                    if (!prompt) throw new Error("缺少生图提示词");
                    if (!model) throw new Error("缺少可用的图片模型");
                    const requestConfig = { ...config, count: "1", imageModel: model, model };
                    const [result] = await requestGeneration(requestConfig, prompt, { projectId: readProjectId(asset), assetId: asset.id, source: "workflow-asset-design" }, { projectId: readProjectId(asset), episodeId: readEpisodeId(asset), sourceId: asset.id, sourceType: "image_generation" });
                    if (!result) throw new Error("图片模型没有返回结果");
                    const stored = await uploadImage(result.dataUrl);
                    updateAsset(asset.id, buildWorkflowGeneratedImagePatch(asset, stored, { config: requestConfig, model, result }));
                    succeededIds.push(asset.id);
                } catch (error) {
                    failed.push({ id: asset.id, message: error instanceof Error ? error.message : "生成失败" });
                } finally {
                    setGeneratingIds((ids) => ids.filter((id) => id !== asset.id));
                }
            });
            return { failed, succeededIds };
        } finally {
            setGeneratingIds([]);
        }
    };

    return { generate, generatingIds, model };
}

function workflowMeta(asset: Asset) {
    const value = asset.metadata?.originalWorkflow;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function readProjectId(asset: Asset) { const value = workflowMeta(asset).sourceProjectId; return typeof value === "string" ? value : ""; }
function readEpisodeId(asset: Asset) { const value = workflowMeta(asset).sourceEpisodeId; return typeof value === "string" ? value : ""; }
