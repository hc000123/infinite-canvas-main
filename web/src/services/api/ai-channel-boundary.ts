export type AiChannelMode = "remote" | "local";
export type AiProviderProtocol = "openai" | "volcengine-ark";

export function resolveEffectiveChannelMode(channelMode: AiChannelMode, allowCustomChannel?: boolean) {
    return allowCustomChannel === false ? "remote" : channelMode;
}

export function shouldUseBrowserAIKey(channelMode: AiChannelMode) {
    return channelMode === "local";
}

export function shouldAttachLocalVolcengineCredentials(channelMode: AiChannelMode, protocol: AiProviderProtocol) {
    return shouldUseBrowserAIKey(channelMode) && protocol === "volcengine-ark";
}
