import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ToolMetricItem = {
    label: ReactNode;
    value: ReactNode;
};

export function ToolWorkbenchLayout({ children, sidebar }: { children: ReactNode; sidebar: ReactNode }) {
    return (
        <div className="mx-auto grid max-w-[1680px] gap-4 lg:grid-cols-[252px_minmax(0,1fr)]">
            <div className="min-w-0">{sidebar}</div>
            <div className="min-w-0">{children}</div>
        </div>
    );
}

export function ToolMetricGrid({ cardClassName, className, items }: { cardClassName?: string; className?: string; items: ToolMetricItem[] }) {
    return (
        <div className={cn("grid gap-2", className)}>
            {items.map((item, index) => (
                <div key={`${String(item.label)}-${index}`} className={cn("studio-section p-3", cardClassName)}>
                    <div className="text-xs text-[var(--studio-text-muted)]">{item.label}</div>
                    <div className="mt-1 text-xl font-semibold leading-none text-[var(--studio-text-primary)]">{item.value}</div>
                </div>
            ))}
        </div>
    );
}
