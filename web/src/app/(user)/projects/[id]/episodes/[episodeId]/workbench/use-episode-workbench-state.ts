"use client";

import { useMemo } from "react";

import type { CanvasProject } from "../../../../../canvas/stores/use-canvas-store";
import { buildEpisodeScriptSnapshot } from "../../../../../canvas/utils/canvas-episode-context";
import { orderedScriptScenes, type ScriptEpisode, type ScriptScene } from "../../../../../canvas/utils/script-management";
import { orderedStoryboardTableShots, type StoryboardTableShot } from "../../../../../canvas/utils/storyboard-management";
import { buildSeedanceWorkflowPreset, sortedWorkflowStages } from "../../../../agent-workflow-presets";
import type { AgentWorkflowMappingPreview, AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "../../../../agent-runner";

export type EpisodeSceneOption = {
    sceneKey: string;
    sceneLabel: string;
    scriptText: string;
    source: "storyboard_table" | "script_scene" | "script_text";
};

type UseEpisodeWorkbenchStateOptions = {
    canvases: CanvasProject[];
    episode?: ScriptEpisode;
    episodeId: string;
    projectId: string;
    scenes: ScriptScene[];
    storyboardTableShots: StoryboardTableShot[];
    workflowMappingPreviews: AgentWorkflowMappingPreview[];
    workflowOutputs: AgentWorkflowStageOutput[];
    workflowRuns: AgentWorkflowRunRecord[];
};

export function useEpisodeWorkbenchState({ canvases, episode, episodeId, projectId, scenes, storyboardTableShots, workflowMappingPreviews, workflowOutputs, workflowRuns }: UseEpisodeWorkbenchStateOptions) {
    const preset = useMemo(() => buildSeedanceWorkflowPreset(), []);
    const stages = useMemo(() => sortedWorkflowStages(preset), [preset]);
    const stageSceneRows = useMemo(() => orderedScriptScenes(scenes, episodeId), [episodeId, scenes]);
    const scriptSnapshot = useMemo(() => (episode ? buildEpisodeScriptSnapshot(episode, stageSceneRows) : ""), [episode, stageSceneRows]);
    const boundCanvas = useMemo(() => canvases.find((canvas) => canvas.projectId === projectId && canvas.episodeId === episodeId), [canvases, episodeId, projectId]);
    const episodeTableShots = useMemo(() => (boundCanvas ? orderedStoryboardTableShots(storyboardTableShots, boundCanvas.id, episodeId) : []), [boundCanvas, episodeId, storyboardTableShots]);
    const sceneOptions = useMemo(() => buildEpisodeSceneOptions({ tableShots: episodeTableShots, scriptScenes: stageSceneRows, scriptSnapshot }), [episodeTableShots, scriptSnapshot, stageSceneRows]);
    const workflowRun = useMemo(
        () => workflowRuns.find((run) => run.projectId === projectId && run.canvasId === boundCanvas?.id && run.episodeId === episodeId && run.workflowId === preset.workflowId),
        [boundCanvas?.id, episodeId, preset.workflowId, projectId, workflowRuns],
    );
    const previews = useMemo(() => (workflowRun ? workflowMappingPreviews.filter((preview) => preview.workflowRunId === workflowRun.id) : []), [workflowMappingPreviews, workflowRun]);
    const stageOutputs = useMemo(() => Object.fromEntries(stages.map((stage) => [stage.stageId, stageOutput(workflowRun, workflowOutputs, stage.stageId)])), [stages, workflowOutputs, workflowRun]);
    const hasScript = Boolean(scriptSnapshot.trim());

    return {
        boundCanvas,
        episodeTableShots,
        hasScript,
        preset,
        previews,
        sceneOptions,
        scriptSnapshot,
        stageOutputs,
        stages,
        stageSceneRows,
        workflowRun,
    };
}

export function stageOutput(workflowRun: AgentWorkflowRunRecord | undefined, outputs: AgentWorkflowStageOutput[], stageId: string) {
    const stageState = workflowRun?.stageStates.find((stage) => stage.stageId === stageId);
    return stageState?.outputId ? outputs.find((output) => output.outputId === stageState.outputId) : outputs.find((output) => output.workflowRunId === workflowRun?.id && output.stageId === stageId);
}

function buildEpisodeSceneOptions({
    tableShots,
    scriptScenes,
    scriptSnapshot,
}: {
    tableShots: Array<{ sceneId?: string; sceneName: string; scriptText: string }>;
    scriptScenes: Array<{ id: string; order: number; location: string; beat: string; dialogue: string; emotion: string }>;
    scriptSnapshot: string;
}): EpisodeSceneOption[] {
    if (tableShots.length) {
        const sceneMap = new Map<string, EpisodeSceneOption>();
        tableShots.forEach((shot, index) => {
            const label = shot.sceneName || `场次 ${index + 1}`;
            const key = shot.sceneId || slugSceneKey(label, index);
            const existing = sceneMap.get(key);
            const scriptText = [existing?.scriptText, shot.scriptText].filter(Boolean).join("\n");
            sceneMap.set(key, { sceneKey: key, sceneLabel: label, scriptText, source: "storyboard_table" });
        });
        return Array.from(sceneMap.values());
    }
    if (scriptScenes.length) {
        return scriptScenes.map((scene) => ({
            sceneKey: scene.id,
            sceneLabel: `${scene.order}. ${scene.location || "未命名场次"}`,
            scriptText: [scene.beat, scene.dialogue, scene.emotion].filter(Boolean).join("\n"),
            source: "script_scene",
        }));
    }
    return extractSceneOptionsFromScriptText(scriptSnapshot);
}

function extractSceneOptionsFromScriptText(scriptSnapshot: string): EpisodeSceneOption[] {
    const lines = scriptSnapshot
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const titleIndexes = lines.map((line, index) => ({ line, index })).filter(({ line }) => /^#{0,3}\s*\d+[-.、]\d+|^#{0,3}\s*第?\d+\s*[场幕]/.test(line));
    if (!titleIndexes.length && scriptSnapshot.trim()) return [{ sceneKey: "scene-1", sceneLabel: "scene-1", scriptText: scriptSnapshot.trim(), source: "script_text" }];
    return titleIndexes.map(({ line, index }, sceneIndex) => {
        const nextIndex = titleIndexes[sceneIndex + 1]?.index ?? lines.length;
        const label = line.replace(/^#+\s*/, "").slice(0, 48);
        return {
            sceneKey: slugSceneKey(label, sceneIndex),
            sceneLabel: label || `scene-${sceneIndex + 1}`,
            scriptText: lines.slice(index, nextIndex).join("\n"),
            source: "script_text",
        };
    });
}

function slugSceneKey(label: string, index: number) {
    return (
        label
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || `scene-${index + 1}`
    );
}
