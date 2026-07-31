import { modelMatchesAiCapability, type AiModelKind } from "../../../../lib/ai-model-kind.ts";
import type { AdminModelChannel, AdminPublicModelChannelSettings } from "../../../../services/api/admin.ts";

export function sanitizeModelChannelPublication(current: AdminPublicModelChannelSettings, channels: AdminModelChannel[]): AdminPublicModelChannelSettings {
    const routableChannels = channels.filter((channel) => channel.enabled && (channel.protocol === "jimeng-cli" || Boolean(channel.baseUrl.trim() && channel.apiKey.trim())));
    const channelModels = routableChannels.map((channel) => new Set(normalizeModels(channel.models)));
    const servesModel = (model: string) => channelModels.some((models) => models.has(model));
    const hasCapability = (model: string, capability: AiModelKind) => routableChannels.some((channel, index) => channelModels[index].has(model) && modelMatchesAiCapability(model, channel.capabilities, capability));
    const availableModels = normalizeModels(current.availableModels).filter(servesModel);
    const availableModelSet = new Set(availableModels);
    const keepDefault = (model: string, capability: AiModelKind) => {
        const normalized = model.trim();
        return normalized && availableModelSet.has(normalized) && hasCapability(normalized, capability) ? normalized : "";
    };
    return {
        ...current,
        availableModels,
        modelTextEndpoints: current.modelTextEndpoints.filter((item) => availableModelSet.has(item.model) && hasCapability(item.model, "text")),
        defaultModel: "",
        defaultTextModel: keepDefault(current.defaultTextModel, "text"),
        defaultImageModel: keepDefault(current.defaultImageModel, "image"),
        defaultVideoModel: keepDefault(current.defaultVideoModel, "video"),
    };
}

function normalizeModels(models: readonly string[]) {
    return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
}
