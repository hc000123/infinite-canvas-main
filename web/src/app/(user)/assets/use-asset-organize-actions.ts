"use client";

import { useState } from "react";
import { App } from "antd";

import type { Asset } from "@/stores/use-asset-store";
import type { AssetOrganizeValues } from "./components/asset-organize-modal";

export function useAssetOrganizeActions({ projectId, organizeAsset, createSubjectFromAsset }: { projectId: string; organizeAsset: (input: { assetId: string; subjectId: string; variantId: string; setCurrent?: boolean }) => void; createSubjectFromAsset: (input: { assetId: string; projectId: string; category: "character" | "scene" | "prop" | "blocking" | "other"; name: string }) => string }) {
    const { message } = App.useApp();
    const [organizingAsset, setOrganizingAsset] = useState<Asset | null>(null);
    const openOrganize = (asset: Asset) => {
        if (!projectId) return message.warning("请先选择资产所属项目");
        setOrganizingAsset(asset);
    };
    const submitOrganize = (values: AssetOrganizeValues) => {
        if (!organizingAsset || !projectId) return;
        try {
            if (values.mode === "existing") organizeAsset({ assetId: organizingAsset.id, subjectId: values.subjectId, variantId: values.variantId, setCurrent: values.setCurrent });
            else createSubjectFromAsset({ assetId: organizingAsset.id, projectId, category: values.category, name: values.name });
            message.success(values.mode === "new" ? "已创建主体并完成整理" : "已归入资产主体");
            setOrganizingAsset(null);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "整理失败，请稍后重试");
        }
    };
    return { organizingAsset, openOrganize, closeOrganize: () => setOrganizingAsset(null), submitOrganize };
}
