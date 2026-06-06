import {
    buildWorkflowMappingPreviews,
    buildWorkflowStagePromptMessages,
    buildWorkflowTextRunOutput,
    type AgentRunInput,
    type AgentWorkflowMappingPreview,
    type AgentWorkflowRunRecord,
    type AgentWorkflowStageOutput,
    type WorkflowStagePromptBuildInput,
    type WorkflowStagePromptContext,
    type WorkflowTextRunOutput,
} from "../agent-runner.ts";
import { workflowStageDetail, type AgentWorkflowPreset } from "../agent-workflow-presets.ts";

export type SeedanceWorkflowAgentStageId = "director-analysis" | "art-design" | "seedance-storyboard";
export type SeedanceWorkflowAgentId = "director" | "art-designer" | "storyboard-artist";

export type WorkflowAgentCoreBuildContext = {
    preset: AgentWorkflowPreset;
    inputSnapshot?: WorkflowStagePromptContext;
};

export type WorkflowAgentCoreMappingContext = {
    workflowRun: AgentWorkflowRunRecord;
    now: string;
};

export type WorkflowAgentCoreNormalizeContext = {
    runInput: AgentRunInput;
    rawText: string;
    now: string;
};

export type WorkflowAgentCore = {
    agentId: SeedanceWorkflowAgentId;
    stageId: SeedanceWorkflowAgentStageId;
    label: string;
    buildInput: (context: WorkflowAgentCoreBuildContext) => WorkflowStagePromptBuildInput;
    buildPromptMessages: (input: WorkflowStagePromptBuildInput, preset: AgentWorkflowPreset) => NonNullable<AgentRunInput["promptMessages"]>;
    normalizeOutput: (context: WorkflowAgentCoreNormalizeContext) => WorkflowTextRunOutput;
    buildMappingPreviews: (output: AgentWorkflowStageOutput, context: WorkflowAgentCoreMappingContext) => AgentWorkflowMappingPreview[];
};

export function createSeedanceWorkflowAgentCore(input: { agentId: SeedanceWorkflowAgentId; stageId: SeedanceWorkflowAgentStageId; label: string }): WorkflowAgentCore {
    return {
        agentId: input.agentId,
        stageId: input.stageId,
        label: input.label,
        buildInput: ({ preset, inputSnapshot }) => {
            const stage = preset.stages.find((item) => item.stageId === input.stageId);
            if (!stage) throw new Error(`未找到 workflow stage：${input.stageId}`);
            const detail = workflowStageDetail(preset, stage);
            if (!detail.agent) throw new Error(`阶段 ${stage.name} 缺少绑定的 Agent，无法执行`);
            return {
                workflowId: preset.workflowId,
                workflowVersion: preset.version,
                stage,
                agent: detail.agent,
                skills: detail.skills,
                qualityGates: detail.qualityGates,
                inputSnapshot,
            };
        },
        buildPromptMessages: (promptInput) => buildWorkflowStagePromptMessages(promptInput),
        normalizeOutput: ({ runInput, rawText, now }) => buildWorkflowTextRunOutput(runInput, rawText, now),
        buildMappingPreviews: (output, { workflowRun, now }) => buildWorkflowMappingPreviews({ workflowRun, stageId: input.stageId, output, now }),
    };
}
