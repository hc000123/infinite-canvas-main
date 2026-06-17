import { createSeedanceWorkflowAgentCore } from "./workflow-agent-core.ts";

export const scriptOptimizerAgentCore = createSeedanceWorkflowAgentCore({
    agentId: "script-optimizer",
    stageId: "script-adaptation",
    label: "剧本 / script-optimizer",
});
