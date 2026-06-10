"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { nanoid } from "nanoid";

import type { AiConfig } from "@/stores/use-config-store";
import type { Asset } from "@/stores/use-asset-store";
import { useStoryboardStore } from "../stores/use-storyboard-store";
import { planShotGroupCanvasInsert, planStoryboardGroupCanvasInsert, type StoryboardAssetRef, type StoryboardNodeRef, type StoryboardTableShot } from "../utils/storyboard-management";
import type { CanvasInspectorView } from "../components/canvas-context-inspector";
import type { CanvasProject } from "../stores/use-canvas-store";
import type { CanvasConnection, CanvasNodeData, Position, ViewportTransform } from "../types";

type CanvasActionMessage = {
    success: (content: string) => void;
    warning: (content: string) => void;
};

type UseCanvasStoryboardCanvasActionsOptions = {
    assets: Asset[];
    canvasAiConfig: AiConfig;
    currentProject?: CanvasProject | null;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    size: { width: number; height: number };
    viewportRef: MutableRefObject<ViewportTransform>;
    message: CanvasActionMessage;
    getCanvasCenter: () => Position;
    attachStoryboardShotCanvasNodes: (refs: Record<string, StoryboardNodeRef[]>) => void;
    attachShotGroupCanvasNodes: (groupId: string, refs: StoryboardNodeRef[]) => void;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setActiveTimelineShotId: Dispatch<SetStateAction<string>>;
    setActiveProductionPackageId: Dispatch<SetStateAction<string>>;
    setInspectorView: Dispatch<SetStateAction<CanvasInspectorView>>;
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
};

export function useCanvasStoryboardCanvasActions({
    assets,
    canvasAiConfig,
    currentProject,
    nodesRef,
    connectionsRef,
    size,
    viewportRef,
    message,
    getCanvasCenter,
    attachStoryboardShotCanvasNodes,
    attachShotGroupCanvasNodes,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setActiveTimelineShotId,
    setActiveProductionPackageId,
    setInspectorView,
    setViewport,
}: UseCanvasStoryboardCanvasActionsOptions) {
    const handleTimelineShotSelect = useCallback(
        (shot: StoryboardTableShot, nodeId?: string) => {
            setActiveTimelineShotId(shot.id);
            setActiveProductionPackageId("");
            setInspectorView("context");
            setSelectedConnectionId(null);
            if (!nodeId) {
                setSelectedNodeIds(new Set());
                return;
            }
            const node = nodesRef.current.find((item) => item.id === nodeId);
            setSelectedNodeIds(new Set([nodeId]));
            if (!node) return;
            const k = Math.max(0.45, Math.min(viewportRef.current.k, 1.2));
            setViewport({
                x: size.width / 2 - (node.position.x + node.width / 2) * k,
                y: size.height / 2 - (node.position.y + node.height / 2) * k,
                k,
            });
        },
        [nodesRef, setActiveProductionPackageId, setActiveTimelineShotId, setInspectorView, setSelectedConnectionId, setSelectedNodeIds, setViewport, size.height, size.width, viewportRef],
    );

    const addStoryboardGroupToCanvas = useCallback(
        (groupId: string, _autoAssetRefs: StoryboardAssetRef[] = []) => {
            const storyboardState = useStoryboardStore.getState();
            const group = storyboardState.groups.find((item) => item.id === groupId);
            const shots = storyboardState.shots.filter((shot) => shot.groupId === groupId);
            if (!group || !shots.length) {
                message.warning("请先创建分镜条目");
                return;
            }
            const center = getCanvasCenter();
            const plan = planStoryboardGroupCanvasInsert({
                group,
                shots,
                assets,
                position: { x: center.x - 520, y: center.y - 160 },
                config: {
                    provider: canvasAiConfig.videoProtocol === "volcengine-ark" ? "volcengine-ark" : "openai",
                    model: canvasAiConfig.videoProtocol === "volcengine-ark" ? canvasAiConfig.seedanceModel || canvasAiConfig.videoModel || canvasAiConfig.model : canvasAiConfig.videoModel || canvasAiConfig.model,
                    size: canvasAiConfig.size,
                    seconds: canvasAiConfig.videoSeconds,
                    vquality: canvasAiConfig.vquality,
                },
                episodeTitle: currentProject?.episodeTitle,
                idFactory: (prefix) => `${prefix}-${Date.now()}-${nanoid(5)}`,
                connectionIdFactory: () => nanoid(),
            });
            const nextNodes = [...nodesRef.current, ...plan.nodes];
            const nextConnections = [...connectionsRef.current, ...plan.connections];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set(plan.nodes.map((node) => node.id)));
            setSelectedConnectionId(null);
            attachStoryboardShotCanvasNodes(plan.shotNodeRefs);
            message.success("分镜组已加入画布");
        },
        [
            assets,
            attachStoryboardShotCanvasNodes,
            canvasAiConfig.model,
            canvasAiConfig.seedanceModel,
            canvasAiConfig.size,
            canvasAiConfig.videoModel,
            canvasAiConfig.videoProtocol,
            canvasAiConfig.videoSeconds,
            canvasAiConfig.vquality,
            connectionsRef,
            currentProject?.episodeTitle,
            getCanvasCenter,
            message,
            nodesRef,
            setConnections,
            setNodes,
            setSelectedConnectionId,
            setSelectedNodeIds,
        ],
    );

    const addShotGroupToCanvas = useCallback(
        (groupId: string, autoAssetRefs: StoryboardAssetRef[] = []) => {
            const storyboardState = useStoryboardStore.getState();
            const group = storyboardState.shotGroups.find((item) => item.id === groupId);
            const shots = storyboardState.tableShots.filter((shot) => group?.shotIds.includes(shot.id));
            if (!group || !shots.length) {
                message.warning("请先创建生成镜头组");
                return;
            }
            const center = getCanvasCenter();
            const plan = planShotGroupCanvasInsert({
                group,
                shots,
                assets,
                autoAssetRefs,
                position: { x: center.x - 520, y: center.y - 160 },
                config: {
                    provider: canvasAiConfig.videoProtocol === "volcengine-ark" ? "volcengine-ark" : "openai",
                    model: canvasAiConfig.videoProtocol === "volcengine-ark" ? canvasAiConfig.seedanceModel || canvasAiConfig.videoModel || canvasAiConfig.model : canvasAiConfig.videoModel || canvasAiConfig.model,
                    size: canvasAiConfig.size,
                    seconds: canvasAiConfig.videoSeconds,
                    vquality: canvasAiConfig.vquality,
                },
                episodeTitle: currentProject?.episodeTitle,
                idFactory: (prefix) => `${prefix}-${Date.now()}-${nanoid(5)}`,
                connectionIdFactory: () => nanoid(),
            });
            const nextNodes = [...nodesRef.current, ...plan.nodes];
            const nextConnections = [...connectionsRef.current, ...plan.connections];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set(plan.nodes.map((node) => node.id)));
            setSelectedConnectionId(null);
            attachShotGroupCanvasNodes(group.id, plan.groupNodeRefs);
            message.success("生成镜头组已加入画布");
        },
        [
            assets,
            attachShotGroupCanvasNodes,
            canvasAiConfig.model,
            canvasAiConfig.seedanceModel,
            canvasAiConfig.size,
            canvasAiConfig.videoModel,
            canvasAiConfig.videoProtocol,
            canvasAiConfig.videoSeconds,
            canvasAiConfig.vquality,
            connectionsRef,
            currentProject?.episodeTitle,
            getCanvasCenter,
            message,
            nodesRef,
            setConnections,
            setNodes,
            setSelectedConnectionId,
            setSelectedNodeIds,
        ],
    );

    return { handleTimelineShotSelect, addStoryboardGroupToCanvas, addShotGroupToCanvas };
}
