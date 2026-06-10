import type { AgentProposedAction, AgentRiskLevel, AgentTaskKind } from "./agent-workbench-types";

export function agentKindLabel(kind: AgentTaskKind) {
    if (kind === "asset_manager") return "资产管理员";
    if (kind === "prompt_engineer") return "提示词工程";
    return "分镜导演";
}

export function agentRiskLabel(risk: AgentRiskLevel) {
    if (risk === "high") return "高风险";
    if (risk === "medium") return "中风险";
    return "低风险";
}

export function agentActionLabel(action: AgentProposedAction) {
    if (action.type === "asset.add_tags") return `给素材补标签：${action.tags.join("、")}`;
    if (action.type === "storyboard.update_shot_prompt") return "补全分镜提示词";
    return `创建 ${action.shots.length} 条分镜草案`;
}
