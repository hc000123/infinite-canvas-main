"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { AiConfig } from "@/stores/use-config-store";
import { buildCanvasVideoModePatch } from "../utils/canvas-video-config";
import { buildProductionPackagePrompt } from "../utils/canvas-production-package-prompt";
import { bindVideoNodeToProductionPackage, hideProductionVideoVersion, markCurrentProductionVideoVersion, type CanvasProductionPackageSummary, type CanvasProductionVideoVersion } from "../utils/canvas-production-packages";
import { placeCanvasNodeAwayFromNodes, resolveRightwardNodePosition } from "../utils/canvas-node-placement";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata, type Position, type ViewportTransform } from "../types";
import type { CanvasInspectorView } from "../components/canvas-context-inspector";

type CanvasActionMessage = {
    success: (content: string) => void;
    warning: (content: string) => void;
};

type UseCanvasProductionPackageActionsOptions = {
    canvasAiConfig: AiConfig;
    productionPackages: CanvasProductionPackageSummary[];
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    size: { width: number; height: number };
    viewportRef: MutableRefObject<ViewportTransform>;
    message: CanvasActionMessage;
    downloadNodeMedia: (node: CanvasNodeData) => void | Promise<void>;
    getAppendNodeCenter: (type: CanvasNodeType) => Position;
    createCanvasNode: (type: CanvasNodeType, position: Position, metadata?: CanvasNodeMetadata) => CanvasNodeData;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setActiveTimelineShotId: Dispatch<SetStateAction<string>>;
    setActiveProductionPackageId: Dispatch<SetStateAction<string>>;
    setInspectorView: Dispatch<SetStateAction<CanvasInspectorView>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
};

export function useCanvasProductionPackageActions({
    canvasAiConfig,
    productionPackages,
    nodesRef,
    size,
    viewportRef,
    message,
    downloadNodeMedia,
    getAppendNodeCenter,
    createCanvasNode,
    setNodes,
    setActiveTimelineShotId,
    setActiveProductionPackageId,
    setInspectorView,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setDialogNodeId,
    setViewport,
}: UseCanvasProductionPackageActionsOptions) {
    const selectAndCenterNode = useCallback(
        (node: CanvasNodeData) => {
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setInspectorView("context");
            const k = Math.max(0.45, Math.min(viewportRef.current.k, 1.15));
            setViewport({
                x: size.width / 2 - (node.position.x + node.width / 2) * k,
                y: size.height / 2 - (node.position.y + node.height / 2) * k,
                k,
            });
        },
        [setInspectorView, setSelectedConnectionId, setSelectedNodeIds, setViewport, size.height, size.width, viewportRef],
    );

    const focusProductionPackage = useCallback(
        (productionPackage: CanvasProductionPackageSummary) => {
            setActiveProductionPackageId(productionPackage.id);
            setActiveTimelineShotId("");
            setSelectedConnectionId(null);
            const relatedNodeIds = new Set(productionPackage.nodeIds);
            const relatedNodes = nodesRef.current.filter((node) => relatedNodeIds.has(node.id));
            setSelectedNodeIds(new Set());
            if (!relatedNodes.length) {
                if (productionPackage.shotIds[0]) setActiveTimelineShotId(productionPackage.shotIds[0]);
                return;
            }
            const left = Math.min(...relatedNodes.map((node) => node.position.x));
            const top = Math.min(...relatedNodes.map((node) => node.position.y));
            const right = Math.max(...relatedNodes.map((node) => node.position.x + node.width));
            const bottom = Math.max(...relatedNodes.map((node) => node.position.y + node.height));
            const width = Math.max(1, right - left);
            const height = Math.max(1, bottom - top);
            const k = Math.max(0.35, Math.min(1.05, Math.min((size.width - 120) / width, (size.height - 160) / height)));
            setViewport({
                x: size.width / 2 - (left + width / 2) * k,
                y: size.height / 2 - (top + height / 2) * k,
                k,
            });
        },
        [nodesRef, setActiveProductionPackageId, setActiveTimelineShotId, setSelectedConnectionId, setSelectedNodeIds, setViewport, size.height, size.width],
    );

    const handlePreviewProductionVideoVersion = useCallback(
        (version: CanvasProductionVideoVersion) => {
            selectAndCenterNode(version.node);
        },
        [selectAndCenterNode],
    );

    const handleDownloadProductionVideoVersion = useCallback(
        (version: CanvasProductionVideoVersion) => {
            void downloadNodeMedia(version.node);
        },
        [downloadNodeMedia],
    );

    const handleSetCurrentProductionVideoVersion = useCallback(
        (packageId: string, nodeId: string) => {
            setNodes((prev) => markCurrentProductionVideoVersion(prev, packageId, nodeId));
            message.success("已设为当前采用版本");
        },
        [message, setNodes],
    );

    const handleHideProductionVideoVersion = useCallback(
        (nodeId: string) => {
            setNodes((prev) => hideProductionVideoVersion(prev, nodeId));
            message.success("已隐藏该视频版本");
        },
        [message, setNodes],
    );

    const ensureProductionPackageConfigNode = useCallback(
        (productionPackage: CanvasProductionPackageSummary) => {
            const existingNode = productionPackage.configNodeId ? nodesRef.current.find((node) => node.id === productionPackage.configNodeId) : undefined;
            const packagePrompt = buildProductionPackagePrompt(productionPackage, nodesRef.current);
            if (existingNode) {
                const videoPatch = existingNode.metadata?.generationMode === "video" ? {} : buildCanvasVideoModePatch(canvasAiConfig);
                if (Object.keys(videoPatch).length || (packagePrompt && !String(existingNode.metadata?.prompt || existingNode.metadata?.finalPrompt || "").trim())) {
                    const updatedNode = {
                        ...existingNode,
                        metadata: {
                            ...existingNode.metadata,
                            ...videoPatch,
                            ...(packagePrompt && !String(existingNode.metadata?.prompt || existingNode.metadata?.finalPrompt || "").trim() ? { prompt: packagePrompt, finalPrompt: packagePrompt } : {}),
                        },
                    };
                    setNodes((prev) => prev.map((node) => (node.id === existingNode.id ? updatedNode : node)));
                    return updatedNode;
                }
                return existingNode;
            }
            const draftNode = createCanvasNode(CanvasNodeType.Config, getAppendNodeCenter(CanvasNodeType.Config), {
                ...buildCanvasVideoModePatch(canvasAiConfig),
                prompt: packagePrompt,
                finalPrompt: packagePrompt,
                productionPackageId: productionPackage.id,
                productionPackageLabel: productionPackage.label,
                productionPackageTitle: productionPackage.title,
                productionPackageRole: "video_config",
            });
            const configNode = placeCanvasNodeAwayFromNodes(
                {
                    ...draftNode,
                    title: `${productionPackage.label} · 视频配置`,
                    position: resolveRightwardNodePosition(nodesRef.current, draftNode.position, { width: draftNode.width, height: draftNode.height }),
                },
                nodesRef.current,
            );
            setNodes((prev) => [...prev, configNode]);
            setActiveProductionPackageId(productionPackage.id);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            return configNode;
        },
        [canvasAiConfig, createCanvasNode, getAppendNodeCenter, nodesRef, setActiveProductionPackageId, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    const handleInsertProductionPackageConfigNode = useCallback(
        (packageId: string) => {
            const targetPackage = productionPackages.find((item) => item.id === packageId);
            if (!targetPackage) return;
            const configNode = ensureProductionPackageConfigNode(targetPackage);
            setActiveProductionPackageId(packageId);
            selectAndCenterNode(configNode);
            message.success(targetPackage.configNodeId ? "已定位到该生产包配置" : "已把生产包配置放入画布");
        },
        [ensureProductionPackageConfigNode, message, productionPackages, selectAndCenterNode, setActiveProductionPackageId],
    );

    const handleEditProductionPackagePrompt = useCallback(
        (packageId: string) => {
            const targetPackage = productionPackages.find((item) => item.id === packageId);
            if (!targetPackage) return;
            const configNode = ensureProductionPackageConfigNode(targetPackage);
            setActiveProductionPackageId(packageId);
            selectAndCenterNode(configNode);
            setDialogNodeId(configNode.id);
        },
        [ensureProductionPackageConfigNode, productionPackages, selectAndCenterNode, setActiveProductionPackageId, setDialogNodeId],
    );

    const handleBindSelectedVideoToProductionPackage = useCallback(
        (packageId: string, nodeId: string) => {
            const targetPackage = productionPackages.find((item) => item.id === packageId);
            const targetNode = nodesRef.current.find((node) => node.id === nodeId);
            if (!targetPackage || !targetNode || targetNode.type !== CanvasNodeType.Video || !targetNode.metadata?.content) return;
            setNodes((prev) => bindVideoNodeToProductionPackage(prev, targetPackage, nodeId, new Date().toISOString()));
            setActiveProductionPackageId(packageId);
            setSelectedNodeIds(new Set([nodeId]));
            setSelectedConnectionId(null);
            setInspectorView("context");
            message.success(`已将视频绑定到 ${targetPackage.label}`);
        },
        [message, nodesRef, productionPackages, setActiveProductionPackageId, setInspectorView, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    return {
        focusProductionPackage,
        handlePreviewProductionVideoVersion,
        handleDownloadProductionVideoVersion,
        handleSetCurrentProductionVideoVersion,
        handleHideProductionVideoVersion,
        handleInsertProductionPackageConfigNode,
        handleEditProductionPackagePrompt,
        handleBindSelectedVideoToProductionPackage,
    };
}
