import type { AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "../../../../agent-runner-types";
import { summarizeWorkflowStageDisplayState } from "../../../../agent-runner-workflow-display";
import type { EpisodeDetailRecord, EpisodeModuleConfig, EpisodeModuleRow, EpisodeStatusTone } from "./components/episode-module-panel";
import { buildStageOutputDigest, findDigestSection, findOutputKeywordLine } from "./components/stage-output-digest";
import { episodeToneFromWorkflow, listSafeText, workflowDisplayText } from "./episode-workbench-display";
import type { DirectorReviewState } from "./episode-module-config";

export function buildDirectorModuleConfig(input: {
    directorReviewStates: Record<string, DirectorReviewState>;
    hasScript: boolean;
    onUpdateDirectorReviewState: (rowId: string, state: DirectorReviewState) => void;
    onRunStage: (stageId: string) => void;
    runningStageIds: Record<string, boolean>;
    stageOutputs: Record<string, AgentWorkflowStageOutput | undefined>;
    workflowRun?: AgentWorkflowRunRecord;
}): EpisodeModuleConfig {
    const output = input.stageOutputs["director-analysis"];
    const digest = output ? buildStageOutputDigest("director-analysis", output) : undefined;
    const display = input.workflowRun ? summarizeWorkflowStageDisplayState(input.workflowRun, "director-analysis", []) : undefined;
    const stageState = input.workflowRun?.stageStates.find((stage) => stage.stageId === "director-analysis");
    const errorMessage = display?.displayStatus === "error" ? stageState?.errorMessage : "";
    const status = output ? "已完成" : input.hasScript ? workflowDisplayText(display) : "待生成";
    const tone = episodeToneFromWorkflow(display, output ? "green" : input.hasScript ? "cyan" : "amber");
    const fullBody = output ? output.rawText : "尚未生成导演分析。";
    const directorApproved = display?.displayStatus === "approved";
    const riskConfirmed = directorApproved || input.directorReviewStates["director-risk"] === "confirmed";
    const storyboardAdopted = directorApproved || input.directorReviewStates["director-storyboard"] === "adopted";
    const riskSummary = buildDirectorRiskSummary(fullBody);
    const rows: EpisodeModuleRow[] = [
        directorRow("director-target", "本集目标", digest?.summary || "待确认本集叙事目标。", status, tone, fullBody, output ? undefined : () => input.onRunStage("director-analysis")),
        directorRow("director-rhythm", "情绪节奏", findDigestSection(digest, ["导演讲戏", "导演分析"]) || "待输出情绪节奏。", status, tone, fullBody, output ? undefined : () => input.onRunStage("director-analysis")),
        directorRow(
            "director-risk",
            "风险提示",
            output ? riskSummary : "待识别风险提示。",
            output ? (riskConfirmed ? "已确认" : "待确认") : status,
            output ? (riskConfirmed ? "green" : "amber") : tone,
            fullBody,
            output ? undefined : () => input.onRunStage("director-analysis"),
            Boolean(output && !riskConfirmed),
            output && !riskConfirmed ? "查看" : undefined,
            output && !riskConfirmed ? { label: "确认风险提示", onClick: () => input.onUpdateDirectorReviewState("director-risk", "confirmed"), primary: true } : undefined,
        ),
        directorRow(
            "director-storyboard",
            "分镜建议",
            findDigestSection(digest, ["场景清单", "场景", "导演讲戏"]) || "待形成分镜建议。",
            output ? (storyboardAdopted ? "已采用" : "待采用") : status,
            output ? (storyboardAdopted ? "green" : "cyan") : tone,
            fullBody,
            output && !storyboardAdopted ? () => input.onUpdateDirectorReviewState("director-storyboard", "adopted") : output ? undefined : () => input.onRunStage("director-analysis"),
            false,
            output && !storyboardAdopted ? "采用" : undefined,
        ),
    ];
    return {
        actions: [{ disabled: !input.hasScript, label: output ? "重新分析" : "运行分析", loading: Boolean(input.runningStageIds["director-analysis"]), onClick: () => input.onRunStage("director-analysis"), primary: true }],
        columns: "120px minmax(300px,1fr) 90px 90px 80px",
        emptyText: "暂无导演分析记录",
        filters: ["全部", "已完成", "已确认", "已采用", "待确认", "待采用", "待生成"],
        headers: ["项目", "分析内容", "来源", "状态", "操作"],
        rows,
        subtitle: errorMessage ? `上次运行失败：${errorMessage}。请检查 AI 配置、额度或网络后重新运行。` : "确认这一集的戏剧方向、情绪节奏、风险提示和分镜建议；完整分析进入详情抽屉查看。",
        summary: [
            { label: "阶段状态", tone, value: status },
            { label: "输出", value: output ? "1" : "0" },
            { label: "风险提示", tone: output ? (riskConfirmed ? "green" : "amber") : "slate", value: output ? (riskConfirmed ? "已确认" : "待确认") : "未生成" },
            { label: "操作", tone: display?.displayStatus === "error" ? "amber" : input.hasScript ? "cyan" : "amber", value: display?.displayStatus === "error" && input.hasScript ? "可重试" : input.hasScript ? "可运行" : "缺剧本" },
        ],
        title: "导演分析模块",
    };
}

function directorRow(id: string, label: string, content: string, status: string, tone: EpisodeStatusTone, body: string, onAction?: () => void, highlight?: boolean, actionLabel?: string, detailAction?: EpisodeDetailRecord["action"]): EpisodeModuleRow {
    return {
        actionLabel: actionLabel || (onAction ? "运行" : status === "待确认" ? "确认" : status === "待采用" ? "采用" : "查看"),
        cells: [label, content, "导演分析"],
        detail: { action: detailAction, body, subtitle: content, title: label },
        highlight,
        id,
        onAction,
        status,
        tone,
    };
}

function buildDirectorRiskSummary(text: string) {
    const keywordLine = findOutputKeywordLine(text, ["风险", "注意", "避免", "PASS", "合规", "安全", "审核"]);
    if (!keywordLine) return "已生成风险提示，点击查看完整导演分析后确认。";
    const normalized = keywordLine.replace(/\s+/g, " ").trim();
    if (/^PASS\b/i.test(normalized) || normalized.includes("PASS")) return `${normalized}。点击查看完整风险依据后确认。`;
    return listSafeText(normalized, "已生成风险提示，点击查看完整导演分析后确认。");
}
