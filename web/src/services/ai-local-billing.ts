export type LocalBillingCurrency = "USD";

export type LocalBillingTextUsage = {
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
};

export type LocalBillingImageInput = {
    model: string;
    imageCount?: number | null;
    requestedSize?: string | null;
    resultSize?: string | null;
    quality?: string | null;
};

export const LOCAL_BILLING_RATE_CARD = {
    currency: "USD" as LocalBillingCurrency,
    text: {
        "gpt-5.5": { inputPer1MTokens: null, outputPer1MTokens: null },
        "gpt-4.1": { inputPer1MTokens: 2, outputPer1MTokens: 8 },
        "gpt-4.1-mini": { inputPer1MTokens: 0.4, outputPer1MTokens: 1.6 },
        "gpt-4o": { inputPer1MTokens: 2.5, outputPer1MTokens: 10 },
        "gpt-4o-mini": { inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
    },
    image: {
        "gpt-image-2": {
            defaultPerImage: 0.04,
            bySize: {
                "1024x1024": 0.04,
                "1024x1536": 0.06,
                "1536x1024": 0.06,
            },
        },
        "gpt-image-1": {
            defaultPerImage: 0.04,
            bySize: {
                "1024x1024": 0.04,
                "1024x1536": 0.06,
                "1536x1024": 0.06,
            },
        },
    },
};

const localTextBillingNote = "本地直连文本调用，费用请以外部模型平台账单为准。平台内费用为估算，仅供参考。";
const localImageBillingNote = "本地直连生图调用，实际费用请以外部模型平台账单为准。平台内费用为估算，仅供参考。";

export function estimateTextCost(model: string, usage?: LocalBillingTextUsage | null) {
    const inputTokens = Math.max(0, Number(usage?.inputTokens) || 0);
    const outputTokens = Math.max(0, Number(usage?.outputTokens) || 0);
    if (!inputTokens && !outputTokens) return null;
    const rate = findModelRate(LOCAL_BILLING_RATE_CARD.text, model);
    if (!rate || rate.inputPer1MTokens == null || rate.outputPer1MTokens == null) return null;
    return roundCost((inputTokens / 1_000_000) * rate.inputPer1MTokens + (outputTokens / 1_000_000) * rate.outputPer1MTokens);
}

export function estimateImageCost(input: LocalBillingImageInput) {
    const count = Math.max(1, Math.floor(Number(input.imageCount) || 1));
    const rate = findModelRate(LOCAL_BILLING_RATE_CARD.image, input.model);
    if (!rate) return null;
    const size = normalizeSize(input.requestedSize) || normalizeSize(input.resultSize);
    const perImage = (size && rate.bySize[size as keyof typeof rate.bySize]) || rate.defaultPerImage;
    return roundCost(perImage * count);
}

export function normalizeBillingNote(input: { requestType: "text" | "image"; requestedSize?: string | null; resultSize?: string | null; extra?: string | null }) {
    const notes = [input.requestType === "text" ? localTextBillingNote : localImageBillingNote];
    const requestedSize = normalizeSize(input.requestedSize);
    const resultSize = normalizeSize(input.resultSize);
    if (requestedSize && resultSize && requestedSize !== resultSize) notes.push("请求尺寸与返回尺寸不一致，请以外部平台账单和实际资源为准。");
    if (input.extra?.trim()) notes.push(input.extra.trim());
    return notes.join(" ");
}

function findModelRate<T>(rates: Record<string, T>, model: string) {
    const key = model.trim().toLowerCase();
    if (!key) return undefined;
    return rates[key] || Object.entries(rates).find(([name]) => key.includes(name))?.[1];
}

function normalizeSize(value?: string | null) {
    const text = (value || "").trim().toLowerCase();
    return /^\d+x\d+$/.test(text) ? text : "";
}

function roundCost(value: number) {
    return Math.round(value * 1_000_000) / 1_000_000;
}
