export type OriginalWorkflowPreset = {
    presetId: string;
    name: string;
    version: string;
    description: string;
    rootPath: string;
};

export const originalWorkflowPresets: OriginalWorkflowPreset[] = [
    {
        presetId: "seedance-original-format-director-method-v5",
        name: "Seedance 原格式导演方法 v5",
        version: "5.1.0",
        description: "原提示词格式锁 + 导演方法包 + 原清道夫 V4.3 Seedance 工作流。",
        rootPath: "/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/hc工作流-新版/seedance-original-workflow-plus-director-method-v5",
    },
];

export function findOriginalWorkflowPresetByRootPath(rootPath: string) {
    const normalized = rootPath.trim().replace(/\/+$/, "");
    return originalWorkflowPresets.find((preset) => preset.rootPath === normalized);
}
