export type PromptAgentIntent = "image_prompt" | "video_prompt" | "storyboard_prompt" | "rewrite_prompt" | "chat";
export type PromptAgentComposerIntent = PromptAgentIntent | "auto";

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
