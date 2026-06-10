"use client";

import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";

import type { AssetBreakdownItem } from "../utils/asset-breakdown";
import { buildCanvasFallbackProductionPackages, buildCanvasProductionPackages, getNodeProductionPackageId, packageLabelById } from "../utils/canvas-production-packages";
import { activeEpisodeShotGroups, activeEpisodeTableShots, buildEpisodeWorkbenchStats, deriveEpisodeProductionStatus, productionStatusLabel } from "../utils/episode-workbench";
import type { StoryboardTableShot, ShotGroup } from "../utils/storyboard-management";
import type { CanvasProject } from "../stores/use-canvas-store";
import type { CreativeProject } from "../../projects/creative-projects";
import type { CanvasConnection, CanvasNodeData } from "../types";

type UseCanvasProductionWorkbenchStateOptions = {
    canvasId: string;
    currentProject?: CanvasProject | null;
    creativeProject?: CreativeProject | null;
    storyboardTableShots: StoryboardTableShot[];
    storyboardShotGroups: ShotGroup[];
    assetBreakdownItems: AssetBreakdownItem[];
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedInspectorNode: CanvasNodeData | null;
    activeNodeId: string | null;
    activeTimelineShotId: string;
    activeProductionPackageId: string;
    setActiveProductionPackageId: Dispatch<SetStateAction<string>>;
};

export function useCanvasProductionWorkbenchState({
    canvasId,
    currentProject,
    creativeProject,
    storyboardTableShots,
    storyboardShotGroups,
    assetBreakdownItems,
    nodes,
    connections,
    selectedInspectorNode,
    activeNodeId,
    activeTimelineShotId,
    activeProductionPackageId,
    setActiveProductionPackageId,
}: UseCanvasProductionWorkbenchStateOptions) {
    const episodeWorkbenchStats = useMemo(
        () => buildEpisodeWorkbenchStats({ canvas: currentProject, tableShots: storyboardTableShots, shotGroups: storyboardShotGroups, assetBreakdownItems, nodes }),
        [assetBreakdownItems, currentProject, nodes, storyboardShotGroups, storyboardTableShots],
    );
    const episodeProductionLabel = productionStatusLabel(deriveEpisodeProductionStatus(episodeWorkbenchStats));
    const timelineShots = useMemo(() => activeEpisodeTableShots(storyboardTableShots, currentProject), [currentProject, storyboardTableShots]);
    const timelineShotGroups = useMemo(() => activeEpisodeShotGroups(storyboardShotGroups, currentProject), [currentProject, storyboardShotGroups]);
    const activeTimelineShot = activeTimelineShotId ? timelineShots.find((shot) => shot.id === activeTimelineShotId) || null : null;
    const activeTimelineShotGroups = useMemo(() => (activeTimelineShotId ? timelineShotGroups.filter((group) => group.shotIds.includes(activeTimelineShotId)) : []), [activeTimelineShotId, timelineShotGroups]);
    const activeTimelineNodeIds = useMemo(() => {
        if (!activeTimelineShotId) return new Set<string>();
        const groupIds = new Set(activeTimelineShotGroups.map((group) => group.id));
        return new Set(
            nodes
                .filter((node) => {
                    const metadata = node.metadata;
                    return Boolean(
                        metadata?.storyboardTableShotIds?.includes(activeTimelineShotId) ||
                        metadata?.storyboardShotId === activeTimelineShotId ||
                        (metadata?.shotGroupId && groupIds.has(metadata.shotGroupId)) ||
                        (metadata?.storyboardShotGroupId && groupIds.has(metadata.storyboardShotGroupId)),
                    );
                })
                .map((node) => node.id),
        );
    }, [activeTimelineShotGroups, activeTimelineShotId, nodes]);
    const activeTimelineNodes = useMemo(() => nodes.filter((node) => activeTimelineNodeIds.has(node.id)), [activeTimelineNodeIds, nodes]);
    const fallbackProductionPackages = useMemo(
        () => buildCanvasFallbackProductionPackages(canvasId, currentProject?.episodeTitle || creativeProject?.title || currentProject?.title || "项目画布"),
        [canvasId, creativeProject?.title, currentProject?.episodeTitle, currentProject?.title],
    );
    const productionPackages = useMemo(
        () => buildCanvasProductionPackages({ shotGroups: timelineShotGroups, tableShots: timelineShots, nodes, fallbackPackages: fallbackProductionPackages }),
        [fallbackProductionPackages, nodes, timelineShotGroups, timelineShots],
    );
    const productionPackageLabelMap = useMemo(() => packageLabelById(productionPackages), [productionPackages]);
    const selectedNodeProductionPackageId = selectedInspectorNode ? getNodeProductionPackageId(selectedInspectorNode) : "";
    const inspectorProductionPackage = useMemo(() => {
        const packageId = selectedNodeProductionPackageId || (selectedInspectorNode ? "" : activeProductionPackageId);
        return packageId ? productionPackages.find((item) => item.id === packageId) || null : null;
    }, [activeProductionPackageId, productionPackages, selectedInspectorNode, selectedNodeProductionPackageId]);
    const activeProductionPackage = useMemo(() => (activeProductionPackageId ? productionPackages.find((item) => item.id === activeProductionPackageId) || null : null), [activeProductionPackageId, productionPackages]);
    const activeProductionPackageNodeIds = useMemo(() => new Set(activeProductionPackage?.nodeIds || []), [activeProductionPackage]);
    const relatedHighlight = useMemo(() => {
        const nodeIds = new Set<string>();
        const connectionIds = new Set<string>();
        const baseNodeIds = new Set<string>();

        if (activeNodeId) baseNodeIds.add(activeNodeId);
        activeTimelineNodeIds.forEach((nodeId) => baseNodeIds.add(nodeId));
        activeProductionPackageNodeIds.forEach((nodeId) => baseNodeIds.add(nodeId));
        baseNodeIds.forEach((nodeId) => nodeIds.add(nodeId));
        if (!baseNodeIds.size) return { nodeIds, connectionIds };

        connections.forEach((connection) => {
            if (!baseNodeIds.has(connection.fromNodeId) && !baseNodeIds.has(connection.toNodeId)) return;
            connectionIds.add(connection.id);
            nodeIds.add(connection.fromNodeId);
            nodeIds.add(connection.toNodeId);
        });

        return { nodeIds, connectionIds };
    }, [activeNodeId, activeProductionPackageNodeIds, activeTimelineNodeIds, connections]);

    useEffect(() => {
        if (!productionPackages.length) {
            if (activeProductionPackageId) setActiveProductionPackageId("");
            return;
        }
        if (!activeProductionPackageId || !productionPackages.some((item) => item.id === activeProductionPackageId)) {
            setActiveProductionPackageId(productionPackages[0].id);
        }
    }, [activeProductionPackageId, productionPackages, setActiveProductionPackageId]);

    return {
        episodeWorkbenchStats,
        episodeProductionLabel,
        timelineShots,
        timelineShotGroups,
        activeTimelineShot,
        activeTimelineShotGroups,
        activeTimelineNodeIds,
        activeTimelineNodes,
        fallbackProductionPackages,
        productionPackages,
        productionPackageLabelMap,
        activeProductionPackage,
        activeProductionPackageNodeIds,
        inspectorProductionPackage,
        relatedHighlight,
    };
}
