import { agentSystemPromptContent, defaultAgentConfig, fillAgentPromptTemplate, type AgentConfig } from "../projects/agent-settings.ts";
import {
    SCRIPT_OPTIMIZER_PRODUCTION_RULES,
    SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES,
    SCRIPT_TO_AI_SCRIPT_WHITE_PAPER_RULES,
    parseScriptOptimizerResult,
    type ScriptOptimizerResult,
} from "../projects/script-optimizer-agent.ts";

export type OriginalWorkflowScriptOptimizerMessage = {
    role: "system" | "user";
    content: string;
};

export function buildOriginalWorkflowScriptOptimizerMessages(input: {
    agentConfig?: AgentConfig;
    episode: string;
    projectSlug: string;
    scriptSnapshot: string;
}): OriginalWorkflowScriptOptimizerMessage[] {
    const agentConfig = input.agentConfig || defaultAgentConfig("script_optimizer");
    const variables = {
        projectTitle: input.projectSlug || "视频工作流项目",
        episodeTitle: input.episode || "当前集",
        scriptSnapshot: input.scriptSnapshot,
        productionScriptRules: SCRIPT_OPTIMIZER_PRODUCTION_RULES,
        structuredScriptRules: SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES,
    };
    const v5HandoffRules =
        "原格式视频工作流交接要求：\n" +
        "1. 当前优化稿会直接保存为 script markdown，并作为 Seedance 原格式导演方法 v5 的 Stage 1 输入。\n" +
        "2. 只优化剧本母版，不生成 Stage 1 导演分析、Stage 2 资产提示词、Stage 3 Seedance 提示词或 Copy-only。\n" +
        "3. 输出必须利于 v5 后续读取：场次边界清楚、人物/地点/时间/内外景清楚、制作备注完整、禁止提前写分镜。\n" +
        "4. productionScript 每个场次结尾必须出现固定模板：制作备注：视觉方向：...；连续性：...；风险提示：...；禁止项：...。\n" +
        "5. 如果 productionScript 没有同时包含“制作备注、视觉方向、连续性、风险提示、禁止项”这五个词，视为失败输出，不能提交。";

    return [
        {
            role: "system",
            content: [agentSystemPromptContent(agentConfig), SCRIPT_TO_AI_SCRIPT_WHITE_PAPER_RULES, SCRIPT_OPTIMIZER_PRODUCTION_RULES, SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES, v5HandoffRules].join("\n\n"),
        },
        {
            role: "user",
            content: [fillAgentPromptTemplate(agentConfig.userPromptTemplate, variables), SCRIPT_TO_AI_SCRIPT_WHITE_PAPER_RULES, SCRIPT_OPTIMIZER_PRODUCTION_RULES, SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES, v5HandoffRules].join("\n\n"),
        },
    ];
}

export function parseOriginalWorkflowScriptOptimizerResult(text: string, episodeTitle: string): ScriptOptimizerResult {
    return parseScriptOptimizerResult(text, episodeTitle);
}
