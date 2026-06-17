import { artDesignerAgentCore } from "./art-designer-agent-core.ts";
import { scriptOptimizerAgentCore } from "./script-optimizer-agent-core.ts";
import { storyboardArtistAgentCore } from "./storyboard-artist-agent-core.ts";
import type { SeedanceWorkflowAgentStageId, WorkflowAgentCore } from "./workflow-agent-core.ts";

export const seedanceWorkflowAgentCores: WorkflowAgentCore[] = [scriptOptimizerAgentCore, artDesignerAgentCore, storyboardArtistAgentCore];

export function getSeedanceWorkflowAgentCore(stageId: string) {
    return seedanceWorkflowAgentCores.find((core) => core.stageId === stageId) as WorkflowAgentCore | undefined;
}

export function requireSeedanceWorkflowAgentCore(stageId: SeedanceWorkflowAgentStageId) {
    const core = getSeedanceWorkflowAgentCore(stageId);
    if (!core) throw new Error(`未找到 Seedance workflow Agent Core：${stageId}`);
    return core;
}
