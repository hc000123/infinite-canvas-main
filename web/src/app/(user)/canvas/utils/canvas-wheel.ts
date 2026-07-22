export function shouldHandleCanvasWheel({ ctrlKey, metaKey, excludedTarget }: { ctrlKey: boolean; metaKey: boolean; excludedTarget: boolean }) {
    return !ctrlKey && !metaKey && !excludedTarget;
}
