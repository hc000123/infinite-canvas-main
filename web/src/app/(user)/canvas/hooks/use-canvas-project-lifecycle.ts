import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import { removeVariantVideoConnections } from "../utils/canvas-connection-cleanup";
import { resetInterruptedGeneration } from "../utils/canvas-video-task-recovery";
import { hydrateAssistantImages, hydrateCanvasImages } from "../utils/canvas-page-helpers";
import type { CanvasProject } from "../stores/use-canvas-store";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "../types";

type HistorySnapshot = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
};

type Props = {
    canvasId: string;
    focusNodeId: string;
    handledFocusNodeIdRef: RefObject<string>;
    hydrated: boolean;
    nodes: CanvasNodeData[];
    openProject: (id: string) => CanvasProject | null;
    projectLoaded: boolean;
    resetHistory: (snapshot: HistorySnapshot) => void;
    size: { width: number; height: number };
    viewportRef: RefObject<ViewportTransform>;
    navigateToProjects: () => void;
    clearFocusParam: () => void;
    setActiveChatId: Dispatch<SetStateAction<string | null>>;
    setBackgroundMode: Dispatch<SetStateAction<CanvasBackgroundMode>>;
    setChatSessions: Dispatch<SetStateAction<CanvasAssistantSession[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setProjectLoaded: Dispatch<SetStateAction<boolean>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setShowImageInfo: Dispatch<SetStateAction<boolean>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
};

export function useCanvasProjectLifecycle({
    canvasId,
    focusNodeId,
    handledFocusNodeIdRef,
    hydrated,
    nodes,
    openProject,
    projectLoaded,
    resetHistory,
    size,
    viewportRef,
    navigateToProjects,
    clearFocusParam,
    setActiveChatId,
    setBackgroundMode,
    setChatSessions,
    setConnections,
    setNodes,
    setProjectLoaded,
    setSelectedConnectionId,
    setSelectedNodeIds,
    setShowImageInfo,
    setDialogNodeId,
    setViewport,
}: Props) {
    useEffect(() => {
        if (!hydrated) return;
        setProjectLoaded(false);
        const project = openProject(canvasId);
        if (!project) {
            navigateToProjects();
            return;
        }

        const restore = async () => {
            const restoredNodes = await hydrateCanvasImages(resetInterruptedGeneration(project.nodes));
            const restoredConnections = removeVariantVideoConnections(restoredNodes, project.connections);
            const restoredSessions = await hydrateAssistantImages(project.chatSessions || []);
            setNodes(restoredNodes);
            setConnections(restoredConnections);
            setChatSessions(restoredSessions);
            setActiveChatId(project.activeChatId || null);
            setBackgroundMode(project.backgroundMode);
            setShowImageInfo(project.showImageInfo || false);
            setViewport(project.viewport);
            resetHistory({
                nodes: restoredNodes,
                connections: restoredConnections,
                chatSessions: restoredSessions,
                activeChatId: project.activeChatId || null,
                backgroundMode: project.backgroundMode,
                showImageInfo: project.showImageInfo || false,
            });
            setProjectLoaded(true);
        };
        void restore();
    }, [
        canvasId,
        hydrated,
        navigateToProjects,
        openProject,
        resetHistory,
        setActiveChatId,
        setBackgroundMode,
        setChatSessions,
        setConnections,
        setNodes,
        setProjectLoaded,
        setShowImageInfo,
        setViewport,
    ]);

    useEffect(() => {
        if (!projectLoaded || !focusNodeId || handledFocusNodeIdRef.current === focusNodeId) return;
        const node = nodes.find((item) => item.id === focusNodeId);
        if (!node || !size.width || !size.height) return;
        handledFocusNodeIdRef.current = focusNodeId;
        const k = viewportRef.current.k || 1;
        const centerX = node.position.x + node.width / 2;
        const centerY = node.position.y + node.height / 2;
        setSelectedNodeIds(new Set([focusNodeId]));
        setSelectedConnectionId(null);
        setDialogNodeId(focusNodeId);
        setViewport({
            x: size.width / 2 - centerX * k,
            y: size.height / 2 - centerY * k,
            k,
        });
        clearFocusParam();
    }, [canvasId, clearFocusParam, focusNodeId, handledFocusNodeIdRef, nodes, projectLoaded, setDialogNodeId, setSelectedConnectionId, setSelectedNodeIds, setViewport, size.height, size.width, viewportRef]);
}
