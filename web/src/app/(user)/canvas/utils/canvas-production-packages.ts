import type { CanvasNodeData, CanvasNodeMetadata, CanvasProductionPackageRole } from "../types.ts";
import type { ShotGroup, StoryboardTableShot } from "./storyboard-management.ts";

export type CanvasProductionVideoVersion = {
    nodeId: string;
    versionId: string;
    versionNumber: number;
    label: string;
    createdAt: string;
    duration: string;
    status: string;
    note: string;
    isCurrent: boolean;
    hidden: boolean;
    assetId?: string;
    node: CanvasNodeData;
};

export type CanvasProductionPackageSummary = {
    id: string;
    label: string;
    title: string;
    sceneName: string;
    shotRangeLabel: string;
    duration: number;
    status: "pending" | "generating" | "generated" | "multi_version" | "missing_asset" | "adopted" | "error";
    statusLabel: string;
    nodeIds: string[];
    configNodeId?: string;
    versions: CanvasProductionVideoVersion[];
    currentVersion?: CanvasProductionVideoVersion;
    previousCurrentVersion?: CanvasProductionVideoVersion;
    tailFrame: {
        enabled: boolean;
        needsReview: boolean;
        sourceLabel: string;
    };
    shotIds: string[];
};

export function getNodeProductionPackageId(node?: CanvasNodeData | null) {
    const metadata = node?.metadata;
    return explicitNodeProductionPackageId(node) || fallbackNodeProductionPackageId(node);
}

export function getNodeProductionPackageRole(node: CanvasNodeData): CanvasProductionPackageRole {
    const role = node.metadata?.productionPackageRole;
    if (role) return role;
    if (node.type === "video") return "video_result";
    if (node.type === "config") return "video_config";
    const storyboardRole = node.metadata?.storyboardRole || "";
    if (storyboardRole === "prompt") return "prompt";
    if (storyboardRole === "video_config") return "video_config";
    if (storyboardRole === "reference" || node.metadata?.storyboardAssetRole) return "asset";
    return node.type === "text" ? "script" : "reference";
}

export function productionPackageRoleLabel(role: CanvasProductionPackageRole) {
    const labels: Record<CanvasProductionPackageRole, string> = {
        script: "原剧本",
        asset: "引用资产",
        prompt: "提示词",
        video_config: "视频配置",
        video_result: "视频结果",
        reference: "参考素材",
        manual: "手动节点",
    };
    return labels[role];
}

export function buildCanvasProductionPackages({ shotGroups, tableShots, nodes }: { shotGroups: ShotGroup[]; tableShots: StoryboardTableShot[]; nodes: CanvasNodeData[] }): CanvasProductionPackageSummary[] {
    const tableShotById = new Map(tableShots.map((shot) => [shot.id, shot]));
    const packageIds = new Set(shotGroups.map((group) => group.id));
    if (!shotGroups.length) tableShots.forEach((shot) => packageIds.add(shot.id));
    nodes.forEach((node) => {
        const packageId = explicitNodeProductionPackageId(node) || (!shotGroups.length ? fallbackNodeProductionPackageId(node) : "");
        if (packageId) packageIds.add(packageId);
    });

    const packages = Array.from(packageIds).map((id, index) => {
        const group = shotGroups.find((item) => item.id === id);
        const relatedNodes = nodes.filter((node) => nodeMatchesProductionPackage(node, id));
        const fallbackShot = tableShotById.get(id);
        const shots = group?.shotIds.map((shotId) => tableShotById.get(shotId)).filter((shot): shot is StoryboardTableShot => Boolean(shot)) || (fallbackShot ? [fallbackShot] : []);
        const label = group?.id ? productionPackageLabel(index) : fallbackPackageLabel(index, id);
        const versions = buildProductionVideoVersions(id, relatedNodes);
        const currentVersion = versions.find((version) => version.isCurrent);
        const configNode = relatedNodes.find((node) => node.type === "config");
        const title = group?.sceneName || shots[0]?.sceneName || configNode?.title || relatedNodes[0]?.title || "未命名生产包";
        const status = resolvePackageStatus(group, versions, shots);
        const shotOrders = shots.map((shot) => shot.order);
        return {
            id,
            label,
            title,
            sceneName: group?.sceneName || shots[0]?.sceneName || "未命名段落",
            shotRangeLabel: shotOrders.length ? `${Math.min(...shotOrders)}-${Math.max(...shotOrders)}` : "-",
            duration: group?.totalDuration || versions.reduce((total, version) => total + parseDurationNumber(version.duration), 0),
            status,
            statusLabel: packageStatusLabel(status, versions),
            nodeIds: relatedNodes.map((node) => node.id),
            configNodeId: configNode?.id,
            versions,
            currentVersion,
            tailFrame: { enabled: false, needsReview: false, sourceLabel: "" },
            shotIds: group?.shotIds || shots.map((shot) => shot.id),
        } satisfies CanvasProductionPackageSummary;
    });

    return packages.map((item, index) => {
        const previousCurrentVersion = packages[index - 1]?.currentVersion;
        const configNode = item.configNodeId ? nodes.find((node) => node.id === item.configNodeId) : undefined;
        const enabled = Boolean(configNode?.metadata?.usePreviousPackageTailFrame && previousCurrentVersion);
        const needsReview = Boolean(enabled && configNode?.metadata?.previousPackageVersionId && configNode.metadata.previousPackageVersionId !== previousCurrentVersion?.versionId);
        return {
            ...item,
            previousCurrentVersion,
            tailFrame: {
                enabled,
                needsReview,
                sourceLabel: previousCurrentVersion ? `${packages[index - 1].label} · ${previousCurrentVersion.label}` : "上一生产包暂无当前版本",
            },
        };
    });
}

export function packageLabelById(packages: CanvasProductionPackageSummary[]) {
    return new Map(packages.map((item) => [item.id, item.label]));
}

export function buildNextProductionVideoVersionMetadata(nodes: CanvasNodeData[], sourceNode: CanvasNodeData | undefined, createdAt: string): Partial<CanvasNodeMetadata> {
    const packageId = getNodeProductionPackageId(sourceNode);
    if (!packageId) return {};
    const versionNumber = nextVersionNumber(nodes, packageId);
    return {
        productionPackageId: packageId,
        productionPackageLabel: sourceNode?.metadata?.productionPackageLabel,
        productionPackageTitle: sourceNode?.metadata?.productionPackageTitle,
        productionPackageRole: "video_result",
        productionVideoVersionId: `${packageId}-v${versionNumber}-${Date.now()}`,
        productionVideoVersionNumber: versionNumber,
        productionVideoVersionCreatedAt: createdAt,
        productionVideoVersionHidden: false,
        isCurrentProductionVersion: true,
        usePreviousPackageTailFrame: sourceNode?.metadata?.usePreviousPackageTailFrame,
        previousPackageVersionId: sourceNode?.metadata?.previousPackageVersionId,
        previousPackageVersionNodeId: sourceNode?.metadata?.previousPackageVersionNodeId,
        previousPackageVersionLabel: sourceNode?.metadata?.previousPackageVersionLabel,
    };
}

export function markCurrentProductionVideoVersion(nodes: CanvasNodeData[], packageId: string, nodeId: string) {
    return nodes.map((node) => {
        if (getNodeProductionPackageId(node) !== packageId || node.type !== "video") return node;
        return {
            ...node,
            metadata: {
                ...node.metadata,
                isCurrentProductionVersion: node.id === nodeId,
                productionVideoVersionHidden: node.id === nodeId ? false : node.metadata?.productionVideoVersionHidden,
            },
        };
    });
}

export function hideProductionVideoVersion(nodes: CanvasNodeData[], nodeId: string) {
    const target = nodes.find((node) => node.id === nodeId);
    const packageId = getNodeProductionPackageId(target);
    const hidden = nodes.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, productionVideoVersionHidden: true, isCurrentProductionVersion: false } } : node));
    if (!packageId || !target?.metadata?.isCurrentProductionVersion) return hidden;
    const replacement = hidden.find((node) => node.id !== nodeId && node.type === "video" && getNodeProductionPackageId(node) === packageId && node.metadata?.status === "success" && !node.metadata?.productionVideoVersionHidden);
    return replacement ? markCurrentProductionVideoVersion(hidden, packageId, replacement.id) : hidden;
}

export function applyPreviousPackageTailFrame(nodes: CanvasNodeData[], packageId: string, previousVersion: CanvasProductionVideoVersion) {
    return nodes.map((node) =>
        getNodeProductionPackageId(node) === packageId && node.type === "config"
            ? {
                  ...node,
                  metadata: {
                      ...node.metadata,
                      usePreviousPackageTailFrame: true,
                      previousPackageVersionId: previousVersion.versionId,
                      previousPackageVersionNodeId: previousVersion.nodeId,
                      previousPackageVersionLabel: previousVersion.label,
                  },
              }
            : node,
    );
}

export function withProductionVersionAsCurrent(nodes: CanvasNodeData[], finalVideoNode: CanvasNodeData) {
    const packageId = getNodeProductionPackageId(finalVideoNode);
    const next = nodes.map((node) => (node.id === finalVideoNode.id ? finalVideoNode : node));
    return packageId ? markCurrentProductionVideoVersion(next, packageId, finalVideoNode.id) : next;
}

function buildProductionVideoVersions(packageId: string, nodes: CanvasNodeData[]): CanvasProductionVideoVersion[] {
    const videoNodes = nodes.filter((node) => node.type === "video" && nodeMatchesProductionPackage(node, packageId)).sort(compareVersionNodes);
    const visibleSuccessNodes = videoNodes.filter((node) => node.metadata?.status === "success" && !node.metadata?.productionVideoVersionHidden);
    const explicitCurrent = visibleSuccessNodes.find((node) => node.metadata?.isCurrentProductionVersion);
    const fallbackCurrentId = explicitCurrent?.id || visibleSuccessNodes.at(-1)?.id || "";
    return videoNodes.map((node, index) => {
        const versionNumber = node.metadata?.productionVideoVersionNumber || index + 1;
        const versionId = node.metadata?.productionVideoVersionId || `${packageId}-v${versionNumber}`;
        const hidden = Boolean(node.metadata?.productionVideoVersionHidden);
        return {
            nodeId: node.id,
            versionId,
            versionNumber,
            label: `v${versionNumber}`,
            createdAt: node.metadata?.productionVideoVersionCreatedAt || node.metadata?.localStoredAt || node.metadata?.finishedAt || node.metadata?.capturedFrameAt || "",
            duration: node.metadata?.duration || node.metadata?.seconds || "",
            status: nodeStatusLabel(node),
            note: node.metadata?.productionVideoVersionNote || node.metadata?.errorDetails || defaultVersionNote(node),
            isCurrent: !hidden && node.id === fallbackCurrentId,
            hidden,
            assetId: node.metadata?.sourceAssetId,
            node,
        };
    });
}

function nextVersionNumber(nodes: CanvasNodeData[], packageId: string) {
    return (
        nodes.reduce((max, node) => {
            if (node.type !== "video" || getNodeProductionPackageId(node) !== packageId) return max;
            return Math.max(max, node.metadata?.productionVideoVersionNumber || 0);
        }, 0) + 1
    );
}

function resolvePackageStatus(group: ShotGroup | undefined, versions: CanvasProductionVideoVersion[], shots: StoryboardTableShot[] = []): CanvasProductionPackageSummary["status"] {
    const visibleVersions = versions.filter((version) => !version.hidden);
    if (visibleVersions.some((version) => version.isCurrent)) return visibleVersions.length > 1 ? "multi_version" : "adopted";
    if (visibleVersions.length > 1) return "multi_version";
    if (visibleVersions.length) return "generated";
    if (group?.status === "generating") return "generating";
    if (group?.status === "error") return group.errorMessage?.includes("素材") ? "missing_asset" : "error";
    if (!group?.assetRefs.length && !group?.audioRefs.length && group?.status === "in_canvas") return "missing_asset";
    if (shots.length && shots.some((shot) => !shot.assetRefs.length && (shot.assetNeeds || []).length > 0)) return "missing_asset";
    return "pending";
}

function packageStatusLabel(status: CanvasProductionPackageSummary["status"], versions: CanvasProductionVideoVersion[]) {
    if (status === "adopted") return "已采用";
    if (status === "multi_version") {
        const current = versions.find((version) => version.isCurrent);
        return current ? `当前 ${current.label} / ${versions.filter((version) => !version.hidden).length}` : "有多版本";
    }
    if (status === "generated") return "已生成";
    if (status === "generating") return "生成中";
    if (status === "missing_asset") return "缺资产";
    if (status === "error") return "异常";
    return "待生成";
}

function nodeStatusLabel(node: CanvasNodeData) {
    if (node.metadata?.status === "loading") return "生成中";
    if (node.metadata?.status === "success") return "已完成";
    if (node.metadata?.status === "error") return "失败";
    return "待生成";
}

function defaultVersionNote(node: CanvasNodeData) {
    if (node.metadata?.status === "success") return "可用于导出、衔接和最终成片组装。";
    if (node.metadata?.status === "loading") return "生成任务进行中。";
    if (node.metadata?.status === "error") return "生成失败，需检查提示词、资产或配置。";
    return "等待生成。";
}

function compareVersionNodes(a: CanvasNodeData, b: CanvasNodeData) {
    const aVersion = a.metadata?.productionVideoVersionNumber || 0;
    const bVersion = b.metadata?.productionVideoVersionNumber || 0;
    if (aVersion !== bVersion) return aVersion - bVersion;
    return timestampOf(a) - timestampOf(b);
}

function timestampOf(node: CanvasNodeData) {
    const value = node.metadata?.productionVideoVersionCreatedAt || node.metadata?.localStoredAt || node.metadata?.finishedAt || "";
    return value ? new Date(value).getTime() || 0 : 0;
}

function explicitNodeProductionPackageId(node?: CanvasNodeData | null) {
    const metadata = node?.metadata;
    return metadata?.productionPackageId || metadata?.shotGroupId || metadata?.storyboardShotGroupId || "";
}

function fallbackNodeProductionPackageId(node?: CanvasNodeData | null) {
    const metadata = node?.metadata;
    if (!metadata) return "";
    if (metadata.storyboardShotId) return metadata.storyboardShotId;
    const tableShotIds = metadata.storyboardTableShotIds || [];
    return tableShotIds.length === 1 ? tableShotIds[0] : "";
}

function nodeMatchesProductionPackage(node: CanvasNodeData, packageId: string) {
    const explicitId = explicitNodeProductionPackageId(node);
    if (explicitId) return explicitId === packageId;
    const metadata = node.metadata;
    return Boolean(metadata?.storyboardShotId === packageId || metadata?.storyboardTableShotIds?.includes(packageId));
}

function productionPackageLabel(index: number) {
    return `P${String(index + 1).padStart(2, "0")}`;
}

function fallbackPackageLabel(index: number, id: string) {
    return productionPackageLabel(index) || id.slice(0, 4).toUpperCase();
}

function parseDurationNumber(value: string) {
    const matched = value.match(/[\d.]+/);
    return matched ? Number(matched[0]) || 0 : 0;
}
