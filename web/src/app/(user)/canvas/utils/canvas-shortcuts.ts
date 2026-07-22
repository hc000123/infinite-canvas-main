type CanvasShortcutContext = {
    canvasHasFocus: boolean;
    targetIsEditable: boolean;
    targetIsInOverlay: boolean;
    hasVisibleOverlay: boolean;
    hasTextSelection: boolean;
    isCopyShortcut: boolean;
};

export function shouldBlockCanvasShortcut(context: CanvasShortcutContext) {
    return context.targetIsEditable || context.targetIsInOverlay || context.hasVisibleOverlay || !context.canvasHasFocus || (context.isCopyShortcut && context.hasTextSelection);
}
