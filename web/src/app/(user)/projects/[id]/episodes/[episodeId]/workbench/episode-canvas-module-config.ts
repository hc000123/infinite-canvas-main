import type { CanvasProject } from "../../../../../canvas/stores/use-canvas-store";
import type { StoryboardTableShot } from "../../../../../canvas/utils/storyboard-management";
import { workflowMappingPreviewItemKey } from "../../../../agent-runner-workflow-apply-common";
import type { AgentWorkflowMappingPreview } from "../../../../agent-runner-types";
import type { EpisodeModuleConfig, EpisodeModuleRow } from "./components/episode-module-panel";
import { generationConfigText, latestPreview, previewCounts } from "./episode-workbench-display";

export function buildCanvasModuleConfig(input: {
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    boundCanvas?: CanvasProject;
    episodeTableShots: StoryboardTableShot[];
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onOpenCanvas: () => void;
    previews: AgentWorkflowMappingPreview[];
}): EpisodeModuleConfig {
    const preview = latestPreview(input.previews, "video_node");
    const counts = preview ? previewCounts(preview, input.appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };
    const rows: EpisodeModuleRow[] = preview?.items.length
        ? preview.items.map((item): EpisodeModuleRow => {
              const applied = input.appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId));
              const configText = generationConfigText(item.mappedFields);
              return {
                  actionLabel: "查看",
                  cells: [item.title, applied ? "已承接到画布" : "待写入画布", configText, applied ? "待生成" : "待写入"],
                  detail: {
                      body: [item.sourceText, `\n生成配置：${configText}`, item.warnings.length ? `\n提示：${item.warnings.join("；")}` : ""].filter(Boolean).join("\n"),
                      meta: [
                          { label: "承接状态", value: applied ? "已承接" : "待写入" },
                          { label: "任务状态", value: applied ? "待生成" : "待写入" },
                      ],
                      subtitle: item.reason,
                      title: item.title,
                  },
                  highlight: !applied,
                  id: item.itemId,
                  status: applied ? "已完成" : "待生成",
                  tone: applied ? "green" : "cyan",
              };
          })
        : [
              {
                  actionLabel: input.boundCanvas ? "进入" : "创建",
                  cells: [
                      "承接画布",
                      input.boundCanvas ? input.boundCanvas.title : "未绑定画布",
                      input.boundCanvas ? `${input.boundCanvas.nodes.length} 节点` : "待创建",
                      input.episodeTableShots.length ? `${input.episodeTableShots.length} 镜头待承接` : "待分镜",
                  ],
                  detail: { body: input.boundCanvas ? `画布：${input.boundCanvas.title}\n节点：${input.boundCanvas.nodes.length}` : "当前集尚未绑定承接画布。", title: "承接画布" },
                  highlight: !input.boundCanvas,
                  id: "canvas-binding",
                  onAction: input.onOpenCanvas,
                  status: input.boundCanvas ? "已完成" : "待生成",
                  tone: input.boundCanvas ? "green" : "amber",
              },
          ];
    return {
        actions: [
            { label: input.boundCanvas ? "进入画布" : "创建承接画布", onClick: input.onOpenCanvas, primary: true },
            { label: "生成视频节点预览", onClick: () => input.onGeneratePreview("seedance-storyboard", "视频节点预览") },
            { disabled: !preview || counts.pending <= 0, label: "写入视频节点", loading: Boolean(preview && input.applyingPreviewIds[preview.previewId]), onClick: () => preview && input.onApplyPreview(preview) },
        ],
        columns: "140px minmax(220px,1fr) 160px 110px 90px 80px",
        emptyText: "暂无画布承接记录",
        filters: ["全部", "已完成", "待生成", "待确认"],
        headers: ["镜头组", "承接状态", "生成配置", "任务状态", "状态", "操作"],
        rows,
        subtitle: "展示可导入画布的镜头组、承接状态、生成配置和任务状态；生成仍需进入画布后人工触发。",
        summary: [
            { label: "画布", tone: input.boundCanvas ? "green" : "amber", value: input.boundCanvas ? "已绑定" : "未绑定" },
            { label: "视频节点", tone: counts.pending ? "cyan" : "slate", value: String(counts.total) },
            { label: "待写入", tone: counts.pending ? "amber" : "slate", value: String(counts.pending) },
            { label: "镜头", tone: input.episodeTableShots.length ? "cyan" : "slate", value: String(input.episodeTableShots.length) },
        ],
        title: "画布承接模块",
    };
}
