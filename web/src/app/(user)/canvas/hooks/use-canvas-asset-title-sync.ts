"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";

import type { CanvasNodeData } from "../types";
import { syncCanvasNodeAssetTitles } from "../utils/canvas-asset-reference";

export function useCanvasAssetTitleSync({ assetTitleById, nodes, setNodes }: { assetTitleById: ReadonlyMap<string, string>; nodes: CanvasNodeData[]; setNodes: Dispatch<SetStateAction<CanvasNodeData[]>> }) {
    useEffect(() => {
        setNodes((current) => syncCanvasNodeAssetTitles(current, assetTitleById));
    }, [assetTitleById, nodes, setNodes]);
}
