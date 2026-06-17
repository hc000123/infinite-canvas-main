import { requestImageQuestion, type ChatCompletionMessage } from "@/services/api/image";
import type { AiConfig } from "@/stores/use-config-store";
import { agentSystemPromptContent, canInvokeAgentConfig, fillAgentPromptTemplate, type AgentConfig } from "./agent-settings";
import {
    SCRIPT_OPTIMIZER_PRODUCTION_RULES,
    SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES,
    SCRIPT_TO_AI_SCRIPT_WHITE_PAPER_RULES,
    hasScriptOptimizerWhitePaperProductionNotes,
    isMeaningfullyOptimizedScript,
    parseScriptOptimizerResult,
    type ScriptOptimizerResult,
} from "./script-optimizer-agent";

export type ProjectScriptOptimizerRunInput = {
    agentConfig: AgentConfig;
    checkAiConfigReady: (config: AiConfig, model: string) => boolean;
    codexAgent?: {
        apiBaseUrl?: string;
        apiKey?: string;
        model?: string;
    };
    effectiveConfig: AiConfig;
    episodeTitle: string;
    executionMode?: "cloud-worker" | "local-runner";
    projectTitle: string;
    rootPath?: string;
    scriptSnapshot: string;
};

export type ProjectScriptOptimizerRunResult = ScriptOptimizerResult & {
    model: string;
    rawText: string;
};

export async function runProjectScriptOptimizer(input: ProjectScriptOptimizerRunInput): Promise<ProjectScriptOptimizerRunResult> {
    const callable = canInvokeAgentConfig(input.agentConfig);
    if (!callable.callable) throw new Error(callable.reason || "剧本优化 Agent 不可用。");
    const preferredModel = input.agentConfig.modelPreference.trim();
    const textModel = preferredModel && preferredModel !== "default" ? preferredModel : input.effectiveConfig.textModel || input.effectiveConfig.model;
    const messages = buildProjectScriptOptimizerMessages(input) as ChatCompletionMessage[];
    const answer = input.executionMode
        ? await runProjectScriptOptimizerByWorkflowMode({ codexAgent: input.codexAgent, executionMode: input.executionMode, messages, rootPath: input.rootPath, timeoutMs: input.agentConfig.timeoutSeconds * 1000 })
        : await runProjectScriptOptimizerByTextModel({ checkAiConfigReady: input.checkAiConfigReady, effectiveConfig: input.effectiveConfig, messages, textModel, timeoutMs: input.agentConfig.timeoutSeconds * 1000 });
    const result = parseScriptOptimizerResult(answer, input.episodeTitle);
    const optimized = result.productionScript.trim();
    if (!optimized) throw new Error("模型没有返回可用的优化稿。");
    if (!isMeaningfullyOptimizedScript(input.scriptSnapshot, optimized)) throw new Error("模型返回内容与原稿基本一致，未作为有效优化稿写入。请换更强的文本模型或调整剧本优化 Agent 后重试。");
    if (!hasScriptOptimizerWhitePaperProductionNotes(optimized)) throw new Error("模型返回稿缺少白皮书 v1.1 制作备注 / 质检标记，或仍残留讲台边缘、发言位置、危险跳台旧说法、首场消散旧说法，未写入剧本。");
    return { ...result, productionScript: optimized, model: textModel, rawText: answer };
}

async function runProjectScriptOptimizerByWorkflowMode(input: {
    codexAgent?: ProjectScriptOptimizerRunInput["codexAgent"];
    executionMode: "cloud-worker" | "local-runner";
    messages: ChatCompletionMessage[];
    rootPath?: string;
    timeoutMs: number;
}) {
    const response = await fetch("/api/original-workflow/script-optimizer", {
        body: JSON.stringify({
            agent: input.codexAgent,
            executionMode: input.executionMode,
            messages: input.messages,
            rootPath: input.rootPath,
            timeoutMs: input.timeoutMs,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
    });
    const payload = (await response.json().catch(() => undefined)) as { code?: number; data?: { error?: string; rawText?: string }; error?: string; msg?: string } | undefined;
    if (!response.ok || payload?.code) throw new Error(payload?.data?.error || payload?.error || payload?.msg || "剧本优化失败");
    const rawText = payload?.data?.rawText || "";
    if (!rawText.trim()) throw new Error("本地 Codex CLI 没有返回剧本优化结果。");
    return rawText;
}

async function runProjectScriptOptimizerByTextModel(input: { checkAiConfigReady: (config: AiConfig, model: string) => boolean; effectiveConfig: AiConfig; messages: ChatCompletionMessage[]; textModel: string; timeoutMs: number }) {
    if (!input.checkAiConfigReady(input.effectiveConfig, input.textModel)) throw new Error("请先配置可用的文本模型。");
    return requestImageQuestion({ ...input.effectiveConfig, model: input.textModel }, input.messages, undefined, { timeoutMs: input.timeoutMs });
}

export function buildProjectScriptOptimizerMessages(input: Pick<ProjectScriptOptimizerRunInput, "agentConfig" | "episodeTitle" | "projectTitle" | "scriptSnapshot">) {
    const variables = {
        projectTitle: input.projectTitle || "未命名项目",
        episodeTitle: input.episodeTitle || "当前集",
        scriptSnapshot: input.scriptSnapshot,
        productionScriptRules: SCRIPT_OPTIMIZER_PRODUCTION_RULES,
        structuredScriptRules: SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES,
    };
    const handoffRules =
        "项目入库交接要求：\n" +
        "1. 这是项目创建 / 分集导入阶段的剧本规范化，不是视频工作流 Stage 1。\n" +
        "2. 只输出 AI 剧本母版和 structuredScript，不生成导演分析、资产清单、分镜提示词或视频提示词。\n" +
        "3. productionScript 会作为后续导演分析、服化道和 Seedance 原格式流程的输入，必须让场次、人物、地点、时间、内外景和生产备注清楚可读。\n" +
        "4. productionScript 必须使用白皮书 v1.1 母版结构；如果原稿编号和当前导入集数不一致，必须同时写清原始场次和当前母版场次，不能互相覆盖。\n" +
        "5. 每个场次必须使用分行制作备注：视觉方向、连续性、风险提示、隐喻处理、画面生成禁止项、母版文档禁止项，并附【母版质检记录｜不进入视频生成提示】。\n" +
        "6. 正文不要反复写“动作视觉：”；坐站、台上台下、声音来源、隐喻实物化和真实机构标识风险必须在输出前自检。\n" +
        "7. 典礼场景统一使用发言台；危险下台动作改为从主席台侧边台阶快步下来；第 1 集首场消散写开始消散；全文不得残留讲台边缘、发言位置、危险跳台旧说法或带“再次”的旧消散说法。";
    return [
        {
            role: "system",
            content: [agentSystemPromptContent(input.agentConfig), SCRIPT_TO_AI_SCRIPT_WHITE_PAPER_RULES, SCRIPT_OPTIMIZER_PRODUCTION_RULES, SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES, handoffRules].join("\n\n"),
        },
        {
            role: "user",
            content: [fillAgentPromptTemplate(input.agentConfig.userPromptTemplate, variables), SCRIPT_TO_AI_SCRIPT_WHITE_PAPER_RULES, SCRIPT_OPTIMIZER_PRODUCTION_RULES, SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES, handoffRules].join("\n\n"),
        },
    ];
}
