import type { AssetProjectResultGroup } from "./asset-project-groups.ts";

export function packAssetProjectGroupPages(groups: AssetProjectResultGroup[], targetAssetCount = 30) {
    const pages: AssetProjectResultGroup[][] = [];
    let page: AssetProjectResultGroup[] = [];
    let assetCount = 0;
    groups.forEach((group) => {
        const nextCount = assetCount + group.assets.length;
        if (page.length && nextCount > targetAssetCount) {
            pages.push(page);
            page = [];
            assetCount = 0;
        }
        page.push(group);
        assetCount += group.assets.length;
    });
    if (page.length) pages.push(page);
    return pages;
}
