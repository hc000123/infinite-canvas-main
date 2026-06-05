export type AiChannelMode = "remote" | "local";
export type AiProviderProtocol = "openai" | "volcengine-ark";

export function resolveEffectiveChannelMode(channelMode: AiChannelMode, allowCustomChannel?: boolean) {
    return allowCustomChannel === false ? "remote" : channelMode;
}

export function shouldUseBrowserAIKey(channelMode: AiChannelMode) {
    return channelMode === "local";
}

export function shouldAttachLocalVolcengineCredentials(channelMode: AiChannelMode, protocol: AiProviderProtocol) {
    return false;
}

export function resolveAllowedVideoProtocol(channelMode: AiChannelMode, protocol: AiProviderProtocol) {
    return channelMode === "local" ? "openai" : protocol;
}

export function inferRemoteVideoProtocol(model: string, fallback: AiProviderProtocol = "openai"): AiProviderProtocol {
    const normalized = model.trim().toLowerCase();
    if (!normalized) return fallback;
    return normalized.includes("seedance") || normalized.startsWith("ep-") ? "volcengine-ark" : fallback;
}
