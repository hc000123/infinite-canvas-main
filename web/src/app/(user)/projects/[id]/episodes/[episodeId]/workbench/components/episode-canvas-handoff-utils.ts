import type { CanvasProject } from "../../../../../../canvas/stores/use-canvas-store";
import type { EpisodeStatusTone } from "./episode-module-panel";

export type CanvasHandoffStatus = "未导入" | "待导入" | "已导入" | "缺资产" | "已进入画布" | "已生成" | "已回流";
export type CanvasHandoffFilter = "全部" | CanvasHandoffStatus;

type CanvasHandoffShot = {
    id: string;
};

type CanvasHandoffPackage = {
    assetLabels: string[];
    duration: number;
    id: string;
    order: number;
    shots: CanvasHandoffShot[];
    status: string;
    summary: string;
    title: string;
};

export type CanvasHandoffImportTarget = {
    id: string;
    order: number;
    title: string;
};

export type CanvasHandoffStorySegment = {
    order: number;
    packages: CanvasHandoffPackage[];
    title: string;
};

export type CanvasHandoffPackageRow = {
    assetState: string;
    canImport: boolean;
    importedNodeCount: number;
    pkg: CanvasHandoffPackage;
    segment: CanvasHandoffStorySegment;
    status: CanvasHandoffStatus;
    tone: EpisodeStatusTone;
};

export function buildCanvasHandoffRows({ boundCanvas, segments }: { boundCanvas?: CanvasProject; segments: CanvasHandoffStorySegment[] }): CanvasHandoffPackageRow[] {
    return segments.flatMap((segment) =>
        segment.packages.map((pkg) => {
            const assetMissing = pkg.status === "缺资产" || !pkg.assetLabels.length;
            const confirmed = pkg.status === "已确认" || pkg.status === "待承接";
            const importedNodeCount = countImportedCanvasPackageNodes(boundCanvas, pkg.order);
            let status: CanvasHandoffStatus = "未导入";
            if (assetMissing) status = "缺资产";
            else if (importedNodeCount) status = "已导入";
            else if (confirmed) status = "待导入";
            return {
                assetState: assetMissing ? "缺 1" : `${pkg.assetLabels.length} 项已绑定`,
                canImport: Boolean(boundCanvas) && status === "待导入",
                importedNodeCount,
                pkg,
                segment,
                status,
                tone: canvasHandoffTone(status),
            };
        }),
    );
}

export function summarizeCanvasHandoffRows(rows: CanvasHandoffPackageRow[], boundCanvas?: CanvasProject) {
    return {
        canvasCount: boundCanvas ? 1 : 0,
        confirmed: rows.filter((row) => row.pkg.status === "已确认" || row.pkg.status === "待承接").length,
        imported: rows.filter((row) => ["已导入", "已进入画布", "已生成", "已回流"].includes(row.status)).length,
        missingAssets: rows.filter((row) => row.status === "缺资产").length,
        pending: rows.filter((row) => row.status === "待导入").length,
    };
}

export function filterCanvasHandoffRow(row: CanvasHandoffPackageRow, filter: CanvasHandoffFilter) {
    if (filter === "全部") return true;
    return row.status === filter;
}

export function padEpisodeOrder(order: number) {
    return String(order).padStart(2, "0");
}

function countImportedCanvasPackageNodes(boundCanvas: CanvasProject | undefined, packageOrder: number) {
    if (!boundCanvas) return 0;
    const previewItemId = `video_node-${packageOrder}`;
    return boundCanvas.nodes.filter((node) => node.metadata?.workflowSource?.previewItemId === previewItemId).length;
}

function canvasHandoffTone(status: CanvasHandoffStatus): EpisodeStatusTone {
    if (status === "已回流" || status === "已生成" || status === "已进入画布" || status === "已导入") return "green";
    if (status === "待导入") return "cyan";
    if (status === "缺资产") return "amber";
    return "slate";
}
