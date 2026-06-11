"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";

import { fetchVolcengineAssetStatus, submitVolcengineMediaAsset } from "@/services/api/volcengine-assets";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { buildVolcengineMediaFilename, isVolcengineReviewProcessing, mergeVolcengineReviewStatus, volcengineReviewMetadataFromSubmission, volcengineReviewPollingKey } from "@/services/volcengine-asset-metadata";
import type { Asset, AssetWriteInput } from "@/stores/use-asset-store";
import { canvasNodeToAsset } from "../utils/canvas-assets";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "../types";

type CanvasMessage = {
    success: (content: string) => void;
    warning: (content: string) => void;
    error: (content: string) => void;
};

type UseCanvasNodeReviewActionsOptions = {
    token?: string;
    message: CanvasMessage;
    nodes: CanvasNodeData[];
    nodesRef: RefObject<CanvasNodeData[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    assets: Asset[];
    addAssetOnce: (asset: AssetWriteInput, options?: { blob?: Blob }) => Promise<string>;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    volcengineAssetEnabled: boolean;
};

export function useCanvasNodeReviewActions({ token, message, nodes, nodesRef, setNodes, assets, addAssetOnce, updateAsset, volcengineAssetEnabled }: UseCanvasNodeReviewActionsOptions) {
    const [submittingReviewNodeId, setSubmittingReviewNodeId] = useState<string | null>(null);
    const [refreshingReviewNodeId, setRefreshingReviewNodeId] = useState<string | null>(null);
    const submittingReviewNodeIdRef = useRef<string | null>(null);
    const refreshingReviewNodeIdRef = useRef<string | null>(null);
    const processingReviewNodeIds = useMemo(() => volcengineReviewPollingKey(nodes), [nodes]);

    const syncNodeVolcengineReviewToAssets = useCallback(
        async (node: CanvasNodeData, volcengineAsset: NonNullable<CanvasNodeMetadata["volcengineAsset"]>) => {
            if (node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) return;
            const updatedNode = { ...node, metadata: { ...node.metadata, volcengineAsset } };
            const sourceAsset = node.metadata?.sourceAssetId ? assets.find((asset) => asset.id === node.metadata?.sourceAssetId && asset.kind === node.type) : null;
            if (sourceAsset) {
                updateAsset(sourceAsset.id, { metadata: { ...(sourceAsset.metadata || {}), volcengineAsset } });
                return;
            }
            const asset = canvasNodeToAsset(updatedNode);
            if (asset) await addAssetOnce(asset).catch(() => undefined);
        },
        [addAssetOnce, assets, updateAsset],
    );

    const submitNodeVolcengineReview = useCallback(
        async (node: CanvasNodeData) => {
            if ((node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content) return;
            if (submittingReviewNodeIdRef.current === node.id) return;
            if (!volcengineAssetEnabled) {
                message.warning("请先开启火山素材加白");
                return;
            }
            if (!token) {
                message.error("请先登录");
                return;
            }
            submittingReviewNodeIdRef.current = node.id;
            setSubmittingReviewNodeId(node.id);
            try {
                const storedBlob = node.metadata.storageKey ? (node.type === CanvasNodeType.Image ? await getImageBlob(node.metadata.storageKey) : await getMediaBlob(node.metadata.storageKey)) : null;
                const blob = storedBlob || (await fetchCanvasBlob(node.metadata.content));
                if (!blob) {
                    message.error(node.type === CanvasNodeType.Image ? "没有找到图片文件" : node.type === CanvasNodeType.Audio ? "没有找到音频文件" : "没有找到视频文件");
                    return;
                }
                const title = node.metadata.prompt || node.title || (node.type === CanvasNodeType.Image ? "画布图片" : node.type === CanvasNodeType.Audio ? "画布音频" : "画布视频");
                const result = await submitVolcengineMediaAsset(token, {
                    file: blob,
                    filename: buildVolcengineMediaFilename(title, node.id, node.metadata.mimeType || blob.type, node.type),
                    assetTitle: title,
                    groupId: node.metadata.volcengineAsset?.groupId,
                    groupName: title,
                });
                const volcengineAsset = volcengineReviewMetadataFromSubmission(result);
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, volcengineAsset } } : item)));
                void syncNodeVolcengineReviewToAssets(node, volcengineAsset);
                message.success("已提交火山加白");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "提交加白失败");
            } finally {
                submittingReviewNodeIdRef.current = null;
                setSubmittingReviewNodeId(null);
            }
        },
        [message, setNodes, syncNodeVolcengineReviewToAssets, token, volcengineAssetEnabled],
    );

    const refreshNodeVolcengineReview = useCallback(
        async (node: CanvasNodeData, options: { silent?: boolean; showProgress?: boolean } = {}) => {
            const saved = node.metadata?.volcengineAsset;
            if ((node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !saved?.assetId) return;
            if (refreshingReviewNodeIdRef.current === node.id) return;
            if (!token) {
                if (!options.silent) message.error("请先登录");
                return;
            }
            const showProgress = options.showProgress || !options.silent;
            if (showProgress) {
                refreshingReviewNodeIdRef.current = node.id;
                setRefreshingReviewNodeId(node.id);
            }
            try {
                const status = await fetchVolcengineAssetStatus(token, {
                    assetId: saved.assetId,
                    projectName: saved.projectName,
                });
                const volcengineAsset = mergeVolcengineReviewStatus(saved, status);
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, volcengineAsset } } : item)));
                void syncNodeVolcengineReviewToAssets(node, volcengineAsset);
                if (!options.silent) {
                    const statusText = `当前状态：${volcengineStatusLabel(volcengineAsset.status)}${volcengineAsset.error ? `：${volcengineAsset.error}` : ""}`;
                    if (volcengineAsset.status === "Failed") message.error(statusText);
                    else message.success(statusText);
                }
            } catch (error) {
                if (!options.silent) message.error(error instanceof Error ? error.message : "刷新加白状态失败");
            } finally {
                if (showProgress) {
                    refreshingReviewNodeIdRef.current = null;
                    setRefreshingReviewNodeId((current) => (current === node.id ? null : current));
                }
            }
        },
        [message, setNodes, syncNodeVolcengineReviewToAssets, token],
    );

    useEffect(() => {
        if (!token || !volcengineAssetEnabled || !processingReviewNodeIds) return;
        let cancelled = false;
        let polling = false;
        const pollProcessingReviews = async () => {
            if (polling || cancelled) return;
            polling = true;
            for (const node of nodesRef.current) {
                if (cancelled) break;
                if ((node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) && isVolcengineReviewProcessing(node.metadata?.volcengineAsset)) {
                    await refreshNodeVolcengineReview(node, { silent: true, showProgress: true });
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
    }, [nodesRef, processingReviewNodeIds, refreshNodeVolcengineReview, token, volcengineAssetEnabled]);

    return {
        submittingReviewNodeId,
        refreshingReviewNodeId,
        submitNodeVolcengineReview,
        refreshNodeVolcengineReview,
    };
}

async function fetchCanvasBlob(url: string) {
    if (!url) return null;
    const response = await fetch(url);
    return response.blob();
}

function volcengineStatusLabel(status: string) {
    if (status === "Active") return "已加白";
    if (status === "Failed") return "审核失败";
    if (status === "Processing") return "审核中";
    return status || "未知";
}
