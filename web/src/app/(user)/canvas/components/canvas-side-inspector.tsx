"use client";

import { CanvasAssistantPanel } from "./canvas-assistant-panel";
import { CanvasContextInspector } from "./canvas-context-inspector";
import type { CanvasAssistantImage, CanvasAssistantSession, CanvasConnection, CanvasNodeData } from "../types";
import type { AssistantCanvasAction } from "../utils/canvas-assistant-actions";

type Props = {
    activeChatId: string | null;
    assistantMounted: boolean;
    canvasEpisodeId?: string;
    canvasId: string;
    collapsed: boolean;
    connections: CanvasConnection[];
    nodes: CanvasNodeData[];
    onApplyAssistantActions: (actions: AssistantCanvasAction[]) => boolean;
    onAssistantCollapse: () => void;
    onCollapsedChange: (collapsed: boolean) => void;
    onInsertImage: (image: CanvasAssistantImage) => void;
    onInsertText: (text: string) => void;
    onOpenAssistant: () => void;
    onOpenWorkflowAssistant: () => void;
    onPasteImage: (file: File) => void;
    onSelectNodeIds: (ids: Set<string>) => void;
    onSessionsChange: (sessions: CanvasAssistantSession[], activeSessionId: string | null, options?: { skipCanvasHistory?: boolean }) => void;
    projectId: string;
    selectedNodeIds: Set<string>;
    sessions: CanvasAssistantSession[];
    title: string;
};

export function CanvasSideInspector({
    activeChatId,
    assistantMounted,
    canvasEpisodeId,
    canvasId,
    collapsed,
    connections,
    nodes,
    onApplyAssistantActions,
    onAssistantCollapse,
    onCollapsedChange,
    onInsertImage,
    onInsertText,
    onOpenAssistant,
    onOpenWorkflowAssistant,
    onPasteImage,
    onSelectNodeIds,
    onSessionsChange,
    projectId,
    selectedNodeIds,
    sessions,
    title,
}: Props) {
    return (
        <CanvasContextInspector
            assistantMounted={assistantMounted}
            collapsed={collapsed}
            onCollapsedChange={onCollapsedChange}
            assistantSlot={
                assistantMounted ? (
                    <CanvasAssistantPanel
                        embedded
                        projectId={projectId}
                        canvasId={canvasId}
                        canvasTitle={title}
                        episodeId={canvasEpisodeId}
                        nodes={nodes}
                        connections={connections}
                        selectedNodeIds={selectedNodeIds}
                        sessions={sessions}
                        activeSessionId={activeChatId}
                        onSelectNodeIds={onSelectNodeIds}
                        onSessionsChange={onSessionsChange}
                        onInsertImage={onInsertImage}
                        onInsertText={onInsertText}
                        onPasteImage={onPasteImage}
                        onApplyAssistantActions={onApplyAssistantActions}
                        onOpenWorkflowAssistant={onOpenWorkflowAssistant}
                        onCollapse={onAssistantCollapse}
                    />
                ) : null
            }
            onOpenAssistant={onOpenAssistant}
        />
    );
}
