import type { CreativeProjectStatus } from "./creative-projects";

export type ProjectWorkstreamSource = {
    canvasCount: number;
    description: string;
    id: string;
    presetSummary: string;
    status: CreativeProjectStatus;
    title: string;
    updatedAt: string;
};

export type ProjectWorkstreamItem = ProjectWorkstreamSource & {
    actionLabel: "继续制作" | "查看项目";
    meta: string;
    statusLabel: "进行中" | "暂停中" | "草稿";
    summary: string;
};

export function buildProjectWorkstream(sources: ProjectWorkstreamSource[]): ProjectWorkstreamItem[] {
    return [...sources]
        .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .map((source) => ({
            ...source,
            actionLabel: source.status === "active" ? "继续制作" : "查看项目",
            meta: source.canvasCount ? `${source.canvasCount} 个画布` : "暂无画布",
            statusLabel: source.status === "archived" ? "暂停中" : source.canvasCount ? "进行中" : "草稿",
            summary: source.description.trim() || "尚未添加项目说明",
        }));
}
