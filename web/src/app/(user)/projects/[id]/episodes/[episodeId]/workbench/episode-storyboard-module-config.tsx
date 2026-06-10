import type { StoryboardTableShot } from "../../../../../canvas/utils/storyboard-management";
import { workflowMappingPreviewItemKey } from "../../../../agent-runner-workflow-apply-common";
import type { AgentWorkflowMappingPreview, AgentWorkflowRunRecord, AgentWorkflowSceneRunState } from "../../../../agent-runner-types";
import { summarizeWorkflowStageDisplayState } from "../../../../agent-runner-workflow-display";
import { EpisodeProgress, type EpisodeModuleConfig, type EpisodeModuleRow } from "./components/episode-module-panel";
import { episodeToneFromWorkflow, latestPreview, listSafeText, padEpisodeOrder, previewCounts, sceneSourceLabel, workflowDisplayText } from "./episode-workbench-display";
import type { EpisodeSceneOption } from "./use-episode-workbench-state";

export function buildStoryboardModuleConfig(input: {
    appliedPreviewItemIds: string[];
    currentScene?: EpisodeSceneOption;
    currentSceneState?: AgentWorkflowSceneRunState;
    episodeTableShots: StoryboardTableShot[];
    onApplyPreview: (preview: AgentWorkflowMappingPreview) => void;
    onGeneratePreview: (stageId: string, targetLabel: string) => void;
    onRunStoryboardScene: () => void;
    previews: AgentWorkflowMappingPreview[];
    sceneOptions: EpisodeSceneOption[];
    workflowRun?: AgentWorkflowRunRecord;
}): EpisodeModuleConfig {
    const preview = latestPreview(input.previews, "storyboard_table");
    const counts = preview ? previewCounts(preview, input.appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };
    const rows = input.episodeTableShots.length
        ? input.episodeTableShots.map((shot): EpisodeModuleRow => {
              const refCount = (shot.assetRefs?.length || 0) + (shot.productionBibleRefs?.length || 0);
              return {
                  actionLabel: "查看",
                  cells: [
                      <div key="shot">
                          <div className="font-semibold text-slate-100">P{padEpisodeOrder(shot.order)}</div>
                          <div className="text-xs text-slate-500">{shot.sceneName}</div>
                      </div>,
                      <div key="content">
                          <div className="font-medium text-slate-100">{shot.title}</div>
                          <div className="mt-1 text-slate-400">{listSafeText(shot.visualDescription || shot.scriptText, "待补充镜头内容")}</div>
                      </div>,
                      shot.workflowSource ? "已生成" : shot.visualDescription ? "草案" : "待生成",
                      `${refCount} 项`,
                      "待承接",
                      <EpisodeProgress key="progress" label="62%" value={62} />,
                  ],
                  detail: {
                      body: [
                          `场次：${shot.sceneName}`,
                          `标题：${shot.title}`,
                          `剧本：${shot.scriptText || "未填写"}`,
                          `分镜描述：${shot.visualDescription || "未填写"}`,
                          `对白：${shot.dialogue || "未填写"}`,
                          `动作：${shot.action || "未填写"}`,
                          `情绪：${shot.emotion || "未填写"}`,
                          `镜头：${shot.shotSize || "未填写"} / ${shot.cameraMovement || "未填写"}`,
                          `参考素材：${refCount} 项`,
                      ].join("\n"),
                      meta: [
                          { label: "镜头编号", value: `P${padEpisodeOrder(shot.order)}` },
                          { label: "参考素材", value: `${refCount} 项` },
                      ],
                      title: shot.title,
                  },
                  highlight: !shot.workflowSource,
                  id: shot.id,
                  status: shot.workflowSource ? "待生成" : "待确认",
                  tone: shot.workflowSource ? "cyan" : "amber",
              };
          })
        : storyboardPlaceholderRows(input.sceneOptions, input.currentScene?.sceneKey);
    const display = input.workflowRun
        ? summarizeWorkflowStageDisplayState(
              input.workflowRun,
              "seedance-storyboard",
              input.sceneOptions.map((scene) => scene.sceneKey),
          )
        : undefined;
    return {
        actions: [
            {
                disabled: !input.currentScene,
                label: input.currentSceneState?.status === "review" ? "重新跑当前场次" : "运行当前场次",
                loading: input.currentSceneState?.status === "running",
                onClick: input.onRunStoryboardScene,
                primary: true,
            },
            { label: "生成分镜预览", onClick: () => input.onGeneratePreview("seedance-storyboard", "分镜表预览") },
            { disabled: !preview || counts.pending <= 0, label: "写入分镜表", onClick: () => preview && input.onApplyPreview(preview) },
        ],
        columns: "80px minmax(260px,1fr) 90px 90px 90px 120px 90px 80px",
        emptyText: "暂无分镜记录",
        filters: ["全部", "已完成", "待确认", "待生成", "缺素材"],
        headers: ["镜头", "内容", "提示词", "参考素材", "视频", "完成度", "状态", "操作"],
        rows,
        subtitle: "镜头长表只展示编号、内容摘要、提示词状态、参考素材、视频状态和完成度；镜头正文进入详情查看。",
        summary: [
            { label: "阶段状态", tone: episodeToneFromWorkflow(display, "cyan"), value: workflowDisplayText(display) },
            { label: "镜头", tone: input.episodeTableShots.length ? "cyan" : "slate", value: String(input.episodeTableShots.length) },
            { label: "预览待写入", tone: counts.pending ? "amber" : "slate", value: String(counts.pending) },
            { label: "当前场次", tone: input.currentScene ? "cyan" : "slate", value: input.currentScene ? input.currentScene.sceneLabel : "未选择" },
        ],
        title: "分镜模块",
    };
}

function storyboardPlaceholderRows(scenes: EpisodeSceneOption[], currentSceneKey?: string): EpisodeModuleRow[] {
    const source = scenes.length ? scenes : [{ sceneKey: "empty", sceneLabel: "暂无场次", scriptText: "请先导入剧本或生成分镜。", source: "script_text" as const }];
    return source.map((scene) => ({
        actionLabel: "查看",
        cells: [scene.sceneLabel, scene.scriptText ? "待生成分镜，点击查看场次文本。" : "暂无场次文本", "待生成", "0 项", "待生成", <EpisodeProgress key="progress" label="0%" value={0} />],
        detail: { body: scene.scriptText || "暂无场次文本", subtitle: sceneSourceLabel(scene.source), title: scene.sceneLabel },
        highlight: scene.sceneKey === currentSceneKey,
        id: scene.sceneKey,
        status: "待生成",
        tone: "amber",
    }));
}
