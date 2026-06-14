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

function buildImageWorkbenchHref(asset: Asset, prompt: string, info: ReturnType<typeof workflowAssetInfo>) {
    const params = new URLSearchParams();
    params.set("source", "original-workflow");
    params.set("prompt", prompt);
    params.set("title", asset.title);
    params.set("libraryAssetId", asset.id);
    params.set("assetId", info?.assetId || asset.id);
    if (info?.projectSlug) {
        params.set("projectId", info.projectSlug);
        params.set("projectTitle", info.projectSlug);
    }
    const episode = normalizeWorkflowEpisode(info?.episode) || normalizeWorkflowEpisode(info?.assetId);
    if (episode) params.set("episodeId", episode);
    if (typeof window !== "undefined") {
        params.set("returnTo", `${window.location.pathname}${window.location.search}`);
        params.set("returnLabel", "返回我的素材");
    }
    return `/image?${params.toString()}`;
}

function normalizeWorkflowEpisode(value?: string) {
    const match = value?.match(/^ep\d+/i);
    return match?.[0].toLowerCase() || "";
}
