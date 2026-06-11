import type { AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "../../../../agent-runner-types";
import { summarizeWorkflowStageDisplayState } from "../../../../agent-runner-workflow-display";
import type { EpisodeDetailRecord, EpisodeModuleConfig, EpisodeModuleRow, EpisodeStatusTone } from "./components/episode-module-panel";
import { buildStageOutputDigest, findDigestSection, findOutputKeywordLine } from "./components/stage-output-digest";
import { episodeToneFromWorkflow, listSafeText, workflowDisplayText } from "./episode-workbench-display";
import type { DirectorReviewState } from "./episode-module-config";

export function buildDirectorModuleConfig(input: {
    directorReviewStates: Record<string, DirectorReviewState>;
    hasScript: boolean;
    onCancelStage: (stageId: string) => void;
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
    const isRunning = Boolean(input.runningStageIds["director-analysis"]) || display?.displayStatus === "running";
    const pendingText = output && !riskConfirmed ? "导演分析已完成，但“风险提示”还待确认。确认后才能安心进入资产与生图。" : output && !storyboardAdopted ? "导演分析已完成，但“分镜建议”还未采用。采用后下一步会更明确。" : "";
    const riskSummary = buildDirectorRiskSummary(fullBody);
    const rows: EpisodeModuleRow[] = [
        directorRow("director-target", "本集目标", digest?.summary || "待确认本集叙事目标。", status, tone, fullBody, undefined),
        directorRow("director-rhythm", "情绪节奏", findDigestSection(digest, ["导演讲戏", "导演分析"]) || "待输出情绪节奏。", status, tone, fullBody, undefined),
        directorRow(
            "director-risk",
            "风险提示",
            output ? riskSummary : "待识别风险提示。",
            output ? (riskConfirmed ? "已确认" : "待确认") : status,
            output ? (riskConfirmed ? "green" : "amber") : tone,
            fullBody,
            undefined,
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
            output && !storyboardAdopted ? () => input.onUpdateDirectorReviewState("director-storyboard", "adopted") : undefined,
            false,
            output && !storyboardAdopted ? "采用" : undefined,
        ),
    ];
    return {
        actions: [
            isRunning
                ? { danger: true, disabled: false, label: "取消运行", onClick: () => input.onCancelStage("director-analysis") }
                : { disabled: !input.hasScript, label: output ? "重新分析" : "运行分析", onClick: () => input.onRunStage("director-analysis"), primary: true },
        ],
        columns: "120px minmax(300px,1fr) 90px 90px 80px",
        emptyText: "暂无导演讲戏记录",
        filters: ["全部", "已完成", "已确认", "已采用", "待确认", "待采用", "待生成"],
        headers: ["项目", "分析内容", "来源", "状态", "操作"],
        rows,
        notice: errorMessage
            ? { text: errorMessage, title: "导演分析运行失败", tone: "red" }
            : pendingText
              ? { actionLabel: !riskConfirmed ? "查看风险提示" : "采用分镜建议", onAction: !riskConfirmed ? undefined : () => input.onUpdateDirectorReviewState("director-storyboard", "adopted"), text: pendingText, title: "当前无法直接进入下一步", tone: "amber" }
              : isRunning
                ? { text: "正在生成导演分析。你可以等待结果，也可以取消后修改剧本重新发送。", title: "导演分析运行中", tone: "cyan" }
                : undefined,
        runningPreview: isRunning
            ? {
                  title: "导演讲戏 Agent 正在处理",
                  lines: ["正在阅读已确认剧本，提炼本集目标、人物关系和核心冲突。", "正在用导演视角讲清情绪节奏、爽点/反转点、表演与摄影处理。", "结果会先进入待确认状态，不会自动推进到扣费的图片或视频生成。"],
              }
            : undefined,
        subtitle: errorMessage ? `上次运行失败：${errorMessage}。请检查 AI 配置、额度或网络后重新运行。` : "像导演给服化道、摄影、美术和分镜讲戏一样，说明剧情重点、情绪节奏、表演方向和生成风险。",
        summary: [
            { label: "阶段状态", tone, value: status },
            { label: "输出", value: output ? "1" : "0" },
            { label: "风险提示", tone: output ? (riskConfirmed ? "green" : "amber") : "slate", value: output ? (riskConfirmed ? "已确认" : "待确认") : "未生成" },
            { label: "下一步", tone: pendingText ? "amber" : display?.displayStatus === "error" ? "amber" : input.hasScript ? "cyan" : "amber", value: pendingText ? "处理确认项" : display?.displayStatus === "error" && input.hasScript ? "可重试" : input.hasScript ? "查看结果" : "缺剧本" },
        ],
        title: "导演讲戏分析",
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
