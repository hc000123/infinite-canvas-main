"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { AiConfig } from "@/stores/use-config-store";
import { buildCanvasVideoModePatch } from "../utils/canvas-video-config";
import { applyPreviousPackageTailFrame, hideProductionVideoVersion, markCurrentProductionVideoVersion, type CanvasProductionPackageSummary, type CanvasProductionVideoVersion } from "../utils/canvas-production-packages";
import { placeCanvasNodeAwayFromNodes, resolveRightwardNodePosition } from "../utils/canvas-node-placement";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata, type Position, type ViewportTransform } from "../types";
import type { CanvasInspectorView } from "../components/canvas-context-inspector";
import type { CanvasNodeGenerationMode } from "../components/canvas-node-prompt-panel";

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
    handleGenerateNode: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<unknown>;
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
    handleGenerateNode,
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
            setInspectorView("context");
            setSelectedConnectionId(null);
            const relatedNodeIds = new Set(productionPackage.nodeIds);
            const relatedNodes = nodesRef.current.filter((node) => relatedNodeIds.has(node.id));
            setSelectedNodeIds(new Set(relatedNodes.map((node) => node.id)));
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
        [nodesRef, setActiveProductionPackageId, setActiveTimelineShotId, setInspectorView, setSelectedConnectionId, setSelectedNodeIds, setViewport, size.height, size.width],
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
            if (existingNode) return existingNode;
            const draftNode = createCanvasNode(CanvasNodeType.Config, getAppendNodeCenter(CanvasNodeType.Config), {
                ...buildCanvasVideoModePatch(canvasAiConfig),
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
            setDialogNodeId(configNode.id);
            return configNode;
        },
        [canvasAiConfig, createCanvasNode, getAppendNodeCenter, nodesRef, setActiveProductionPackageId, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds],
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

    const handleGenerateProductionPackageVersion = useCallback(
        (packageId: string) => {
            const targetPackage = productionPackages.find((item) => item.id === packageId);
            if (!targetPackage) return;
            const configNode = ensureProductionPackageConfigNode(targetPackage);
            setActiveProductionPackageId(packageId);
            selectAndCenterNode(configNode);
            const prompt = configNode.metadata?.prompt || configNode.metadata?.finalPrompt || "";
            if (!prompt.trim()) {
                setDialogNodeId(configNode.id);
                message.warning("已创建该生产包的视频配置节点，请先补充提示词再生成");
                return;
            }
            void handleGenerateNode(configNode.id, "video", prompt);
        },
        [ensureProductionPackageConfigNode, handleGenerateNode, message, productionPackages, selectAndCenterNode, setActiveProductionPackageId, setDialogNodeId],
    );

    const handleUsePreviousPackageTailFrame = useCallback(
        (packageId: string) => {
            const targetPackage = productionPackages.find((item) => item.id === packageId);
            if (!targetPackage?.previousCurrentVersion) return message.warning("上一生产包还没有当前采用版本");
            setNodes((prev) => applyPreviousPackageTailFrame(prev, packageId, targetPackage.previousCurrentVersion!));
            message.success("已启用上一包尾帧参考");
        },
        [message, productionPackages, setNodes],
    );

    return {
        focusProductionPackage,
        handlePreviewProductionVideoVersion,
        handleDownloadProductionVideoVersion,
        handleSetCurrentProductionVideoVersion,
        handleHideProductionVideoVersion,
        handleEditProductionPackagePrompt,
        handleGenerateProductionPackageVersion,
        handleUsePreviousPackageTailFrame,
    };
}
