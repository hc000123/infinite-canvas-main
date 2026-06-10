import type { Asset } from "@/stores/use-asset-store";

import type { ProductionBibleItem } from "../../../../../../canvas/utils/production-bible";
import type { EpisodeStatusTone } from "./episode-module-panel";

export type EpisodeAssetProcessMode = "bind" | "generate";
export type EpisodeAssetFilter = "全部" | "缺素材" | "已绑定" | "待生成" | "角色" | "场景" | "道具" | "服装";
export type EpisodeStageActionHint = { blocked?: boolean; text: string; tone: EpisodeStatusTone };
export type OpenImageWorkbenchPayload = { assetId?: string; briefId?: string; prompt: string; title?: string };

export type EpisodeAssetRow = {
    canGenerate: boolean;
    candidates: Asset[];
    description: string;
    episodeLabel: string;
    id: string;
    libraryMatchCount: number;
    name: string;
    productionBibleItem?: ProductionBibleItem;
    promptDraft: string;
    referencedShotLabels: string[];
    sourceReason: string;
    status: "已绑定" | "待绑定" | "待生成" | "待确认" | "缺素材";
    tone: EpisodeStatusTone;
    type: "角色" | "场景" | "道具" | "服装";
};
