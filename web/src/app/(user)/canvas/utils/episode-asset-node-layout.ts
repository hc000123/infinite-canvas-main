import type { Asset } from "@/stores/use-asset-store";

const CATEGORY_ORDER = { character: 0, scene: 1, prop: 2, blocking: 3, other: 4 } as const;

export function sortEpisodeAssetsForCanvas(assets: Asset[]) {
    return [...assets].sort((left, right) => {
        const leftBinding = left.assetBinding;
        const rightBinding = right.assetBinding;
        return (
            (leftBinding ? CATEGORY_ORDER[leftBinding.category] : 5) - (rightBinding ? CATEGORY_ORDER[rightBinding.category] : 5) ||
            (leftBinding?.subjectId || "").localeCompare(rightBinding?.subjectId || "") ||
            (leftBinding?.variantName || left.title).localeCompare(rightBinding?.variantName || right.title, "zh-Hans-CN")
        );
    });
}
