"use client";

import { useRouter } from "next/navigation";

import type { Asset } from "@/stores/use-asset-store";
import { workflowAssetInfo, workflowAssetPrompt } from "./workflow-asset-image";

type MessageApi = {
    warning: (content: string) => unknown;
};

type Props = {
    message: MessageApi;
};

export function useWorkflowAssetImageActions({ message }: Props) {
    const router = useRouter();

    const generateWorkflowAssetImage = (asset: Asset) => {
        const prompt = workflowAssetPrompt(asset).trim();
        const info = workflowAssetInfo(asset);
        if (!prompt) {
            message.warning("这张卡片没有可用的生图提示词");
            return;
        }
        router.push(buildImageWorkbenchHref(asset, prompt, info));
    };

    return { generateWorkflowAssetImage, generatingWorkflowAssetId: null };
}

export function buildImageWorkbenchHref(asset: Asset, prompt: string, info: ReturnType<typeof workflowAssetInfo>, returnTo?: string) {
    const params = new URLSearchParams();
    params.set("source", "original-workflow");
    params.set("prompt", prompt);
    params.set("title", asset.title);
    params.set("libraryAssetId", asset.id);
    params.set("assetId", info?.assetId || asset.id);
    const projectId = info?.sourceProjectId || info?.projectSlug;
    if (projectId) {
        params.set("projectId", projectId);
        params.set("projectTitle", info?.projectSlug || projectId);
    }
    const episode = normalizeWorkflowEpisode(info?.episode) || normalizeWorkflowEpisode(info?.assetId);
    if (episode) params.set("episodeId", episode);
    if (returnTo || typeof window !== "undefined") {
        params.set("returnTo", returnTo || `${window.location.pathname}${window.location.search}`);
        params.set("returnLabel", "返回资产");
    }
    return `/image?${params.toString()}`;
}

function normalizeWorkflowEpisode(value?: string) {
    const match = value?.match(/^ep\d+/i);
    return match?.[0].toLowerCase() || "";
}
