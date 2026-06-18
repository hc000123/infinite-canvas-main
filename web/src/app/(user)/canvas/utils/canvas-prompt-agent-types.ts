export type PromptAgentIntent = "image_prompt" | "video_prompt" | "storyboard_prompt" | "rewrite_prompt" | "chat";
export type PromptAgentComposerIntent = PromptAgentIntent | "auto";
export type PromptAgentRunMode = "ask" | "auto" | "review";

export type PromptAgentImageOutput = {
    id: string;
    kind: "image_prompt";
    title: string;
    finalPrompt: string;
    subject?: string;
    style?: string;
    composition?: string;
    lighting?: string;
    material?: string;
    color?: string;
    referenceUsage?: string;
    negativePrompt?: string;
};

export type PromptAgentVideoOutput = {
    id: string;
    kind: "video_prompt";
    title: string;
    finalPrompt: string;
    subject?: string;
    action?: string;
    camera?: string;
    shotSize?: string;
    rhythm?: string;
    duration?: string;
    ratio?: string;
    referenceUsage?: string;
};

export type PromptAgentStoryboardShot = {
    id: string;
    title: string;
    visual: string;
    action?: string;
    shotSize?: string;
    camera?: string;
    emotion?: string;
    videoPrompt?: string;
};

export type PromptAgentStoryboardOutput = {
    id: string;
    kind: "storyboard_prompt";
    title: string;
    summary?: string;
    finalPrompt?: string;
    shots: PromptAgentStoryboardShot[];
};

export type PromptAgentOutput = PromptAgentImageOutput | PromptAgentVideoOutput | PromptAgentStoryboardOutput;

export type PromptAgentAction =
    | { id: string; type: "node.create_image_config"; outputId: string; title?: string }
    | { id: string; type: "node.create_video_config"; outputId: string; title?: string }
    | { id: string; type: "node.create_storyboard_group"; outputId: string; title?: string }
    | { id: string; type: "image.generate"; outputId: string; title?: string };

export type PromptAgentPlan = {
    intent: PromptAgentIntent;
    reply: string;
    outputs: PromptAgentOutput[];
    actions: PromptAgentAction[];
};

export type PromptAgentParseResult = { ok: true; plan: PromptAgentPlan; text: string } | { ok: false; text: string; error?: string };

export type PromptAgentToolPermission = "write_canvas" | "generate_image";

export type PromptAgentTool = {
    actionType: PromptAgentAction["type"];
    label: string;
    permission: PromptAgentToolPermission;
    description: string;
    requiresConfirmation: boolean;
    costly?: boolean;
};

export type PromptAgentExecutionStepStatus = "ready" | "confirm" | "blocked" | "running" | "succeeded" | "failed" | "skipped";

export type PromptAgentExecutionStep = {
    id: string;
    actionId: string;
    actionType: PromptAgentAction["type"];
    outputId: string;
    title: string;
    toolLabel: string;
    permission: PromptAgentToolPermission;
    status: PromptAgentExecutionStepStatus;
    requiresConfirmation: boolean;
    note: string;
};

export type PromptAgentExecutionPlan = {
    mode: PromptAgentRunMode;
    summary: string;
    steps: PromptAgentExecutionStep[];
    readyCount: number;
    confirmCount: number;
    blockedCount: number;
    runningCount: number;
    succeededCount: number;
    failedCount: number;
    skippedCount: number;
};

export type PromptAgentExecutionStepRecord = {
    status: PromptAgentExecutionStepStatus;
    note?: string;
    updatedAt?: string;
};

export type PromptAgentExecutionState = {
    steps: Record<string, PromptAgentExecutionStepRecord>;
    summary?: string;
    updatedAt?: string;
};
