"use client";

import type { Dispatch, SetStateAction } from "react";

import type { AssetPickerTab } from "../components/asset-picker-modal";

type Props = {
    setAssetPickerOpen: Dispatch<SetStateAction<boolean>>;
    setAssetPickerTab: Dispatch<SetStateAction<AssetPickerTab>>;
    setAssistantMounted: Dispatch<SetStateAction<boolean>>;
    setIsInspectorCollapsed: Dispatch<SetStateAction<boolean>>;
};

export function useCanvasInspectorPanelActions({ setAssetPickerOpen, setAssetPickerTab, setAssistantMounted, setIsInspectorCollapsed }: Props) {
    return {
        collapseAssistant() {
            setAssistantMounted(false);
            setIsInspectorCollapsed(true);
        },
        openAssetPicker() {
            setAssetPickerTab("my-assets");
            setAssetPickerOpen(true);
        },
        openAssistant() {
            setAssistantMounted(true);
            setIsInspectorCollapsed(false);
        },
    };
}
