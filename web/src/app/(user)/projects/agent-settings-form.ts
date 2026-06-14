import {
    formatInputVariablesText,
    parseInputVariablesText,
    type AgentConfig,
    type AgentReasoningLevel,
    type AgentWritePolicy,
} from "./agent-settings";

export type AgentConfigFormValues = {
    name: string;
    scenario: string;
    enabled: boolean;
    systemPrompt: string;
    userPromptTemplate: string;
    inputVariablesText: string;
    outputJsonExample: string;
    channelId: string;
    modelPreference: string;
    temperature: number;
    maxOutputTokens: number;
    reasoningLevel: AgentReasoningLevel;
    estimatedCredits: number;
    allowFallback: boolean;
    fallbackChannelIdsText: string;
    allowBatch: boolean;
    timeoutSeconds: number;
    concurrencyLimit: number;
    writePolicy: AgentWritePolicy;
};

export function configToForm(config: AgentConfig): AgentConfigFormValues {
    return {
        name: config.name,
        scenario: config.scenario,
        enabled: config.enabled,
        systemPrompt: config.systemPrompt,
        userPromptTemplate: config.userPromptTemplate,
        inputVariablesText: formatInputVariablesText(config.inputVariables),
        outputJsonExample: config.outputJsonExample || config.outputJsonSchema || "",
        channelId: config.channelId,
        modelPreference: config.modelPreference,
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        reasoningLevel: config.reasoningLevel,
        estimatedCredits: config.estimatedCredits,
        allowFallback: config.allowFallback,
        fallbackChannelIdsText: config.fallbackChannelIds.join("\n"),
        allowBatch: config.allowBatch,
        timeoutSeconds: config.timeoutSeconds,
        concurrencyLimit: config.concurrencyLimit,
        writePolicy: config.writePolicy,
    };
}

export function formToConfig(base: AgentConfig, values: AgentConfigFormValues, projectId: string): AgentConfig {
    return {
        ...base,
        id: base.projectId ? base.id : `agent-config-${projectId}-${base.kind}`,
        projectId,
        name: values.name,
        scenario: values.scenario || "",
        enabled: values.enabled,
        systemPrompt: values.systemPrompt,
        userPromptTemplate: values.userPromptTemplate,
        inputVariables: parseInputVariablesText(values.inputVariablesText || ""),
        outputJsonExample: values.outputJsonExample || "",
        channelId: values.channelId || "",
        modelPreference: values.modelPreference || "default",
        temperature: values.temperature ?? 0.4,
        maxOutputTokens: values.maxOutputTokens ?? 1800,
        reasoningLevel: values.reasoningLevel,
        estimatedCredits: values.estimatedCredits ?? 0,
        allowFallback: values.allowFallback === true,
        fallbackChannelIds: parseFallbackChannelIdsText(values.fallbackChannelIdsText || ""),
        allowBatch: values.allowBatch !== false,
        timeoutSeconds: values.timeoutSeconds ?? 300,
        concurrencyLimit: values.concurrencyLimit ?? 1,
        writePolicy: values.writePolicy,
        updatedAt: new Date().toISOString(),
    };
}

export function formToGlobalConfig(base: AgentConfig, values: AgentConfigFormValues): AgentConfig {
    return {
        ...base,
        id: `agent-config-global-${base.kind}`,
        projectId: undefined,
        name: values.name,
        scenario: values.scenario || "",
        enabled: values.enabled,
        systemPrompt: values.systemPrompt,
        userPromptTemplate: values.userPromptTemplate,
        inputVariables: parseInputVariablesText(values.inputVariablesText || ""),
        outputJsonExample: values.outputJsonExample || "",
        channelId: values.channelId || "",
        modelPreference: values.modelPreference || "default",
        temperature: values.temperature ?? 0.4,
        maxOutputTokens: values.maxOutputTokens ?? 1800,
        reasoningLevel: values.reasoningLevel,
        estimatedCredits: values.estimatedCredits ?? 0,
        allowFallback: values.allowFallback === true,
        fallbackChannelIds: parseFallbackChannelIdsText(values.fallbackChannelIdsText || ""),
        allowBatch: values.allowBatch !== false,
        timeoutSeconds: values.timeoutSeconds ?? 300,
        concurrencyLimit: values.concurrencyLimit ?? 1,
        writePolicy: values.writePolicy,
        updatedAt: new Date().toISOString(),
    };
}

function parseFallbackChannelIdsText(value: string) {
    const seen = new Set<string>();
    return value
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter((item) => {
            if (!item || seen.has(item)) return false;
            seen.add(item);
            return true;
        });
}
