"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { nanoid } from "nanoid";

import { createVideoUpscaleJob, getVideoUpscaleCapabilities, getVideoUpscaleJob, retryVideoUpscaleJob, type VideoUpscaleCapabilities, type VideoUpscaleJob } from "@/services/api/video-upscale";
import { getMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata } from "../types";
import { applyVideoUpscaleJobToNode, buildVideoUpscaleDraft, videoUpscaleJobActive } from "../utils/canvas-video-upscale";

type Message = { error: (text: string) => void; success: (text: string) => void; warning: (text: string) => void };

export function useCanvasVideoUpscaleActions({
    addCanvasNodeToAssets,
    cacheUploadedCanvasMedia,
    canvasId,
    connectionsRef,
    message,
    nodes,
    nodesRef,
    projectId,
    setConnections,
    setNodes,
    setSelectedConnectionId,
    setSelectedNodeIds,
}: {
    addCanvasNodeToAssets: (node: CanvasNodeData) => Promise<string | false>;
    cacheUploadedCanvasMedia: (file: UploadedFile, node: CanvasNodeData) => Promise<Partial<CanvasNodeMetadata>>;
    canvasId: string;
    connectionsRef: RefObject<CanvasConnection[]>;
    message: Message;
    nodes: CanvasNodeData[];
    nodesRef: RefObject<CanvasNodeData[]>;
    projectId: string;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
}) {
    const [sourceNodeId, setSourceNodeId] = useState<string | null>(null);
    const [capabilities, setCapabilities] = useState<VideoUpscaleCapabilities | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const submittingRef = useRef(false);
    const pollingJobIdsRef = useRef(new Set<string>());
    const mountedRef = useRef(true);
    const sourceNode = sourceNodeId ? nodes.find((item) => item.id === sourceNodeId) || null : null;

    useEffect(() => {
        mountedRef.current = true;
        return () => void (mountedRef.current = false);
    }, []);
    useEffect(() => {
        if (sourceNodeId && !nodes.some((item) => item.id === sourceNodeId)) setSourceNodeId(null);
    }, [nodes, sourceNodeId]);

    const updateNode = useCallback(
        (nodeId: string, job: VideoUpscaleJob, mediaMetadata?: Partial<CanvasNodeMetadata>) => {
            setNodes((current) => {
                const next = current.map((node) => (node.id === nodeId ? applyVideoUpscaleJobToNode(node, job, mediaMetadata) : node));
                nodesRef.current = next;
                return next;
            });
        },
        [nodesRef, setNodes],
    );

    const finalizeJob = useCallback(
        async (nodeId: string, job: VideoUpscaleJob) => {
            try {
                const response = await fetch(job.resultUrl, { credentials: "same-origin" });
                if (!response.ok) throw new Error("超分结果下载失败");
                const uploaded = await uploadMediaFile(await response.blob(), "video-upscale");
                const current = nodesRef.current.find((item) => item.id === nodeId);
                if (!current) return;
                const localMetadata: Partial<CanvasNodeMetadata> = {
                    content: uploaded.url,
                    storageKey: uploaded.storageKey,
                    naturalWidth: uploaded.width || job.outputWidth,
                    naturalHeight: uploaded.height || job.outputHeight,
                    bytes: uploaded.bytes,
                    mimeType: uploaded.mimeType,
                    duration: job.inputDurationSeconds ? String(job.inputDurationSeconds) : undefined,
                };
                const localNode = applyVideoUpscaleJobToNode(current, job, localMetadata);
                const cacheMetadata = await cacheUploadedCanvasMedia(uploaded, localNode);
                const finalNode = applyVideoUpscaleJobToNode(localNode, job, cacheMetadata);
                setNodes((items) => {
                    const next = items.map((item) => (item.id === nodeId ? finalNode : item));
                    nodesRef.current = next;
                    return next;
                });
                if (!(await addCanvasNodeToAssets(finalNode))) message.warning("视频超分已完成，归档到资产失败，可稍后手动保存");
                else message.success("视频超分已完成并归档到资产");
            } catch (error) {
                setNodes((items) => {
                    const next = items.map((item) => {
                        if (item.id !== nodeId) return item;
                        const projected = applyVideoUpscaleJobToNode(item, job);
                        return { ...projected, metadata: { ...projected.metadata, status: "error" as const, errorDetails: error instanceof Error ? error.message : "超分结果保存失败" } };
                    });
                    nodesRef.current = next;
                    return next;
                });
                message.error(error instanceof Error ? error.message : "超分结果保存失败");
            }
        },
        [addCanvasNodeToAssets, cacheUploadedCanvasMedia, message, nodesRef, setNodes],
    );

    const pollJob = useCallback(
        async (jobId: string, nodeId: string) => {
            if (pollingJobIdsRef.current.has(jobId)) return;
            pollingJobIdsRef.current.add(jobId);
            try {
                while (mountedRef.current) {
                    try {
                        const job = await getVideoUpscaleJob(jobId);
                        updateNode(nodeId, job);
                        if (job.status === "succeeded") {
                            await finalizeJob(nodeId, job);
                            return;
                        }
                        if (!videoUpscaleJobActive(job.status)) return;
                    } catch {
                        // 网络短暂中断时继续查询原任务，绝不重新提交付费增强。
                    }
                    await new Promise((resolve) => window.setTimeout(resolve, 1500));
                }
            } finally {
                pollingJobIdsRef.current.delete(jobId);
            }
        },
        [finalizeJob, updateNode],
    );

    useEffect(() => {
        nodes.forEach((node) => {
            const upscale = node.metadata?.videoUpscale;
            const incompleteSuccess = upscale?.status === "succeeded" && node.metadata?.status !== "success";
            if (upscale && (videoUpscaleJobActive(upscale.status) || incompleteSuccess)) void pollJob(upscale.jobId, node.id);
        });
    }, [nodes, pollJob]);

    const open = useCallback(async (node: CanvasNodeData) => {
        setSourceNodeId(node.id);
        setCapabilities(null);
        try {
            setCapabilities(await getVideoUpscaleCapabilities());
        } catch {
            setCapabilities(null);
        }
    }, []);

    const submit = useCallback(
        async (node: CanvasNodeData, target: "1080p" | "2k") => {
            if (!node.metadata?.content || submittingRef.current) return;
            submittingRef.current = true;
            setSubmitting(true);
            try {
                const blob = node.metadata.storageKey ? await getMediaBlob(node.metadata.storageKey) : await fetch(node.metadata.content).then((response) => response.blob());
                if (!blob) throw new Error("没有找到原始视频文件");
                const job = await createVideoUpscaleJob({ file: blob, filename: `${node.title || "video"}.${videoExtension(blob.type)}`, target, projectId, canvasId, sourceNodeId: node.id, sourceAssetId: node.metadata.sourceAssetId });
                const childId = nanoid();
                const draft = buildVideoUpscaleDraft(node, childId, job, nodesRef.current);
                setNodes((current) => {
                    const next = [...current, draft.node];
                    nodesRef.current = next;
                    return next;
                });
                setConnections((current) => {
                    const next = [...current, draft.connection];
                    connectionsRef.current = next;
                    return next;
                });
                setSelectedNodeIds(new Set([childId]));
                setSelectedConnectionId(null);
                setSourceNodeId(null);
                void pollJob(job.id, childId);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "视频超分提交失败");
            } finally {
                submittingRef.current = false;
                setSubmitting(false);
            }
        },
        [canvasId, connectionsRef, message, nodesRef, pollJob, projectId, setConnections, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    const retry = useCallback(
        async (node: CanvasNodeData) => {
            const upscale = node.metadata?.videoUpscale;
            if (!upscale) return;
            try {
                const job = upscale.status === "succeeded" ? await getVideoUpscaleJob(upscale.jobId) : await retryVideoUpscaleJob(upscale.jobId);
                updateNode(node.id, job);
                if (job.status === "succeeded") await finalizeJob(node.id, job);
                else void pollJob(job.id, node.id);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "视频超分重试失败");
            }
        },
        [finalizeJob, message, pollJob, updateNode],
    );

    return { node: sourceNode, capabilities, submitting, open, close: () => setSourceNodeId(null), submit, retry };
}

function videoExtension(mimeType: string) {
    if (mimeType === "video/webm") return "webm";
    if (mimeType === "video/quicktime") return "mov";
    return "mp4";
}
