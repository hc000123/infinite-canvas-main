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
        addWorkbenchImage: useAssetStore((state) => state.addWorkbenchImage),
        assets: useAssetStore((state) => state.assets),
        creativeProjects: useCreativeProjectStore((state) => state.projects),
        ensureProjectFolder: useAssetStore((state) => state.ensureProjectFolder),
        ensureSubject: useAssetStore((state) => state.ensureSubject),
        folders: useAssetStore((state) => state.folders),
        workbenchImages: useAssetStore((state) => state.workbenchImages),
        organizeAsset: useAssetStore((state) => state.organizeAsset),
        createSubjectFromAsset: useAssetStore((state) => state.createSubjectFromAsset),
        subjects: useAssetStore((state) => state.subjects),
        variants: useAssetStore((state) => state.variants),
        productionBibleItems: useProductionBibleStore((state) => state.items),
        projects: useCanvasStore((state) => state.projects),
        removeAsset: useAssetStore((state) => state.removeAsset),
        removeFolder: useAssetStore((state) => state.removeFolder),
        removeProductionBibleItem: useProductionBibleStore((state) => state.removeItem),
        shotGroups: useStoryboardStore((state) => state.shotGroups),
        storyboardGroups: useStoryboardStore((state) => state.groups),
        storyboardShots: useStoryboardStore((state) => state.shots),
        storyboardTableShots: useStoryboardStore((state) => state.tableShots),
        token: useUserStore((state) => state.token),
        updateAsset: useAssetStore((state) => state.updateAsset),
        updateSubject: useAssetStore((state) => state.updateSubject),
        updateCanvasProject: useCanvasStore((state) => state.updateProject),
        updateFolder: useAssetStore((state) => state.updateFolder),
        updateProductionBibleItem: useProductionBibleStore((state) => state.updateItem),
        updateShotGroup: useStoryboardStore((state) => state.updateShotGroup),
        updateStoryboardShot: useStoryboardStore((state) => state.updateShot),
        updateStoryboardTableShot: useStoryboardStore((state) => state.updateTableShot),
        volcengineAssetEnabled: useConfigStore((state) => state.publicSettings?.volcengineAsset?.enabled === true),
    };
}
