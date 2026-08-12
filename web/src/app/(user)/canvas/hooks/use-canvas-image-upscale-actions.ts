"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { nanoid } from "nanoid";

import { createImageUpscaleJob, getImageUpscaleCapabilities, getImageUpscaleJob, retryImageUpscaleJob, type ImageUpscaleCapabilities, type ImageUpscaleJob } from "@/services/api/image-upscale";
import { getImageBlob, uploadImage } from "@/services/image-storage";
import { applyImageUpscaleJobToNode, buildImageUpscaleDraft, imageUpscaleJobActive } from "../utils/canvas-image-upscale";
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata } from "../types";

type Message = { error: (text: string) => void; success: (text: string) => void; warning: (text: string) => void };

export function useCanvasImageUpscaleActions({
    addCanvasNodeToAssets,
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
    const [capabilities, setCapabilities] = useState<ImageUpscaleCapabilities | null>(null);
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

    const applyJob = useCallback(
        (nodeId: string, job: ImageUpscaleJob, imageMetadata?: Partial<CanvasNodeMetadata>) => {
            setNodes((current) => {
                const next = current.map((node) => (node.id === nodeId ? applyImageUpscaleJobToNode(node, job, imageMetadata) : node));
                nodesRef.current = next;
                return next;
            });
        },
        [nodesRef, setNodes],
    );

    const finalizeJob = useCallback(
        async (nodeId: string, job: ImageUpscaleJob) => {
            try {
                const response = await fetch(job.resultUrl, { credentials: "same-origin" });
                if (!response.ok) throw new Error("超分结果下载失败");
                const blob = await response.blob();
                const uploaded = await uploadImage(blob);
                const current = nodesRef.current.find((item) => item.id === nodeId);
                if (!current) return;
                const finalNode = applyImageUpscaleJobToNode(current, job, {
                    content: uploaded.url,
                    storageKey: uploaded.storageKey,
                    naturalWidth: uploaded.width,
                    naturalHeight: uploaded.height,
                    bytes: uploaded.bytes,
                    mimeType: uploaded.mimeType,
                });
                setNodes((items) => {
                    const next = items.map((item) => (item.id === nodeId ? finalNode : item));
                    nodesRef.current = next;
                    return next;
                });
                if (!(await addCanvasNodeToAssets(finalNode))) message.warning("超分已完成，归档到资产失败，可稍后手动保存");
                else message.success("图片超分已完成并归档到资产");
            } catch (error) {
                setNodes((items) => {
                    const next = items.map((item) => {
                        if (item.id !== nodeId) return item;
                        const projected = applyImageUpscaleJobToNode(item, job);
                        return { ...projected, metadata: { ...projected.metadata, status: "error" as const, errorDetails: error instanceof Error ? error.message : "超分结果保存失败" } };
                    });
                    nodesRef.current = next;
                    return next;
                });
                message.error(error instanceof Error ? error.message : "超分结果保存失败");
            }
        },
        [addCanvasNodeToAssets, message, nodesRef, setNodes],
    );

    const pollJob = useCallback(
        async (jobId: string, nodeId: string) => {
            if (pollingJobIdsRef.current.has(jobId)) return;
            pollingJobIdsRef.current.add(jobId);
            try {
                while (mountedRef.current) {
                    try {
                        const job = await getImageUpscaleJob(jobId);
                        applyJob(nodeId, job);
                        if (job.status === "succeeded") {
                            await finalizeJob(nodeId, job);
                            return;
                        }
                        if (!imageUpscaleJobActive(job.status)) return;
                    } catch {
                        // 网络短暂中断时只继续查询同一个任务，绝不重新创建付费请求。
                    }
                    await new Promise((resolve) => window.setTimeout(resolve, 1500));
                }
            } finally {
                pollingJobIdsRef.current.delete(jobId);
            }
        },
        [applyJob, finalizeJob],
    );

    useEffect(() => {
        nodes.forEach((node) => {
            const upscale = node.metadata?.imageUpscale;
            const incompleteSuccess = upscale?.status === "succeeded" && node.metadata?.status === "loading" && !node.metadata.storageKey;
            if (upscale && (imageUpscaleJobActive(upscale.status) || incompleteSuccess)) void pollJob(upscale.jobId, node.id);
        });
    }, [nodes, pollJob]);

    const open = useCallback(async (node: CanvasNodeData) => {
        setSourceNodeId(node.id);
        setCapabilities(null);
        try {
            setCapabilities(await getImageUpscaleCapabilities());
        } catch {
            setCapabilities(null);
        }
    }, []);

    const submit = useCallback(
        async (node: CanvasNodeData, scale: 2 | 4) => {
            if (!node.metadata?.content || submittingRef.current) return;
            submittingRef.current = true;
            setSubmitting(true);
            try {
                const blob = node.metadata.storageKey ? await getImageBlob(node.metadata.storageKey) : await fetch(node.metadata.content).then((response) => response.blob());
                if (!blob) throw new Error("没有找到原始图片文件");
                const job = await createImageUpscaleJob({ file: blob, filename: `${node.title || "image"}.${imageExtension(blob.type)}`, scale, projectId, canvasId, sourceNodeId: node.id, sourceAssetId: node.metadata.sourceAssetId });
                const childId = nanoid();
                const draft = buildImageUpscaleDraft(node, childId, job, nodesRef.current);
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
                message.error(error instanceof Error ? error.message : "图片超分提交失败");
            } finally {
                submittingRef.current = false;
                setSubmitting(false);
            }
        },
        [canvasId, connectionsRef, message, nodesRef, pollJob, projectId, setConnections, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    const retry = useCallback(
        async (node: CanvasNodeData) => {
            const upscale = node.metadata?.imageUpscale;
            if (!upscale) return;
            try {
                const job = upscale.status === "succeeded" ? await getImageUpscaleJob(upscale.jobId) : await retryImageUpscaleJob(upscale.jobId);
                applyJob(node.id, job);
                if (job.status === "succeeded") await finalizeJob(node.id, job);
                else void pollJob(job.id, node.id);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "图片超分重试失败");
            }
        },
        [applyJob, finalizeJob, message, pollJob],
    );

    return { node: sourceNode, capabilities, submitting, open, close: () => setSourceNodeId(null), submit, retry };
}

function imageExtension(mimeType: string) {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/webp") return "webp";
    if (mimeType === "image/bmp") return "bmp";
    return "png";
}
