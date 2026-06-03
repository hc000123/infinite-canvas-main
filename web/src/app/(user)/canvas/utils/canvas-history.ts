import type { CanvasBackgroundMode } from "@/lib/canvas-theme";

import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData } from "../types.ts";

export type CanvasHistoryEntry = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
};

export type CanvasHistoryStack = {
    past: CanvasHistoryEntry[];
    future: CanvasHistoryEntry[];
};

export function createEmptyCanvasHistoryStack(): CanvasHistoryStack {
    return { past: [], future: [] };
}

export function canvasHistoryAvailability(stack: CanvasHistoryStack) {
    return { canUndo: stack.past.length > 0, canRedo: stack.future.length > 0 };
}

export function isSameCanvasHistoryEntry(previous: CanvasHistoryEntry | null | undefined, next: CanvasHistoryEntry) {
    return (
        previous?.nodes === next.nodes &&
        previous.connections === next.connections &&
        previous.chatSessions === next.chatSessions &&
        previous.activeChatId === next.activeChatId &&
        previous.backgroundMode === next.backgroundMode &&
        previous.showImageInfo === next.showImageInfo
    );
}

export function pushCanvasHistoryEntry(stack: CanvasHistoryStack, entry: CanvasHistoryEntry, limit = 50): CanvasHistoryStack {
    return { past: [...stack.past.slice(-(limit - 1)), entry], future: [] };
}

export function undoCanvasHistory(stack: CanvasHistoryStack, current: CanvasHistoryEntry | null | undefined) {
    const entry = stack.past.at(-1);
    if (!entry || !current) return { entry: null, stack };
    return {
        entry,
        stack: {
            past: stack.past.slice(0, -1),
            future: [...stack.future, current],
        },
    };
}

export function redoCanvasHistory(stack: CanvasHistoryStack, current: CanvasHistoryEntry | null | undefined) {
    const entry = stack.future.at(-1);
    if (!entry || !current) return { entry: null, stack };
    return {
        entry,
        stack: {
            past: [...stack.past, current],
            future: stack.future.slice(0, -1),
        },
    };
}
