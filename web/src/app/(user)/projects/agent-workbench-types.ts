import type { Prompt } from "@/services/api/prompts";
import type { Asset } from "@/stores/use-asset-store";

import type { ProductionBibleItem } from "../canvas/utils/production-bible";
import type { ScriptEpisode, ScriptScene } from "../canvas/utils/script-management";
import type { StoryboardGroup, StoryboardShot } from "../canvas/utils/storyboard-management";

export type AgentTaskKind = "asset_manager" | "prompt_engineer" | "storyboard_director";
export type AgentTaskStatus = "pending" | "applied" | "cancelled";
export type AgentRiskLevel = "low" | "medium" | "high";
export type AgentTargetRefKind = "asset" | "production_bible" | "prompt" | "script_episode" | "script_scene" | "storyboard_group" | "storyboard_shot";

export type AgentTaskTargetRef = {
    kind: AgentTargetRefKind;
    id: string;
    label: string;
};

export type AgentProposedAction =
    | {
          type: "asset.add_tags";
          assetId: string;
          tags: string[];
          reason: string;
      }
    | {
          type: "storyboard.update_shot_prompt";
          shotId: string;
          prompt: string;
          effectivePrompt: string;
          reason: string;
      }
    | {
          type: "storyboard.create_group_from_scenes";
          episodeId: string;
          title: string;
          sceneIds: string[];
          shots: Array<{
              sceneId: string;
              title: string;
              description: string;
              prompt: string;
              effectivePrompt: string;
              durationHint?: string;
          }>;
          reason: string;
      };

export type AgentTask = {
    id: string;
    projectId: string;
    kind: AgentTaskKind;
    title: string;
    status: AgentTaskStatus;
    targetRefs: AgentTaskTargetRef[];
    summary: string;
    riskLevel: AgentRiskLevel;
    proposedActions: AgentProposedAction[];
    skillId?: string;
    skillName?: string;
    skillVersion?: string;
    createdAt: string;
    updatedAt: string;
};

export type AgentWorkbenchInput = {
    projectId: string;
    assets: Asset[];
    productionBibleItems: ProductionBibleItem[];
    prompts: Prompt[];
    scriptEpisodes: ScriptEpisode[];
    scriptScenes: ScriptScene[];
    storyboardGroups: StoryboardGroup[];
    storyboardShots: StoryboardShot[];
    idFactory: () => string;
    now: string;
};

export type AgentSkillOutput = {
    title: string;
    summary: string;
    targetRefs: AgentTaskTargetRef[];
    proposedActions: AgentProposedAction[];
    riskLevel?: AgentRiskLevel;
};

export type AgentSkillApplyContext = {
    applyAction: (action: AgentProposedAction) => void;
};

export type AgentSkill = {
    id: string;
    name: string;
    agentKind: AgentTaskKind;
    description: string;
    version: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    riskLevel: AgentRiskLevel;
    run: (input: AgentWorkbenchInput) => AgentSkillOutput;
    apply: (task: AgentTask, context: AgentSkillApplyContext) => void;
};
