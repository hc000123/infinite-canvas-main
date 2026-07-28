export function shouldShowCanvasAssistantPanel({ assistantMounted, collapsed }: { assistantMounted: boolean; collapsed: boolean }) {
    return assistantMounted && !collapsed;
}
