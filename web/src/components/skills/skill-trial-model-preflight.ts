import type { AdminPublicModelChannelSettings } from "@/services/api/admin.ts";

export function skillTrialModelBlockReason(executorKind: string | undefined, modelChannel: AdminPublicModelChannelSettings | null | undefined) {
    if (executorKind === "text_model" && !modelChannel?.defaultTextModel?.trim()) return "缺少默认文本模型";
    if (executorKind === "image_model" && !modelChannel?.defaultImageModel?.trim()) return "缺少默认图片模型";
    return "";
}
