import { useMemo } from "react";

import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasProject } from "../stores/use-canvas-store";
import { canvasEpisodeContextFromCanvas } from "../utils/canvas-episode-context";
import { applyCanvasProjectPresetToConfig } from "../utils/canvas-project-preset";

export function useCanvasRuntimeConfig(currentProject: CanvasProject | null | undefined, effectiveConfig: AiConfig) {
    const canvasEpisodeContext = useMemo(() => canvasEpisodeContextFromCanvas(currentProject), [currentProject]);
    const canvasAiConfig = useMemo(() => applyCanvasProjectPresetToConfig(effectiveConfig, currentProject?.preset), [currentProject?.preset, effectiveConfig]);

    return { canvasAiConfig, canvasEpisodeContext };
}
