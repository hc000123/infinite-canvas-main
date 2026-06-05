export type ScriptWorkflowInput = {
    hasOutline: boolean;
    episodeCount: number;
    activeSceneCount: number;
};

export type ScriptWorkflowStep = {
    key: "outline" | "episodes" | "scenes" | "storyboard";
    title: string;
    detail: string;
    status: "done" | "current" | "pending";
};

export function buildScriptWorkflowSteps(input: ScriptWorkflowInput): ScriptWorkflowStep[] {
    return [
        {
            key: "outline",
            title: "大纲",
            detail: "定主线、人物关系和结局方向",
            status: input.hasOutline ? "done" : "current",
        },
        {
            key: "episodes",
            title: "分集",
            detail: "拆每集目标、转折和悬念",
            status: input.episodeCount > 0 ? "done" : input.hasOutline ? "current" : "pending",
        },
        {
            key: "scenes",
            title: "场次",
            detail: "写地点、人物、剧情节拍和对白",
            status: input.activeSceneCount > 0 ? "done" : input.episodeCount > 0 ? "current" : "pending",
        },
        {
            key: "storyboard",
            title: "分镜草案",
            detail: "把场次转换成可编辑分镜组",
            status: input.activeSceneCount > 0 ? "current" : "pending",
        },
    ];
}

export function scriptWorkflowNextAction(input: ScriptWorkflowInput) {
    if (!input.hasOutline) return "先补一段故事大纲";
    if (input.episodeCount <= 0) return "新增第一个分集";
    if (input.activeSceneCount <= 0) return "为当前分集新增或导入场次";
    return "生成场次或整集的分镜草案";
}
