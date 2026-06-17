"use client";

import { Select, Tag } from "antd";
import { Boxes, Wrench } from "lucide-react";

import {
    SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID,
    SEEDANCE_MX_SHELL_STORYBOARD_V15_PRESET_ID,
    SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID,
    SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID,
    sortedWorkflowStages,
    workflowStageDetail,
    type AgentWorkflowPreset,
    type AgentWorkflowStage,
} from "./agent-workflow-presets";

const panelClass = "rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)]";
const mutedPanelClass = "rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]";
const mutedTextClass = "text-[var(--studio-text-muted)]";

type AgentPresetSelectionPanelProps = {
    workflowPresets: AgentWorkflowPreset[];
    selectedWorkflowPreset: AgentWorkflowPreset;
    onSelectWorkflowPreset: (workflowId: string) => void;
};

export function AgentPresetSelectionPanel({ workflowPresets, selectedWorkflowPreset, onSelectWorkflowPreset }: AgentPresetSelectionPanelProps) {
    const selectedStages = sortedWorkflowStages(selectedWorkflowPreset);
    return (
        <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
                {selectedStages.map((stage) => {
                    const packagePreset = skillPackagePresetForStage(workflowPresets, selectedWorkflowPreset, stage.stageId);
                    const packageStage = sortedWorkflowStages(packagePreset).find((item) => item.stageId === stage.stageId) || stage;
                    const selectedDetail = workflowStageDetail(packagePreset, packageStage);
                    const sourceCount = selectedDetail.skills.reduce((total, skill) => total + skill.sourceFiles.length, 0);
                    return (
                        <section key={stage.stageId} className={`p-4 ${panelClass}`}>
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-sm font-semibold">
                                        <span className="grid size-7 place-items-center rounded-md bg-[var(--studio-surface-muted)] text-xs text-[var(--studio-text-secondary)]">{stage.order}</span>
                                        {stageOptionTitle(stage)}
                                    </div>
                                    <div className={`mt-1 text-xs ${mutedTextClass}`}>{stage.outputSummary}</div>
                                </div>
                                <Tag className="m-0" icon={<Boxes className="size-3" />}>
                                    {selectedDetail.skills.length} Skill
                                </Tag>
                            </div>
                            <Select className="w-full" value={packagePreset.workflowId} onChange={onSelectWorkflowPreset} options={skillPackageOptions(workflowPresets, stage.stageId)} />
                            <div className={`mt-3 p-3 ${mutedPanelClass}`}>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Tag className="m-0" icon={<Wrench className="size-3" />}>
                                        {skillPackageName(packagePreset, packageStage)}
                                    </Tag>
                                    <Tag className="m-0">必读 {sourceCount} 份</Tag>
                                    <Tag className="m-0">{sourceRootName(packagePreset.sourceRoot)}</Tag>
                                </div>
                                <div className={`mt-2 text-xs leading-5 ${mutedTextClass}`}>{skillPackageSummary(packagePreset, packageStage)}</div>
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}

function skillPackageOptions(workflowPresets: AgentWorkflowPreset[], stageId: string) {
    const usedWorkflowIds = new Set<string>();
    return workflowPresets
        .map((preset) => canonicalSkillPackagePresetForStage(workflowPresets, preset, stageId))
        .filter((preset): preset is AgentWorkflowPreset => Boolean(preset))
        .filter((preset) => stageId !== "script-adaptation" || isWhitePaperScriptPackage(preset))
        .filter((preset) => {
            if (usedWorkflowIds.has(preset.workflowId)) return false;
            usedWorkflowIds.add(preset.workflowId);
            return true;
        })
        .map((packagePreset) => {
            const stage = sortedWorkflowStages(packagePreset).find((item) => item.stageId === stageId);
            if (!stage) return undefined;
            return {
                label: skillPackageName(packagePreset, stage),
                value: packagePreset.workflowId,
            };
        })
        .filter((item): item is { label: string; value: string } => Boolean(item));
}

function skillPackagePresetForStage(workflowPresets: AgentWorkflowPreset[], selectedWorkflowPreset: AgentWorkflowPreset, stageId: string) {
    return canonicalSkillPackagePresetForStage(workflowPresets, selectedWorkflowPreset, stageId) || selectedWorkflowPreset;
}

function canonicalSkillPackagePresetForStage(workflowPresets: AgentWorkflowPreset[], preset: AgentWorkflowPreset, stageId: string) {
    if (stageId === "script-adaptation") return workflowPresets.find(isWhitePaperScriptPackage) || preset;
    if (stageId === "art-design" && isOriginalFormatFamilyPreset(preset)) {
        return workflowPresets.find((item) => item.workflowId === SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID) || preset;
    }
    return preset;
}

function isWhitePaperScriptPackage(preset: AgentWorkflowPreset) {
    return preset.version.startsWith("5.2");
}

function isOriginalFormatFamilyPreset(preset: AgentWorkflowPreset) {
    return [SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID, SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID, SEEDANCE_MX_SHELL_STORYBOARD_V15_PRESET_ID, SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID].includes(preset.workflowId);
}

function stageOptionTitle(stage: AgentWorkflowStage) {
    if (stage.stageId === "script-adaptation") return "剧本优化 Skill";
    if (stage.stageId === "art-design") return "服化道 Skill";
    if (stage.stageId === "seedance-storyboard") return "分镜 Skill";
    return `${stage.name} Skill`;
}

function skillPackageName(preset: AgentWorkflowPreset, stage: AgentWorkflowStage) {
    const suffix = preset.version.startsWith("5.2") ? "v5.2" : `v${preset.version}`;
    if (stage.stageId === "script-adaptation") return preset.version.startsWith("5.2") ? "白皮书 AI 剧本母版适配包 v1.1" : `Seedance 剧本适配包 ${suffix}`;
    if (preset.workflowId === SEEDANCE_MX_SHELL_STORYBOARD_V15_PRESET_ID && stage.stageId === "art-design") return "导演方法 + 原格式服化道包 v5.2";
    if (preset.workflowId === SEEDANCE_MX_SHELL_STORYBOARD_V15_PRESET_ID && stage.stageId === "seedance-storyboard") return "清道夫分镜包 v1.5";
    if (preset.workflowId === SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID && stage.stageId === "seedance-storyboard") return "情绪导演 + Skill 5 轻量分镜包 v2.1";
    if (preset.workflowId === SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID && stage.stageId === "seedance-storyboard") return "情绪导演 + 清道夫分镜包 v2.1";
    if (stage.stageId === "art-design") return preset.version.startsWith("5.2") ? `导演方法 + 原格式服化道包 ${suffix}` : `导演讲戏 + 影视服化道资产包 ${suffix}`;
    if (stage.stageId === "seedance-storyboard") return preset.version.startsWith("5.2") ? `导演方法 + Skill 5 轻量分镜包 ${suffix}` : `导演讲戏 + 工业化 Seedance 分镜包 ${suffix}`;
    return `${stage.name}包 ${suffix}`;
}

function skillPackageSummary(preset: AgentWorkflowPreset, stage: AgentWorkflowStage) {
    const detail = workflowStageDetail(preset, stage);
    return detail.skills.map((skill) => skill.summary).join("；") || stage.purpose;
}

function sourceRootName(sourceRoot: string) {
    const parts = sourceRoot.split("/").filter(Boolean);
    return parts[parts.length - 1] || sourceRoot;
}
