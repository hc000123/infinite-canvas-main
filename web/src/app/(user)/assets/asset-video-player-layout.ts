export function assetVideoPlayerStyle(width: number, height: number) {
    const safeWidth = width > 0 ? width : 16;
    const safeHeight = height > 0 ? height : 9;
    return {
        aspectRatio: `${safeWidth} / ${safeHeight}`,
        maxHeight: "70vh",
        width: `min(100%, calc(70vh * ${safeWidth} / ${safeHeight}))`,
    };
}
