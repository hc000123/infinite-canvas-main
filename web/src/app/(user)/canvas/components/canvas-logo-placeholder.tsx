"use client";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export function CanvasLogoPlaceholder({ label = "等待媒体内容" }: { label?: string }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const logoMask = "url('/logo.svg')";

    return (
        <div className="flex h-full w-full items-center justify-center" style={{ background: theme.surfaceRaised }} role="img" aria-label={label}>
            <span
                aria-hidden
                className="pointer-events-none size-14"
                style={{ backgroundColor: theme.node.placeholder, maskImage: logoMask, WebkitMaskImage: logoMask, maskPosition: "center", WebkitMaskPosition: "center", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskSize: "contain", WebkitMaskSize: "contain" }}
            />
        </div>
    );
}
