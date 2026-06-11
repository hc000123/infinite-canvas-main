import { useMemo } from "react";
import { App } from "antd";

import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { importAssetFile } from "../../../../../assets/asset-import-actions";
import { buildAssetVersionReference } from "../../../../../assets/asset-version-references";
import { useProductionBibleStore } from "../../../../../canvas/stores/use-production-bible-store";
import type { ScriptEpisode } from "../../../../../canvas/utils/script-management";
import type { StoryboardTableShot } from "../../../../../canvas/utils/storyboard-management";
import type { AgentWorkflowMappingPreview } from "../../../../agent-runner-types";
import { buildEpisodeExtractedAssets, productionBibleRoleForExtractedAsset, type EpisodeExtractedAsset } from "./episode-asset-extraction";

export function useEpisodeProductionAssets({
    appliedPreviewItemIds,
    episode,
    episodeTableShots,
    preview,
    projectId,
    projectTitle,
}: {
    appliedPreviewItemIds: string[];
    episode: ScriptEpisode;
    episodeTableShots: StoryboardTableShot[];
    preview?: AgentWorkflowMappingPreview;
    projectId: string;
    projectTitle: string;
}) {
    const { message } = App.useApp();
    const assetLibrary = useAssetStore((state) => state.assets);
    const addAssetOnce = useAssetStore((state) => state.addAssetOnce);
    const ensureProjectFolder = useAssetStore((state) => state.ensureProjectFolder);
    const productionBibleItems = useProductionBibleStore((state) => state.items);
    const updateProductionBibleItem = useProductionBibleStore((state) => state.updateItem);
    const assetRows = useMemo(
        () =>
            buildEpisodeExtractedAssets({
                appliedPreviewItemIds,
                assetLibrary,
                episode,
                episodeTableShots,
                preview,
                productionBibleItems,
                projectId,
            }),
        [appliedPreviewItemIds, assetLibrary, episode, episodeTableShots, preview, productionBibleItems, projectId],
    );

    const bindExtractedAsset = (row: EpisodeExtractedAsset, asset: Asset) => {
        if (!row.productionBibleItem) {
            message.warning("请先将资产清单写入设定库，再绑定项目资产库素材。");
            return;
        }
        if (row.productionBibleItem.assetRefs.some((ref) => ref.assetId === asset.id)) {
            message.info("当前素材已经绑定到这条资产。");
            return;
        }
        updateProductionBibleItem(row.productionBibleItem.id, {
            assetRefs: [
                ...row.productionBibleItem.assetRefs,
                {
                    assetId: asset.id,
                    assetVersion: buildAssetVersionReference(asset),
                    role: productionBibleRoleForExtractedAsset(row),
                },
            ],
        });
        message.success(`已绑定 ${asset.title}`);
    };

    const uploadExtractedAssetImage = async (row: EpisodeExtractedAsset, file: File) => {
        if (!file.type.startsWith("image/")) {
            message.warning("请上传图片文件。");
            return;
        }
        const folderId = ensureProjectFolder(projectId, projectTitle);
        const assetIds = await importAssetFile(file, { folderId, addAssetOnce });
        const uploaded = useAssetStore.getState().assets.find((asset) => assetIds.includes(asset.id) && asset.kind === "image");
        if (!uploaded) {
            message.warning("图片已导入素材库，但没有找到可绑定的图片素材。");
            return;
        }
        bindExtractedAsset(row, uploaded);
    };

    return { assetRows, bindExtractedAsset, uploadExtractedAssetImage };
}
