import { createSeedanceWorkflowAgentCore } from "./workflow-agent-core.ts";

export const directorAgentCore = createSeedanceWorkflowAgentCore({
    agentId: "director",
    stageId: "director-analysis",
    label: "导演 / director",
});
