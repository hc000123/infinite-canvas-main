import { useConfigStore } from "@/stores/use-config-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import { useCanvasStore } from "../canvas/stores/use-canvas-store";
import { useProductionBibleStore } from "../canvas/stores/use-production-bible-store";
import { useStoryboardStore } from "../canvas/stores/use-storyboard-store";
import { useCreativeProjectStore } from "../projects/use-creative-project-store";

export function useAssetPageStores() {
    return {
        addAsset: useAssetStore((state) => state.addAsset),
        addAssetOnce: useAssetStore((state) => state.addAssetOnce),
        addFolder: useAssetStore((state) => state.addFolder),
        assets: useAssetStore((state) => state.assets),
        creativeProjects: useCreativeProjectStore((state) => state.projects),
        ensureProjectFolder: useAssetStore((state) => state.ensureProjectFolder),
        folders: useAssetStore((state) => state.folders),
        productionBibleItems: useProductionBibleStore((state) => state.items),
        projects: useCanvasStore((state) => state.projects),
        removeAsset: useAssetStore((state) => state.removeAsset),
        removeFolder: useAssetStore((state) => state.removeFolder),
        storyboardGroups: useStoryboardStore((state) => state.groups),
        storyboardShots: useStoryboardStore((state) => state.shots),
        token: useUserStore((state) => state.token),
        updateAsset: useAssetStore((state) => state.updateAsset),
        updateCanvasProject: useCanvasStore((state) => state.updateProject),
        updateFolder: useAssetStore((state) => state.updateFolder),
        updateProductionBibleItem: useProductionBibleStore((state) => state.updateItem),
        updateStoryboardShot: useStoryboardStore((state) => state.updateShot),
        volcengineAssetEnabled: useConfigStore((state) => state.publicSettings?.volcengineAsset?.enabled === true),
    };
}
