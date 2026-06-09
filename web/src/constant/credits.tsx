import type { ComponentProps } from "react";
import { Zap } from "lucide-react";

export function CreditSymbol({ className, ...props }: ComponentProps<"span">) {
    return (
        <span {...props} className={`inline-flex items-center justify-center ${className || ""}`}>
            <Zap className="size-[1em] fill-current" strokeWidth={2.4} />
        </span>
    );
}

export type ModelCreditCost = {
    model: string;
    credits: number;
};

export function modelCreditCost(modelCosts: ModelCreditCost[] | undefined, model: string, fallbackModel?: string) {
    const exact = modelCosts?.find((item) => item.model === model)?.credits;
    if (exact !== undefined) return exact;
    const fallback = fallbackModel ? modelCosts?.find((item) => item.model === fallbackModel)?.credits : undefined;
    if (fallback !== undefined) return fallback;
    if (model.trim().toLowerCase().startsWith("ep-")) {
        return modelCosts?.find((item) => item.model.includes("seedance") && !item.model.includes("fast") && item.credits > 0)?.credits || modelCosts?.find((item) => item.model.includes("seedance") && item.credits > 0)?.credits || 0;
    }
    return 0;
}

export function requestCreditCost(options: { channelMode: string; modelCosts?: ModelCreditCost[]; model: string; fallbackModel?: string; count?: string | number }) {
    if (options.channelMode !== "remote") return 0;
    const count = Math.max(1, Math.floor(Math.abs(Number(options.count)) || 1));
    return modelCreditCost(options.modelCosts, options.model, options.fallbackModel) * count;
}
