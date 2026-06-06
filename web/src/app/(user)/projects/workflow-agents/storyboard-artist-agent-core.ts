import { createSeedanceWorkflowAgentCore } from "./workflow-agent-core.ts";

export const storyboardArtistAgentCore = createSeedanceWorkflowAgentCore({
    agentId: "storyboard-artist",
    stageId: "seedance-storyboard",
    label: "分镜师 / storyboard-artist",
});
