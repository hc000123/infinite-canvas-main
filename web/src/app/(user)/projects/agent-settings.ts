export type AgentConfigKind = "asset_extractor" | "storyboard_director" | "image_brief_builder" | "video_prompt_builder" | "prompt_reviewer";
export type AgentReasoningLevel = "中" | "高" | "超高";
export type AgentWritePolicy = "preview_only" | "confirm_before_write";

export type AgentInputVariable = {
    name: string;
    description: string;
};

export type AgentConfig = {
    id: string;
    projectId?: string;
    episodeId?: string;
    name: string;
    kind: AgentConfigKind;
    scenario: string;
    enabled: boolean;
    systemPrompt: string;
    userPromptTemplate: string;
    inputVariables: AgentInputVariable[];
    outputJsonSchema?: string;
    outputJsonExample?: string;
    modelPreference: string;
    temperature: number;
    maxOutputTokens: number;
    reasoningLevel: AgentReasoningLevel;
    writePolicy: AgentWritePolicy;
    version: string;
    updatedAt: string;
};

export type AgentConfigValidationResult = {
    valid: boolean;
    errors: string[];
};

const allowedReasoningLevels: AgentReasoningLevel[] = ["中", "高", "超高"];
const defaultUpdatedAt = "2026-01-01T00:00:00.000Z";

export function defaultAgentConfigs(now = defaultUpdatedAt): AgentConfig[] {
    return [
        buildDefaultAgentConfig({
            kind: "asset_extractor",
            name: "资产提取 Agent",
            scenario: "从本集剧本或分镜文本中提取角色、场景、道具、风格 / 光影等资产草案。",
            systemPrompt: "你是短剧制作的资产统筹，只输出可人工确认的资产清单草案。不要自动写入业务数据，不要触发生成或扣费。",
            userPromptTemplate: "请基于以下本集剧本整理资产草案：\n{scriptSnapshot}\n\n输出角色、场景、道具、风格光影四类，保留来源片段。",
            inputVariables: [
                { name: "scriptSnapshot", description: "当前画布绑定的本集剧本文本快照" },
                { name: "episodeTitle", description: "当前集标题" },
            ],
            outputJsonExample: JSON.stringify({ assets: [{ kind: "character", name: "角色名", description: "外观与行为", sourceText: "剧本片段", tags: [] }] }, null, 2),
            reasoningLevel: "高",
            now,
        }),
        buildDefaultAgentConfig({
            kind: "storyboard_director",
            name: "分镜导演 Agent",
            scenario: "把本集剧本或场次整理成可编辑的分镜头表草案。",
            systemPrompt: "你是短剧分镜导演，只产出分镜头表草案。草案必须由用户确认或编辑后才写入。",
            userPromptTemplate: "请将以下本集剧本拆成分镜头草案：\n{scriptSnapshot}\n\n要求按场次、镜头编号、画面描述、动作、对白、情绪、景别和预计时长输出。",
            inputVariables: [
                { name: "scriptSnapshot", description: "当前本集剧本文本快照" },
                { name: "assetNeeds", description: "可选的资产需求列表" },
            ],
            outputJsonExample: JSON.stringify({ shots: [{ sceneName: "场景", title: "镜头 1", scriptText: "剧本文本", visualDescription: "画面描述", estimatedDuration: 5 }] }, null, 2),
            reasoningLevel: "高",
            now,
        }),
        buildDefaultAgentConfig({
            kind: "image_brief_builder",
            name: "生图 Brief Agent",
            scenario: "把资产需求、设定库或镜头组整理成场景图、角色图、道具图、氛围图 Brief 草案。",
            systemPrompt: "你是美术设定 Brief 助理，只补全结构化 Brief 草案。不要直接调用生图，不要写入素材库。",
            userPromptTemplate: "请基于以下来源生成生图 Brief 草案：\n来源类型：{sourceType}\n来源内容：{sourceText}\n\n请补齐核心字段、参考素材用途和最终提示词草案。",
            inputVariables: [
                { name: "sourceType", description: "asset_breakdown / production_bible / storyboard / manual" },
                { name: "sourceText", description: "资产需求、设定库描述或分镜文本" },
            ],
            outputJsonExample: JSON.stringify({ brief: { kind: "scene", title: "场景图", fields: {}, finalPrompt: "提示词草案" } }, null, 2),
            reasoningLevel: "中",
            now,
        }),
        buildDefaultAgentConfig({
            kind: "video_prompt_builder",
            name: "视频提示词 Agent",
            scenario: "把生成镜头组上下文整理成 Seedance 视频提示词草案。",
            systemPrompt: "你是短剧视频提示词工程师，只输出可审稿的视频提示词草案。不要自动创建任务，不要触发扣费。",
            userPromptTemplate: "请根据生成镜头组信息生成视频提示词草案：\n分镜：{shotTexts}\n资产：{assetRefs}\n时长：{duration}\n\n请输出正向提示词、负向约束和引用说明。",
            inputVariables: [
                { name: "shotTexts", description: "生成镜头组包含的分镜文本" },
                { name: "assetRefs", description: "图片、音频、参考视频和设定库引用摘要" },
                { name: "duration", description: "生成镜头组总时长" },
            ],
            outputJsonExample: JSON.stringify({ prompt: "视频提示词草案", negativePrompt: "避免内容", referenceNotes: [] }, null, 2),
            reasoningLevel: "高",
            now,
        }),
        buildDefaultAgentConfig({
            kind: "prompt_reviewer",
            name: "提示词质检 Agent",
            scenario: "检查图片 / 视频提示词是否缺少主体、动作、引用说明、风险词和格式约束。",
            systemPrompt: "你是提示词质检员，只输出风险和修改建议。不要改写业务数据，不要触发生成。",
            userPromptTemplate: "请检查以下提示词：\n{prompt}\n\n请按风险、缺失项、建议修改输出 JSON。",
            inputVariables: [{ name: "prompt", description: "待质检的图片或视频提示词" }],
            outputJsonExample: JSON.stringify({ risks: [{ level: "warning", message: "缺少引用说明" }], suggestions: [] }, null, 2),
            reasoningLevel: "中",
            now,
        }),
    ];
}

export function defaultAgentConfig(kind: AgentConfigKind, now = defaultUpdatedAt) {
    return defaultAgentConfigs(now).find((config) => config.kind === kind) || defaultAgentConfigs(now)[0];
}

export function mergeAgentConfigs(defaults: AgentConfig[], globalOverrides: AgentConfig[] = [], projectOverrides: AgentConfig[] = []) {
    const byKind = new Map<AgentConfigKind, AgentConfig>();
    defaults.forEach((config) => byKind.set(config.kind, normalizeAgentConfig(config)));
    globalOverrides.forEach((config) => byKind.set(config.kind, normalizeAgentConfig({ ...byKind.get(config.kind), ...config } as AgentConfig)));
    projectOverrides.forEach((config) => byKind.set(config.kind, normalizeAgentConfig({ ...byKind.get(config.kind), ...config } as AgentConfig)));
    return defaults.map((config) => byKind.get(config.kind) || config);
}

export function validateAgentConfig(config: AgentConfig): AgentConfigValidationResult {
    const errors: string[] = [];
    if (!config.name.trim()) errors.push("Agent 名称不能为空");
    if (!config.systemPrompt.trim()) errors.push("系统提示词不能为空");
    if (!config.userPromptTemplate.trim()) errors.push("用户提示词模板不能为空");
    if (!allowedReasoningLevels.includes(config.reasoningLevel)) errors.push("推理程度只能是 中 / 高 / 超高");
    if (!["preview_only", "confirm_before_write"].includes(config.writePolicy)) errors.push("写入策略无效");
    if (config.temperature < 0 || config.temperature > 2) errors.push("temperature 需要在 0 到 2 之间");
    if (config.maxOutputTokens <= 0) errors.push("maxOutputTokens 必须大于 0");
    return { valid: errors.length === 0, errors };
}

export function canInvokeAgentConfig(config: AgentConfig) {
    const validation = validateAgentConfig(config);
    if (!config.enabled) return { callable: false, reason: "Agent 已禁用" };
    if (!validation.valid) return { callable: false, reason: validation.errors.join("；") };
    return { callable: true, reason: "" };
}

export function normalizeAgentConfig(config: AgentConfig): AgentConfig {
    const fallback = defaultAgentConfig(config.kind);
    const reasoningLevel = allowedReasoningLevels.includes(config.reasoningLevel) ? config.reasoningLevel : fallback.reasoningLevel;
    return {
        ...fallback,
        ...config,
        inputVariables: Array.isArray(config.inputVariables) ? config.inputVariables.map(normalizeInputVariable).filter((item) => item.name) : fallback.inputVariables,
        temperature: Number.isFinite(config.temperature) ? config.temperature : fallback.temperature,
        maxOutputTokens: Number.isFinite(config.maxOutputTokens) ? Math.max(1, Math.round(config.maxOutputTokens)) : fallback.maxOutputTokens,
        reasoningLevel,
        writePolicy: config.writePolicy === "preview_only" ? "preview_only" : "confirm_before_write",
        version: config.version || fallback.version,
        updatedAt: config.updatedAt || new Date().toISOString(),
    };
}

export function parseInputVariablesText(value: string): AgentInputVariable[] {
    return value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const [name, ...description] = line.split(/[:：]/);
            return normalizeInputVariable({ name, description: description.join("：") });
        })
        .filter((item) => item.name);
}

export function formatInputVariablesText(variables: AgentInputVariable[]) {
    return variables.map((item) => `${item.name}：${item.description}`).join("\n");
}

export function fillAgentPromptTemplate(template: string, variables: Record<string, unknown>) {
    return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => {
        const value = variables[key];
        if (value === undefined || value === null) return match;
        if (Array.isArray(value)) return value.join("、");
        return String(value);
    });
}

function buildDefaultAgentConfig(input: Omit<AgentConfig, "id" | "enabled" | "modelPreference" | "temperature" | "maxOutputTokens" | "writePolicy" | "version" | "updatedAt"> & { now: string }): AgentConfig {
    return {
        ...input,
        id: `agent-config-${input.kind}`,
        enabled: true,
        modelPreference: "default",
        temperature: 0.4,
        maxOutputTokens: 1800,
        writePolicy: "confirm_before_write",
        version: "1.0.0",
        updatedAt: input.now,
    };
}

function normalizeInputVariable(variable: AgentInputVariable): AgentInputVariable {
    return {
        name: String(variable.name || "").trim(),
        description: String(variable.description || "").trim(),
    };
}
