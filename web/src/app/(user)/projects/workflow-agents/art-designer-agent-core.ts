import { createSeedanceWorkflowAgentCore } from "./workflow-agent-core.ts";

export const artDesignerAgentCore = createSeedanceWorkflowAgentCore({
    agentId: "art-designer",
    stageId: "art-design",
    label: "服化道 / art-designer",
});
