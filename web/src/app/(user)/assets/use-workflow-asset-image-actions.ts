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
        router.push(buildAssetWorkbenchHref(asset, info));
    };

    return { generateWorkflowAssetImage, generatingWorkflowAssetId: null };
}

export function buildAssetWorkbenchHref(asset: Asset, info: ReturnType<typeof workflowAssetInfo>, returnTo?: string) {
    const params = new URLSearchParams();
    const subjectId = asset.assetBinding?.subjectId;
    const variantId = asset.assetBinding?.variantId;
    const projectId = info?.sourceProjectId || info?.projectSlug;
    if (variantId) params.set("variantId", variantId);
    if (returnTo || typeof window !== "undefined") {
        params.set("returnTo", returnTo || `${window.location.pathname}${window.location.search}`);
        params.set("returnLabel", "返回资产");
    }
    if (subjectId) return `/assets/${encodeURIComponent(subjectId)}${params.size ? `?${params.toString()}` : ""}`;
    return projectId ? `/assets?projectId=${encodeURIComponent(projectId)}` : "/assets";
}
