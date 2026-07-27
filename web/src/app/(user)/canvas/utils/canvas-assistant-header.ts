export function resolveCanvasAssistantHeaderActions({ view, historyCount, canStartChat }: { view: "chat" | "history"; historyCount: number; canStartChat: boolean }) {
    return {
        showHistory: view === "history" || historyCount > 0,
        showNewChat: view === "chat" && canStartChat,
    };
}
