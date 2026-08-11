export type AiChannelMode = "remote" | "local";
export type AiProviderProtocol = "openai" | "volcengine-ark" | "jimeng-cli" | "xinglian-cloud" | "minimax";
export type AiModelProtocol = { model: string; protocol: AiProviderProtocol };

export function resolveEffectiveChannelMode(_channelMode: AiChannelMode, _allowCustomChannel?: boolean) {
    return "remote";
}

export function shouldUseBrowserAIKey(_channelMode: AiChannelMode) {
    return false;
}

export function shouldAttachLocalVolcengineCredentials(_channelMode: AiChannelMode, _protocol: AiProviderProtocol) {
    return false;
}

export function resolveAllowedVideoProtocol(_channelMode: AiChannelMode, protocol: AiProviderProtocol) {
    return protocol;
}

export function inferRemoteVideoProtocol(model: string, fallback: AiProviderProtocol = "openai", modelProtocols: AiModelProtocol[] = []): AiProviderProtocol {
    const normalized = model.trim().toLowerCase();
    if (!normalized) return fallback;
    const configured = modelProtocols.find((item) => item.model.trim().toLowerCase() === normalized)?.protocol;
    if (configured === "openai" || configured === "volcengine-ark" || configured === "jimeng-cli" || configured === "xinglian-cloud" || configured === "minimax") return configured;
    return normalized.startsWith("ep-") ? "volcengine-ark" : fallback;
}
