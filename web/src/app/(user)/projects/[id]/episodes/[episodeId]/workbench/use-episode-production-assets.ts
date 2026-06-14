import { useMemo } from "react";
import { App } from "antd";

import { recordAiTaskFrontendArtifact } from "@/services/api/ai-task-trace";
import { requestGeneration } from "@/services/api/image";
import { fetchVolcengineAssetStatus, submitVolcengineMediaAsset } from "@/services/api/volcengine-assets";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob, uploadImage } from "@/services/image-storage";
import { buildVolcengineMediaFilename, canSubmitVolcengineReview, mergeVolcengineReviewStatus, volcengineReviewMetadataFromSubmission } from "@/services/volcengine-asset-metadata";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import { importAssetFile } from "../../../../../assets/asset-import-actions";
import { buildAssetVersionReference } from "../../../../../assets/asset-version-references";
import { useProductionBibleStore } from "../../../../../canvas/stores/use-production-bible-store";
import type { ScriptEpisode } from "../../../../../canvas/utils/script-management";
import type { StoryboardTableShot } from "../../../../../canvas/utils/storyboard-management";
import type { AgentWorkflowMappingPreview } from "../../../../agent-runner-types";
import { buildEpisodeExtractedAssets, productionBibleRoleForExtractedAsset, type EpisodeExtractedAsset } from "./episode-asset-extraction";
import { episodeAssetImagePreset } from "./episode-asset-image-presets";
import type { EpisodeAssetImageGenerationOptions } from "./components/episode-assets-module-types";

type ReviewableAsset = Extract<Asset, { kind: "image" | "video" | "audio" }>;

export function useEpisodeProductionAssets({
    appliedPreviewItemIds,
    episode,
    episodeTableShots,
    preview,
    projectId,
    projectTitle,
}: {
    appliedPreviewItemIds: string[];
    episode: ScriptEpisode;
    episodeTableShots: StoryboardTableShot[];
    preview?: AgentWorkflowMappingPreview;
    projectId: string;
    projectTitle: string;
}) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const volcengineAssetEnabled = useConfigStore((state) => state.publicSettings?.volcengineAsset?.enabled === true);
    const token = useUserStore((state) => state.token);
    const assetLibrary = useAssetStore((state) => state.assets);
    const addAssetOnce = useAssetStore((state) => state.addAssetOnce);
    const ensureProjectFolder = useAssetStore((state) => state.ensureProjectFolder);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const productionBibleItems = useProductionBibleStore((state) => state.items);
    const updateProductionBibleItem = useProductionBibleStore((state) => state.updateItem);
    const assetRows = useMemo(
        () =>
            buildEpisodeExtractedAssets({
                appliedPreviewItemIds,
                assetLibrary,
                episode,
                episodeTableShots,
                preview,
                productionBibleItems,
                projectId,
            }),
        [appliedPreviewItemIds, assetLibrary, episode, episodeTableShots, preview, productionBibleItems, projectId],
    );

    const bindExtractedAsset = (row: EpisodeExtractedAsset, asset: Asset) => {
        if (!row.productionBibleItem) {
            message.warning("请先将资产清单写入设定库，再绑定项目资产库素材。");
            return;
        }
        if (row.productionBibleItem.assetRefs.some((ref) => ref.assetId === asset.id)) {
            message.info("当前素材已经绑定到这条资产。");
            return;
        }
        updateProductionBibleItem(row.productionBibleItem.id, {
            assetRefs: [
                ...row.productionBibleItem.assetRefs,
                {
                    assetId: asset.id,
                    assetVersion: buildAssetVersionReference(asset),
                    role: productionBibleRoleForExtractedAsset(row),
                },
            ],
        });
        message.success(`已绑定 ${asset.title}`);
    };

    const uploadExtractedAssetImage = async (row: EpisodeExtractedAsset, file: File) => {
        if (!file.type.startsWith("image/")) {
            message.warning("请上传图片文件。");
            return;
        }
        const folderId = ensureProjectFolder(projectId, projectTitle);
        const assetIds = await importAssetFile(file, { folderId, addAssetOnce });
        const uploaded = useAssetStore.getState().assets.find((asset) => assetIds.includes(asset.id) && asset.kind === "image");
        if (!uploaded) {
            message.warning("图片已导入素材库，但没有找到可绑定的图片素材。");
            return;
        }
        bindExtractedAsset(row, uploaded);
    };

    const generateExtractedAssetImages = async (row: EpisodeExtractedAsset, options: EpisodeAssetImageGenerationOptions = {}) => {
        const prompt = (options.prompt || row.promptDraft || row.description || row.name).trim();
        if (!prompt) {
            message.warning("这条资产还没有可用生图提示词。");
            return [];
        }
        const model = (options.model || effectiveConfig.imageModel || effectiveConfig.model).trim();
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning("请先完成生图模型配置。");
            openConfigDialog(true);
            return [];
        }
        const preset = episodeAssetImagePreset(row.type);
        const count = sanitizeImageCount(options.count || "1");
        const requestConfig: AiConfig = {
            ...effectiveConfig,
            model,
            imageModel: model,
            count,
            size: (options.size || preset.size).trim() || preset.size,
        };
        const hide = message.loading(`正在生成 ${row.name} 参考图`, 0);
        try {
            const sourceAssetId = row.productionBibleItem?.id || row.id;
            const results = await requestGeneration(requestConfig, prompt, { projectId, assetId: sourceAssetId, source: "episode-assets" }, {
                projectId,
                episodeId: episode.id,
                sourceType: "image_generation",
                sourceId: sourceAssetId,
                inputSummary: summarizeAssetGenerationInput(row, prompt),
            });
            const folderId = ensureProjectFolder(projectId, projectTitle);
            const assetIds: string[] = [];
            for (let index = 0; index < results.length; index += 1) {
                const result = results[index];
                const stored = await uploadImage(result.dataUrl);
                const assetId = await addAssetOnce({
                    kind: "image",
                    title: buildGeneratedAssetTitle(row, index, results.length),
                    coverUrl: stored.url,
                    folderId,
                    tags: [projectTitle, row.episodeLabel, row.type, row.name].filter(Boolean),
                    source: "本集资产生图",
                    note: `${preset.label} · ${prompt.slice(0, 180)}`,
                    data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType },
                    metadata: {
                        source: "episode-assets",
                        projectId,
                        projectTitle,
                        episodeId: episode.id,
                        episodeTitle: episode.title,
                        productionBibleItemId: row.productionBibleItem?.id,
                        assetExtractionItemId: row.id,
                        sourceRefs: [row.id, row.productionBibleItem?.id].filter(Boolean),
                        prompt,
                        generation: {
                            source: "episode-assets",
                            actionType: "generate",
                            model,
                            size: requestConfig.size,
                            quality: requestConfig.quality,
                            count,
                            finalPrompt: prompt,
                            assetType: row.type,
                            preset: preset.label,
                            projectId,
                            projectTitle,
                            episodeId: episode.id,
                            episodeTitle: episode.title,
                            productionBibleItemId: row.productionBibleItem?.id,
                            assetExtractionItemId: row.id,
                            aiTaskId: result.aiTask?.aiTaskId,
                            upstreamTaskId: result.aiTask?.upstreamTaskId,
                            creditLogId: result.aiTask?.creditLogId,
                            localAiTaskId: result.localAiTaskId,
                        },
                    },
                });
                if (result.aiTask?.aiTaskId) {
                    void recordAiTaskFrontendArtifact(result.aiTask.aiTaskId, {
                        assetId,
                        createdAt: new Date().toISOString(),
                        kind: "image",
                        projectId,
                    }).catch(() => undefined);
                }
                assetIds.push(assetId);
            }
            if (row.productionBibleItem) {
                const currentAssets = useAssetStore.getState().assets;
                const nextRefs = assetIds
                    .filter((assetId) => !row.productionBibleItem?.assetRefs.some((ref) => ref.assetId === assetId))
                    .map((assetId) => {
                        const asset = currentAssets.find((item) => item.id === assetId);
                        return {
                            assetId,
                            role: productionBibleRoleForExtractedAsset(row),
                            ...(asset ? { assetVersion: buildAssetVersionReference(asset) } : {}),
                        };
                    });
                if (nextRefs.length) updateProductionBibleItem(row.productionBibleItem.id, { assetRefs: [...row.productionBibleItem.assetRefs, ...nextRefs] });
                message.success(`已生成并绑定 ${assetIds.length} 张参考图`);
                return assetIds;
            }
            message.success(`已生成 ${assetIds.length} 张参考图并保存到项目素材库；写入设定库后可再绑定。`);
            return assetIds;
        } catch (error) {
            const reason = error instanceof Error ? error.message : "生成图片失败";
            message.error(reason);
            throw new Error(reason);
        } finally {
            hide();
        }
    };

    const reviewExtractedAssetImage = async (row: EpisodeExtractedAsset) => {
        const asset = reviewableAsset(row.previewAsset) ? row.previewAsset : row.candidates.find(reviewableAsset);
        if (!asset) {
            message.warning("请先生成、上传或绑定图片后再提交加白。");
            return;
        }
        if (!volcengineAssetEnabled) {
            message.warning("请先在配置里开启火山人像加白。");
            return;
        }
        if (!token) {
            message.error("请先登录。");
            return;
        }
        try {
            const saved = asset.metadata?.volcengineAsset;
            if (saved?.assetId && !canSubmitVolcengineReview(saved)) {
                const status = await fetchVolcengineAssetStatus(token, {
                    assetId: saved.assetId,
                    projectName: saved.projectName,
                });
                const volcengineAsset = mergeVolcengineReviewStatus(saved, status);
                updateAsset(asset.id, { metadata: { ...(asset.metadata || {}), volcengineAsset } });
                message.success(`当前加白状态：${volcengineStatusLabel(volcengineAsset.status)}${volcengineAsset.error ? `：${volcengineAsset.error}` : ""}`);
                return;
            }
            const blob = await readReviewAssetBlob(asset);
            if (!blob) {
                message.error(asset.kind === "image" ? "没有找到图片文件。" : asset.kind === "audio" ? "没有找到音频文件。" : "没有找到视频文件。");
                return;
            }
            const result = await submitVolcengineMediaAsset(token, {
                file: blob,
                filename: buildVolcengineMediaFilename(asset.title, asset.id, asset.data.mimeType || blob.type, asset.kind),
                assetTitle: asset.title || row.name,
                groupId: saved?.groupId,
                groupName: row.name || asset.title || "本集资产",
            });
            const volcengineAsset = volcengineReviewMetadataFromSubmission(result);
            updateAsset(asset.id, { metadata: { ...(asset.metadata || {}), volcengineAsset } });
            message.success("已提交火山加白。");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "提交加白失败。");
        }
    };

    return { assetRows, bindExtractedAsset, generateExtractedAssetImages, reviewExtractedAssetImage, uploadExtractedAssetImage };
}

function sanitizeImageCount(value: string) {
    return String(Math.max(1, Math.min(4, Math.floor(Math.abs(Number(value)) || 1))));
}

function buildGeneratedAssetTitle(row: EpisodeExtractedAsset, index: number, total: number) {
    return total > 1 ? `${row.name} 参考图 ${index + 1}` : `${row.name} 参考图`;
}

function summarizeAssetGenerationInput(row: EpisodeExtractedAsset, prompt: string) {
    const text = prompt.replace(/\s+/g, " ").trim();
    const summary = text.length > 160 ? `${text.slice(0, 160)}...` : text;
    return `${row.type} ${row.name}；${summary}`;
}

function reviewableAsset(asset?: Asset): asset is ReviewableAsset {
    return Boolean(asset && (asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"));
}

async function readReviewAssetBlob(asset: ReviewableAsset) {
    const storedBlob = asset.data.storageKey ? (asset.kind === "image" ? await getImageBlob(asset.data.storageKey) : await getMediaBlob(asset.data.storageKey)) : null;
    if (storedBlob) return storedBlob;
    const url = asset.kind === "image" ? asset.data.dataUrl || asset.coverUrl : asset.data.url;
    if (!url) return null;
    return fetch(url).then((response) => response.blob());
}

function volcengineStatusLabel(status: string) {
    if (status === "Active") return "已加白";
    if (status === "Failed") return "审核失败";
    if (status === "Processing") return "审核中";
    return status || "未知";
}
