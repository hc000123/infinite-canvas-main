import { canvasThemes } from "@/lib/canvas-theme";

type CanvasVideoCapabilityHintProps = {
    label?: string;
    usageLabel?: string;
    detailLabel?: string;
    notice?: string;
    error?: string;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    compact?: boolean;
};

export function CanvasVideoCapabilityHint({ label, usageLabel, detailLabel, notice, error, theme, compact }: CanvasVideoCapabilityHintProps) {
    const text = error || notice || label || detailLabel;
    if (!text) return null;
    return (
        <div
            className={`${compact ? "text-[10px]" : "text-xs"} flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1`}
            style={{ background: theme.node.fill, color: error ? "var(--studio-danger)" : theme.node.muted }}
            title={error || notice || detailLabel || label}
        >
            <span className="truncate">{text}</span>
            {usageLabel && !error ? <span className="shrink-0 tabular-nums">{usageLabel}</span> : null}
        </div>
    );
}
