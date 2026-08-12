"use client";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export function CanvasLogoPlaceholder({ label = "等待媒体内容" }: { label?: string }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div className="flex h-full w-full items-center justify-center" style={{ background: theme.surfaceRaised }} role="img" aria-label={label}>
            <img src="/logo.svg" alt="" draggable={false} className="pointer-events-none size-14 select-none opacity-25 grayscale" />
        </div>
    );
}
