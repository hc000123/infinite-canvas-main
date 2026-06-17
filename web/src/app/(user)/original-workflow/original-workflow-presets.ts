import {
    builtInAgentWorkflowPresets,
    SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID,
    SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_SOURCE_ROOT,
    SEEDANCE_WORKFLOW_PRESET_ID,
    SEEDANCE_WORKFLOW_SOURCE_ROOT,
    sortedWorkflowStages,
    type AgentWorkflowPreset,
} from "../projects/agent-workflow-presets.ts";

export type OriginalWorkflowRunnerMode = "agent-workbench" | "local-runner";

export type OriginalWorkflowPreset = {
    disabledReason?: string;
    presetId: string;
    name: string;
    runnerMode: OriginalWorkflowRunnerMode;
    version: string;
    description: string;
    rootPath: string;
    runnerStrategySummary: string;
    stageSummary: string;
};

type OriginalWorkflowRunnerAdapter = {
    runnerMode: OriginalWorkflowRunnerMode;
    rootPath: string;
    disabledReason?: string;
    runnerStrategySummary: string;
};

const originalWorkflowRunnerAdapters: Record<string, OriginalWorkflowRunnerAdapter> = {
    [SEEDANCE_WORKFLOW_PRESET_ID]: {
        runnerMode: "agent-workbench",
        rootPath: SEEDANCE_WORKFLOW_SOURCE_ROOT,
        disabledReason: "在项目 Agent 工作台使用",
        runnerStrategySummary: "旧套件通过项目 Agent 工作台查看、选择和保存，本地 Runner 不直接启动。",
    },
    [SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID]: {
        runnerMode: "local-runner",
        rootPath: SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_SOURCE_ROOT,
        runnerStrategySummary: "项目 preset 含剧本适配前置绑定；本地 Runner 按剧本优化、服化道、Copy-only 执行，导演方法内置到服化道和 Copy-only。",
    },
};

export const originalWorkflowPresets: OriginalWorkflowPreset[] = builtInAgentWorkflowPresets().map(toOriginalWorkflowPreset);

export function findOriginalWorkflowPresetByRootPath(rootPath: string) {
    const normalized = rootPath.trim().replace(/\/+$/, "");
    return originalWorkflowPresets.find((preset) => preset.rootPath === normalized);
}

function toOriginalWorkflowPreset(preset: AgentWorkflowPreset): OriginalWorkflowPreset {
    const adapter = originalWorkflowRunnerAdapters[preset.workflowId] || {
        runnerMode: "agent-workbench",
        rootPath: preset.sourceRoot,
        disabledReason: "未接入本地 Runner",
        runnerStrategySummary: "该套件已进入全局 registry，但尚未配置本地 Runner 适配。",
    };
    return {
        disabledReason: adapter.disabledReason,
        presetId: preset.workflowId,
        name: preset.name,
        runnerMode: adapter.runnerMode,
        version: preset.version,
        description: preset.description,
        rootPath: adapter.rootPath,
        runnerStrategySummary: adapter.runnerStrategySummary,
        stageSummary: sortedWorkflowStages(preset)
            .map((stage) => stage.name)
            .join("、"),
    };
}
