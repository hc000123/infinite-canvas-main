import { modelMatchesAiCapability, type AiModelKind } from "../../../../lib/ai-model-kind.ts";
import type { AdminModelChannel, AdminModelTextEndpoint, AdminPublicModelChannelSettings } from "../../../../services/api/admin.ts";

export type WizardPublicSelection = {
    publishedModels: string[];
    defaultTextModel: string;
    defaultImageModel: string;
    defaultVideoModel: string;
    modelTextEndpoints: Partial<AdminModelTextEndpoint>[];
};

export type WizardChannelDraft = Partial<AdminModelChannel> & {
    discoveredModels?: string[];
    manualModels?: string[];
};

const emptyChannel: AdminModelChannel = {
    id: "",
    protocol: "openai",
    name: "",
    baseUrl: "",
    apiKey: "",
    cliPath: "",
    workDir: "",
    outputDir: "",
    timeoutSeconds: 0,
    sessionId: 0,
    concurrencyLimit: 1,
    endpointId: "",
    endpointMappings: [],
    models: [],
    capabilities: [],
    environment: "dev",
    weight: 1,
    enabled: true,
    remark: "",
};

export function normalizeWizardModels(values: readonly string[] = []) {
    const seen = new Set<string>();
    return values.map((value) => value.trim()).filter((value) => {
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
    });
}

export function buildWizardChannel(existing: AdminModelChannel | undefined, draft: WizardChannelDraft): AdminModelChannel {
    const merged = { ...emptyChannel, ...existing, ...draft };
    const protocol = merged.protocol;
    const requestedModels = normalizeWizardModels([...(draft.models ?? existing?.models ?? []), ...(draft.discoveredModels || []), ...(draft.manualModels || [])]);
    const endpointMappings = protocol === "volcengine-ark" ? buildArkMappings(draft.endpointMappings ?? existing?.endpointMappings ?? []) : [];
    const apiKey = protocol === "jimeng-cli" ? "" : keepSecret(existing?.apiKey, draft.apiKey);

    const result: AdminModelChannel = {
        ...merged,
        id: (draft.id || existing?.id || "").trim(),
        protocol,
        name: (merged.name || "").trim(),
        baseUrl: protocol === "jimeng-cli" ? "" : (merged.baseUrl || "").trim(),
        apiKey,
        cliPath: (merged.cliPath || "").trim(),
        workDir: (merged.workDir || "").trim(),
        outputDir: (merged.outputDir || "").trim(),
        endpointId: protocol === "volcengine-ark" ? endpointMappings[0]?.endpointId || "" : "",
        endpointMappings,
        models: protocol === "volcengine-ark" ? endpointMappings.map((item) => item.model) : requestedModels,
        capabilities: normalizeWizardModels(merged.capabilities || []),
        environment: merged.environment === "prod" || merged.environment === "test" ? merged.environment : "dev",
        timeoutSeconds: Math.max(0, Number(merged.timeoutSeconds) || 0),
        sessionId: Math.max(0, Number(merged.sessionId) || 0),
        concurrencyLimit: Math.max(1, Number(merged.concurrencyLimit) || 1),
        weight: Math.max(1, Number(merged.weight) || 1),
        enabled: merged.enabled !== false,
        remark: merged.remark || "",
    };
    if (!result.models.length) throw new Error("请配置至少一个模型");
    return result;
}

export function applyWizardPublication(
    current: AdminPublicModelChannelSettings,
    previousChannel: AdminModelChannel | undefined,
    nextChannel: AdminModelChannel,
    siblingChannels: AdminModelChannel[],
    selection: WizardPublicSelection,
): AdminPublicModelChannelSettings {
    const previousModels = normalizeWizardModels(previousChannel?.models || []);
    const nextModels = nextChannel.enabled ? normalizeWizardModels(nextChannel.models) : [];
    const selectedModels = new Set(normalizeWizardModels(selection.publishedModels).filter((model) => nextModels.includes(model)));
    const siblings = siblingChannels.filter((channel) => channel.enabled);
    const availableModels = normalizeWizardModels(current.availableModels).filter((model) => {
        if (!previousModels.includes(model)) return true;
        return selectedModels.has(model) || siblings.some((channel) => normalizeWizardModels(channel.models).includes(model));
    });
    selectedModels.forEach((model) => {
        if (!availableModels.includes(model)) availableModels.push(model);
    });
    const hasCapability = (model: string, capability: AiModelKind) => [...siblings, nextChannel]
        .filter((channel) => channel.enabled && normalizeWizardModels(channel.models).includes(model))
        .some((channel) => modelMatchesAiCapability(model, channel.capabilities, capability));
    const textModels = availableModels.filter((model) => hasCapability(model, "text"));
    const requestedEndpoints = new Map(normalizeTextEndpoints(selection.modelTextEndpoints));
    const currentEndpoints = new Map(current.modelTextEndpoints
        .map((item) => ({ model: item.model.trim(), endpointType: item.endpointType }))
        .filter((item, index, items) => item.model && textModels.includes(item.model) && items.findIndex((candidate) => candidate.model === item.model) === index)
        .map((item) => [item.model, item.endpointType] as const));
    const modelTextEndpoints = textModels.map((model) => ({
        model,
        endpointType: selectedModels.has(model) ? requestedEndpoints.get(model) || "chat_completions" : requestedEndpoints.get(model) || currentEndpoints.get(model) || "chat_completions",
    }));
    const defaultTextModel = resolveDefault(selection.defaultTextModel, current.defaultTextModel, availableModels, hasCapability, "text");

    return {
        ...current,
        availableModels,
        modelTextEndpoints,
        defaultModel: current.defaultModel,
        defaultTextModel,
        defaultImageModel: resolveDefault(selection.defaultImageModel, current.defaultImageModel, availableModels, hasCapability, "image"),
        defaultVideoModel: resolveDefault(selection.defaultVideoModel, current.defaultVideoModel, availableModels, hasCapability, "video"),
    };
}

export function channelVerificationMode(channel: AdminModelChannel) {
    if (channel.protocol === "volcengine-ark" || channel.protocol === "jimeng-cli" || channel.protocol === "xinglian-cloud") return "preflight" as const;
    return channel.capabilities.some((capability) => capability.trim().toLowerCase() === "video") ? "connectivity" as const : "model-test" as const;
}

function buildArkMappings(mappings: Partial<AdminModelChannel["endpointMappings"][number]>[]) {
    const result: AdminModelChannel["endpointMappings"] = [];
    const seen = new Set<string>();
    mappings.forEach((item) => {
        const model = item.model?.trim() || "";
        if (!model || seen.has(model)) return;
        seen.add(model);
        const endpointId = item.endpointId?.trim() || "";
        if (!endpointId) throw new Error(`${model} 缺少 Endpoint / EP`);
        result.push({ model, endpointId });
    });
    return result;
}

function keepSecret(existing: string | undefined, draft: string | undefined) {
    const value = (draft || "").trim();
    return !value || /^\*+$/.test(value) ? existing || "" : value;
}

function normalizeTextEndpoints(values: Partial<AdminModelTextEndpoint>[]) {
    const result = new Map<string, AdminModelTextEndpoint["endpointType"]>();
    values.forEach((item) => {
        const model = item.model?.trim() || "";
        if (model && !result.has(model)) result.set(model, item.endpointType === "responses" ? "responses" : "chat_completions");
    });
    return result;
}

function resolveDefault(
    requested: string,
    current: string,
    availableModels: string[],
    hasCapability: (model: string, capability: AiModelKind) => boolean,
    capability: AiModelKind,
) {
    const candidates = [requested, current].map((model) => model.trim());
    return candidates.find((model) => model && availableModels.includes(model) && hasCapability(model, capability)) || "";
}
