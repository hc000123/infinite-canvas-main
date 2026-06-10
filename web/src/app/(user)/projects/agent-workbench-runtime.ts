import { agentSkillRegistry, defaultAgentSkill } from "./agent-workbench-skills";
import type { AgentRiskLevel, AgentSkill, AgentSkillApplyContext, AgentTask, AgentTaskKind, AgentTaskTargetRef, AgentWorkbenchInput } from "./agent-workbench-types";

export function skillsForAgentKind(kind: AgentTaskKind) {
    return agentSkillRegistry.filter((skill) => skill.agentKind === kind);
}

export function buildAgentTasksForKind(kind: AgentTaskKind, input: AgentWorkbenchInput) {
    return skillsForAgentKind(kind).map((skill) => buildAgentTaskFromSkill(skill, input));
}

export function buildAgentTaskFromSkill(skill: AgentSkill, input: AgentWorkbenchInput): AgentTask {
    const output = skill.run(input);
    return {
        id: input.idFactory(),
        projectId: input.projectId,
        kind: skill.agentKind,
        title: output.title,
        status: "pending",
        targetRefs: output.targetRefs,
        summary: output.summary,
        riskLevel: output.riskLevel || skill.riskLevel,
        proposedActions: output.proposedActions,
        skillId: skill.id,
        skillName: skill.name,
        skillVersion: skill.version,
        createdAt: input.now,
        updatedAt: input.now,
    };
}

export function applyAgentSkillTaskActions(task: AgentTask, context: AgentSkillApplyContext) {
    const skill = task.skillId ? agentSkillRegistry.find((item) => item.id === task.skillId) : undefined;
    (skill || defaultAgentSkill).apply(task, context);
}

export function buildAssetManagerTask(input: AgentWorkbenchInput): AgentTask {
    return combineAgentTasks("asset_manager", "资产管理员 Agent", buildAgentTasksForKind("asset_manager", input), input);
}

export function buildPromptEngineerTask(input: AgentWorkbenchInput): AgentTask {
    return buildAgentTaskFromSkill(agentSkillRegistry.find((skill) => skill.id === "prompt.storyboard_completion") || defaultAgentSkill, input);
}

export function buildStoryboardDirectorTask(input: AgentWorkbenchInput): AgentTask {
    return buildAgentTaskFromSkill(agentSkillRegistry.find((skill) => skill.id === "storyboard.scene_to_draft") || defaultAgentSkill, input);
}

function combineAgentTasks(kind: AgentTaskKind, skillName: string, tasks: AgentTask[], input: AgentWorkbenchInput): AgentTask {
    const [first] = tasks;
    return {
        id: input.idFactory(),
        projectId: input.projectId,
        kind,
        title: first?.title || skillName,
        status: "pending",
        targetRefs: uniqueTargetRefs(tasks.flatMap((task) => task.targetRefs)),
        summary: tasks.map((task) => task.summary).join("\n"),
        riskLevel: highestRisk(tasks.map((task) => task.riskLevel)),
        proposedActions: tasks.flatMap((task) => task.proposedActions),
        skillId: `${kind}.combined`,
        skillName,
        skillVersion: "1.0.0",
        createdAt: input.now,
        updatedAt: input.now,
    };
}

function uniqueTargetRefs(refs: AgentTaskTargetRef[]) {
    const seen = new Set<string>();
    return refs.filter((ref) => {
        const key = `${ref.kind}:${ref.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function highestRisk(risks: AgentRiskLevel[]) {
    if (risks.includes("high")) return "high";
    if (risks.includes("medium")) return "medium";
    return "low";
}
