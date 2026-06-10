"use client";

import type { Dispatch, SetStateAction } from "react";

import type { AssetPickerTab } from "../components/asset-picker-modal";
import type { CanvasInspectorView } from "../components/canvas-side-inspector";
import type { CanvasProductionPackageSummary } from "../utils/canvas-production-packages";

type Props = {
    focusProductionPackage: (productionPackage: CanvasProductionPackageSummary) => void;
    setAssetPickerOpen: Dispatch<SetStateAction<boolean>>;
    setAssetPickerTab: Dispatch<SetStateAction<AssetPickerTab>>;
    setAssistantCollapsed: Dispatch<SetStateAction<boolean>>;
    setAssistantMounted: Dispatch<SetStateAction<boolean>>;
    setInspectorView: Dispatch<SetStateAction<CanvasInspectorView>>;
    setIsInspectorCollapsed: Dispatch<SetStateAction<boolean>>;
};

export function useCanvasInspectorPanelActions({
    focusProductionPackage,
    setAssetPickerOpen,
    setAssetPickerTab,
    setAssistantCollapsed,
    setAssistantMounted,
    setInspectorView,
    setIsInspectorCollapsed,
}: Props) {
    const openMountedAssistant = () => {
        setAssistantMounted(true);
        setAssistantCollapsed(false);
    };

    return {
        collapseAssistant() {
            setAssistantMounted(false);
            setInspectorView("context");
        },
        expandAssistantPanel() {
            openMountedAssistant();
            setIsInspectorCollapsed(false);
            setInspectorView("assistant");
        },
        openAssetPicker() {
            setAssetPickerTab("my-assets");
            setAssetPickerOpen(true);
        },
        openAssistant() {
            openMountedAssistant();
        },
        selectProductionPackage(productionPackage: CanvasProductionPackageSummary) {
            focusProductionPackage(productionPackage);
            openMountedAssistant();
            setIsInspectorCollapsed(false);
            setInspectorView("context");
        },
    };
}
