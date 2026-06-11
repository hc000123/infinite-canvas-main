import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { fetchVolcengineAssetStatus, submitVolcengineMediaAsset } from "@/services/api/volcengine-assets";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { buildVolcengineMediaFilename, isVolcengineReviewProcessing, mergeVolcengineReviewStatus, volcengineReviewMetadataFromSubmission, volcengineReviewPollingKey } from "@/services/volcengine-asset-metadata";
import type { Asset, VolcengineAssetMetadata } from "@/stores/use-asset-store";
import { fetchImageBlob, volcengineStatusLabel } from "./asset-utils";

type VolcengineReviewableAsset = Extract<Asset, { kind: "image" | "video" | "audio" }>;

type AssetReviewMessage = {
    error: (text: string) => void;
    success: (text: string) => void;
    warning: (text: string) => void;
};

export function useVolcengineAssetReview({
    message,
    selectedVolcengineRefreshAssets,
    selectedVolcengineSubmitAssets,
    setPreviewAsset,
    token,
    updateAsset,
    validAssets,
    volcengineAssetEnabled,
}: {
    message: AssetReviewMessage;
    selectedVolcengineRefreshAssets: VolcengineReviewableAsset[];
    selectedVolcengineSubmitAssets: VolcengineReviewableAsset[];
    setPreviewAsset: Dispatch<SetStateAction<Asset | null>>;
    token?: string | null;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    validAssets: Asset[];
    volcengineAssetEnabled: boolean;
}) {
    const [submittingReviewId, setSubmittingReviewId] = useState<string | null>(null);
    const [refreshingReviewId, setRefreshingReviewId] = useState<string | null>(null);
    const [bulkReviewAction, setBulkReviewAction] = useState<"submit" | "refresh" | "">("");
    const processingReviewIds = useMemo(() => volcengineReviewPollingKey(validAssets), [validAssets]);

    const updateVolcengineMetadata = useCallback(
        (asset: VolcengineReviewableAsset, volcengineAsset: VolcengineAssetMetadata) => {
            const metadata = {
                ...(asset.metadata || {}),
                volcengineAsset,
            };
            updateAsset(asset.id, { metadata });
            setPreviewAsset((current) => (current?.id === asset.id ? ({ ...current, metadata } as Asset) : current));
        },
        [setPreviewAsset, updateAsset],
    );

    const submitVolcengineReviewAsset = async (asset: VolcengineReviewableAsset) => {
        const storedBlob = asset.data.storageKey ? (asset.kind === "image" ? await getImageBlob(asset.data.storageKey) : await getMediaBlob(asset.data.storageKey)) : null;
        const blob = storedBlob || (await fetchImageBlob(asset.kind === "image" ? asset.data.dataUrl : asset.data.url));
        if (!blob) throw new Error(asset.kind === "image" ? "没有找到图片文件" : asset.kind === "audio" ? "没有找到音频文件" : "没有找到视频文件");
        const saved = asset.metadata?.volcengineAsset;
        const result = await submitVolcengineMediaAsset(token!, {
            file: blob,
            filename: buildVolcengineMediaFilename(asset.title, asset.id, asset.data.mimeType, asset.kind),
            assetTitle: asset.title,
            groupId: saved?.groupId,
            groupName: asset.title || "我的素材",
        });
        updateVolcengineMetadata(asset, volcengineReviewMetadataFromSubmission(result));
    };

    const refreshImageReview = useCallback(
        async (asset: Asset, options: { silent?: boolean; showProgress?: boolean } = {}) => {
            if ((asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio") || !asset.metadata?.volcengineAsset?.assetId) return;
            if (!token) {
                if (!options.silent) message.error("请先登录");
                return;
            }
            const showProgress = options.showProgress || !options.silent;
            if (showProgress) setRefreshingReviewId(asset.id);
            try {
                const saved = asset.metadata.volcengineAsset;
                const status = await fetchVolcengineAssetStatus(token, {
                    assetId: saved.assetId,
                    projectName: saved.projectName,
                });
                const next: VolcengineAssetMetadata = mergeVolcengineReviewStatus(saved, status);
                updateVolcengineMetadata(asset, next);
                const statusText = `当前状态：${volcengineStatusLabel(next.status)}${next.error ? `：${next.error}` : ""}`;
                if (!options.silent) {
                    if (next.status === "Failed") message.error(statusText);
                    else message.success(statusText);
                }
            } catch (error) {
                if (!options.silent) message.error(error instanceof Error ? error.message : "刷新失败");
            } finally {
                if (showProgress) setRefreshingReviewId((current) => (current === asset.id ? null : current));
            }
        },
        [message, token, updateVolcengineMetadata],
    );

    const submitImageReview = async (asset: Asset) => {
        if (asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio") return;
        if (!volcengineAssetEnabled) {
            message.warning("请先在配置里开启火山人像加白");
            return;
        }
        if (!token) {
            message.error("请先登录");
            return;
        }
        setSubmittingReviewId(asset.id);
        try {
            await submitVolcengineReviewAsset(asset);
            message.success("已提交火山审核");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "提交失败");
        } finally {
            setSubmittingReviewId(null);
        }
    };

    const submitSelectedVolcengineReviews = async () => {
        if (!volcengineAssetEnabled) return message.warning("请先在配置里开启火山人像加白");
        if (!token) return message.error("请先登录");
        if (!selectedVolcengineSubmitAssets.length) return message.warning("当前选择中没有可提交加白的图片或视频");
        setBulkReviewAction("submit");
        let success = 0;
        let failed = 0;
        try {
            for (const asset of selectedVolcengineSubmitAssets) {
                setSubmittingReviewId(asset.id);
                try {
                    await submitVolcengineReviewAsset(asset);
                    success += 1;
                } catch {
                    failed += 1;
                }
            }
            if (failed) message.warning(`已提交 ${success} 个，失败 ${failed} 个`);
            else message.success(`已提交 ${success} 个素材加白`);
        } finally {
            setSubmittingReviewId(null);
            setBulkReviewAction("");
        }
    };

    const refreshSelectedVolcengineReviews = async () => {
        if (!token) return message.error("请先登录");
        if (!selectedVolcengineRefreshAssets.length) return message.warning("当前选择中没有可刷新的火山素材");
        setBulkReviewAction("refresh");
        let success = 0;
        let failed = 0;
        try {
            for (const asset of selectedVolcengineRefreshAssets) {
                try {
                    await refreshImageReview(asset, { silent: true, showProgress: true });
                    success += 1;
                } catch {
                    failed += 1;
                }
            }
            if (failed) message.warning(`已刷新 ${success} 个，失败 ${failed} 个`);
            else message.success(`已刷新 ${success} 个火山素材状态`);
        } finally {
            setBulkReviewAction("");
        }
    };

    useEffect(() => {
        if (!token || !volcengineAssetEnabled || !processingReviewIds) return;
        let cancelled = false;
        let polling = false;
        const pollProcessingReviews = async () => {
            if (polling || cancelled) return;
            polling = true;
            for (const asset of validAssets) {
                if (cancelled) break;
                if ((asset.kind === "image" || asset.kind === "video") && isVolcengineReviewProcessing(asset.metadata?.volcengineAsset)) {
                    await refreshImageReview(asset, { silent: true, showProgress: true });
                }
            }
            polling = false;
        };
        void pollProcessingReviews();
        const timer = window.setInterval(() => void pollProcessingReviews(), 3000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [processingReviewIds, refreshImageReview, token, validAssets, volcengineAssetEnabled]);

    return {
        bulkReviewAction,
        refreshImageReview,
        refreshingReviewId,
        refreshSelectedVolcengineReviews,
        submitImageReview,
        submittingReviewId,
        submitSelectedVolcengineReviews,
    };
}
