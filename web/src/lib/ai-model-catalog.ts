import { modelMatchesAiCapability, type AiModelKind } from "./ai-model-kind.ts";

export type AiModelProtocol = "openai" | "volcengine-ark" | "jimeng-cli" | "xinglian-cloud";
export type AiTextEndpointType = "chat_completions" | "responses";

type ModelCapability = { model: string; capabilities: readonly string[] };
type ModelProtocol = { model: string; protocol: AiModelProtocol };
type ModelSource = { model: string; channelId: string; channelName: string; protocol: AiModelProtocol };
type ModelTextEndpoint = { model: string; endpointType: AiTextEndpointType };

export type AiModelCatalogConfig = {
    model?: string;
    imageModel?: string;
    videoModel?: string;
    textModel?: string;
    models?: readonly string[];
    imageModels?: readonly string[];
    videoModels?: readonly string[];
    textModels?: readonly string[];
    modelCapabilities?: readonly ModelCapability[];
    modelProtocols?: readonly ModelProtocol[];
    modelSources?: readonly ModelSource[];
    modelTextEndpoints?: readonly ModelTextEndpoint[];
    videoProtocol?: AiModelProtocol;
};

export type AiModelCatalogEntry = {
    id: string;
    capabilities: AiModelKind[];
    protocol: AiModelProtocol;
    sources: ModelSource[];
    textEndpointType?: AiTextEndpointType;
};

const capabilityOrder: AiModelKind[] = ["image", "video", "text"];

export function buildAiModelCatalog(config: AiModelCatalogConfig): AiModelCatalogEntry[] {
    const ids = catalogModelIds(config);
    return ids.map((id) => {
        const explicitCapabilities = config.modelCapabilities?.find((item) => item.model === id)?.capabilities;
        const capabilities = capabilityOrder.filter((capability) => modelMatchesAiCapability(id, explicitCapabilities ? [...explicitCapabilities] : fallbackCapabilities(config, id), capability));
        const protocol = config.modelProtocols?.find((item) => item.model === id)?.protocol || "openai";
        const sources = (config.modelSources || []).filter((item) => item.model === id).map((item) => ({ ...item }));
        const textEndpointType = config.modelTextEndpoints?.find((item) => item.model === id)?.endpointType;
        return { id, capabilities, protocol, sources, ...(textEndpointType ? { textEndpointType } : {}) };
    });
}

export function modelsForCapability(config: AiModelCatalogConfig, capability: AiModelKind) {
    return buildAiModelCatalog(config)
        .filter((item) => item.capabilities.includes(capability))
        .map((item) => item.id);
}

export function resolveGenerationModel({
    config,
    capability,
    nodeModel,
    projectModel,
}: {
    config: AiModelCatalogConfig;
    capability: AiModelKind;
    nodeModel?: string;
    projectModel?: string;
}) {
    const available = new Set(modelsForCapability(config, capability));
    const systemModel = capability === "image" ? config.imageModel : capability === "video" ? config.videoModel : config.textModel;
    return uniqueModels([nodeModel, projectModel, systemModel]).find((model) => available.has(model)) || "";
}

export function protocolForModel(config: AiModelCatalogConfig, model: string): AiModelProtocol {
    const modelName = model.trim();
    return config.modelProtocols?.find((item) => item.model === modelName)?.protocol || "openai";
}

function catalogModelIds(config: AiModelCatalogConfig) {
    if (config.models?.length) return uniqueModels(config.models);
    return uniqueModels([...(config.imageModels || []), ...(config.videoModels || []), ...(config.textModels || []), config.imageModel, config.videoModel, config.textModel]);
}

function fallbackCapabilities(config: AiModelCatalogConfig, model: string) {
    const capabilities: AiModelKind[] = [];
    if (config.imageModels?.includes(model)) capabilities.push("image");
    if (config.videoModels?.includes(model)) capabilities.push("video");
    if (config.textModels?.includes(model)) capabilities.push("text");
    return capabilities.length ? capabilities : undefined;
}

function uniqueModels(models: readonly (string | undefined)[]) {
    const seen = new Set<string>();
    return models
        .map((model) => model?.trim() || "")
        .filter((model) => {
            if (!model || seen.has(model)) return false;
            seen.add(model);
            return true;
        });
}
