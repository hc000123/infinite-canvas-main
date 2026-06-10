export type AiChannelMode = "remote" | "local";
export type AiProviderProtocol = "openai" | "volcengine-ark";

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

export function inferRemoteVideoProtocol(model: string, fallback: AiProviderProtocol = "openai"): AiProviderProtocol {
    const normalized = model.trim().toLowerCase();
    if (!normalized) return fallback;
    return normalized.includes("seedance") || normalized.startsWith("ep-") ? "volcengine-ark" : fallback;
}
