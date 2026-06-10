import { workflowMappingPreviewItemKey } from "../../../../agent-runner-workflow-apply-common";
import type { AgentWorkflowMappingPreview, AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "../../../../agent-runner-types";
import { summarizeWorkflowStageDisplayState } from "../../../../agent-runner-workflow-display";
import type { EpisodeModuleConfig, EpisodeModuleRow } from "./components/episode-module-panel";
import { latestPreview, listSafeText, mappedFieldText, previewCounts, productionBibleKindLabel, referenceCount } from "./episode-workbench-display";

export function buildAssetsModuleConfig(input: {
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onApproveStageReview: (stageId: string, note: string) => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onRunStage: (stageId: string) => void;
    previews: AgentWorkflowMappingPreview[];
    runningStageIds: Record<string, boolean>;
    stageOutputs: Record<string, AgentWorkflowStageOutput | undefined>;
    workflowRun?: AgentWorkflowRunRecord;
}): EpisodeModuleConfig {
    const preview = latestPreview(input.previews, "production_bible");
    const counts = preview ? previewCounts(preview, input.appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };
    const display = input.workflowRun ? summarizeWorkflowStageDisplayState(input.workflowRun, "art-design", []) : undefined;
    const needsReview = display?.displayStatus === "review";
    const rows: EpisodeModuleRow[] = preview?.items.length
        ? preview.items.map((item, index): EpisodeModuleRow => {
              const applied = input.appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId));
              const kind = productionBibleKindLabel(item.mappedFields.kind);
              const fullDescription = mappedFieldText(item.mappedFields.description) || item.sourceText || item.reason;
              const description = listSafeText(fullDescription, "待确认资产简述。");
              const status = applied ? "已完成" : item.action === "skip" ? "待确认" : item.warnings.length ? "缺素材" : "待确认";
              return {
                  actionLabel: "查看",
                  cells: [kind, item.title, description, `${referenceCount(item.mappedFields)} 图`],
                  detail: {
                      body: [fullDescription, item.mappedFields.promptSnippets ? `\n提示词片段：\n${mappedFieldText(item.mappedFields.promptSnippets)}` : "", item.warnings.length ? `\n提示：${item.warnings.join("；")}` : ""].filter(Boolean).join("\n"),
                      meta: [
                          { label: "类型", value: kind },
                          { label: "引用", value: `${referenceCount(item.mappedFields)} 图` },
                          { label: "状态", value: status },
                      ],
                      subtitle: item.reason,
                      title: item.title,
                  },
                  highlight: status === "缺素材" || index === 0,
                  id: item.itemId,
                  status,
                  tone: applied ? "green" : status === "缺素材" ? "amber" : "cyan",
              };
          })
        : assetPlaceholderRows();
    return {
        actions: [
            ...(needsReview
                ? [
                      {
                          label: "批准资产清单",
                          onClick: () => input.onApproveStageReview("art-design", "资产清单已确认。"),
                          primary: true,
                      },
                  ]
                : []),
            {
                label: input.stageOutputs["art-design"] ? "生成资产清单" : "运行资产分析",
                loading: Boolean(input.runningStageIds["art-design"]),
                onClick: () => (input.stageOutputs["art-design"] ? input.onGeneratePreview("art-design", "设定库预览") : input.onRunStage("art-design")),
                primary: !needsReview,
            },
            {
                disabled: !preview || counts.pending <= 0,
                label: "写入设定库",
                loading: Boolean(preview && input.applyingPreviewIds[preview.previewId]),
                onClick: () => preview && input.onApplyPreview(preview),
            },
        ],
        columns: "90px 140px minmax(260px,1fr) 80px 90px 80px",
        emptyText: "暂无资产与生图记录",
        filters: ["全部", "已完成", "待确认", "缺素材", "待生成"],
        headers: ["类型", "资产", "简述", "引用", "状态", "操作"],
        rows,
        subtitle: "从剧本和导演分析中提取角色、场景、道具、服装等资产；只展示清单，完整描述进入详情。",
        summary: [
            { label: "资产项", tone: preview ? "cyan" : "slate", value: String(counts.total || rows.length) },
            { label: "已写入", tone: counts.applied ? "green" : "slate", value: String(counts.applied) },
            { label: "待写入", tone: counts.pending ? "amber" : "slate", value: String(counts.pending) },
            { label: "缺口", tone: rows.some((row) => row.status === "缺素材") ? "amber" : "green", value: String(rows.filter((row) => row.status === "缺素材").length) },
        ],
        title: "资产与生图模块",
    };
}

function assetPlaceholderRows(): EpisodeModuleRow[] {
    return [
        ["角色", "主要角色", "待从导演分析和美术设计中提取角色设定。"],
        ["场景", "关键场景", "待提取场景氛围、空间结构和参考素材。"],
        ["道具", "互动道具", "待确认剧情关键道具和连续性要求。"],
        ["服装", "服化道", "待提取服装、妆发和风格约束。"],
    ].map(([kind, title, description], index) => ({
        actionLabel: "查看",
        cells: [kind, title, description, "0 图"],
        detail: { body: description, meta: [{ label: "类型", value: kind }], title },
        highlight: index === 0,
        id: `asset-placeholder-${kind}`,
        status: "待生成",
        tone: "amber",
    }));
}
