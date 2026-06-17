import type { AgentWorkflowAgent, AgentWorkflowQualityGate, AgentWorkflowSkill, AgentWorkflowStage } from "./agent-workflow-presets";
import { SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID, SEEDANCE_MX_SHELL_STORYBOARD_V15_PRESET_ID, SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID, SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID } from "./agent-workflow-presets.ts";
import type { AgentRunInput, ChatCompletionMessage, WorkflowTextRunOutput } from "./agent-runner-types.ts";
import { normalizeStringList, summarizeWorkflowTextOutput, tryParseTextOutput } from "./agent-runner-text-utils.ts";

export type { ChatCompletionMessage };

export type WorkflowStagePromptContext = {
    projectId?: string;
    projectTitle?: string;
    canvasId?: string;
    episodeId?: string;
    episodeTitle?: string;
    scriptSnapshot?: string;
    stageSummary?: string;
    sceneSummary?: string;
    sceneKey?: string;
    sceneLabel?: string;
    sceneScriptText?: string;
    sceneVisualDnaSummary?: string;
    previousSceneSummary?: string;
    scriptAdaptationOutputSummary?: string;
    directorOutputSummary?: string;
    artDesignOutputSummary?: string;
    storyboardRequirement?: string;
    assetNeedSummary?: string;
};

export type WorkflowStagePromptBuildInput = {
    workflowId: string;
    workflowVersion: string;
    stage: AgentWorkflowStage;
    agent: AgentWorkflowAgent;
    skills: AgentWorkflowSkill[];
    qualityGates: AgentWorkflowQualityGate[];
    inputSnapshot?: WorkflowStagePromptContext;
};

export function buildWorkflowStageSourceFiles(skills: AgentWorkflowSkill[], qualityGates: AgentWorkflowQualityGate[]): string[] {
    const sourceFiles: string[] = [];
    for (const skill of skills) {
        for (const sourceFile of skill.sourceFiles) {
            if (!sourceFiles.includes(sourceFile.path)) sourceFiles.push(sourceFile.path);
        }
    }
    for (const gate of qualityGates) {
        for (const sourceFile of gate.sourceFiles) {
            if (!sourceFiles.includes(sourceFile.path)) sourceFiles.push(sourceFile.path);
        }
    }
    return sourceFiles;
}

export function buildWorkflowStagePrompt({ workflowId, workflowVersion, stage, agent, skills, qualityGates, inputSnapshot }: WorkflowStagePromptBuildInput) {
    const sourceFiles = buildWorkflowStageSourceFiles(skills, qualityGates);
    const hasEmotionDirector = workflowId === SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID || workflowId === SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID;
    const isOriginalFormatV5 = workflowId === SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID || workflowId === SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID;
    const isMxShellStoryboard = workflowId === SEEDANCE_MX_SHELL_STORYBOARD_V15_PRESET_ID || workflowId === SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID;
    const originalFormatRequirement = isOriginalFormatV5
        ? [
              "",
              "v5.2 原格式硬锁：图片提示词必须沿用原工作流人物 / 场景资产格式，Seedance 视频提示词必须使用 Skill 5 通用版轻量分镜结构。",
              "禁止输出：character-image-prompts.md、scene-image-prompts.md、prop-image-prompts.md、02-seedance-final-prompts.md。",
              "禁止使用 @图片N；Seedance 引用必须使用 @图N。",
              "不得做剧情合规审核，不得要求合规审核 PASS；只保留专业质量和格式检查。",
              "01B / 01D 中的“待确认”只表示用户后续可修改点，不是 Stage 2 或 Stage 3 的阻断条件。",
              "Stage 3 必须包含轻量规范读取记录、参考图映射、剧情分析、大分镜总表、Pxx 大分镜、6 字段分镜、跨段衔接卡和一键复制 Seedance 2.0 提示词代码块。",
          ]
        : [];
    const mxShellOriginalFormatRequirement = isMxShellStoryboard
        ? [
              "",
              "清道夫分镜原格式硬锁：图片提示词仍沿用原工作流人物 / 场景资产格式，Seedance 视频提示词改用 Mx-Shell_Prompts v1.5 结构。",
              "禁止输出：character-image-prompts.md、scene-image-prompts.md、prop-image-prompts.md、02-seedance-final-prompts.md。",
              "禁止使用 @图片N；Seedance 引用必须使用 @图N。",
              "不得做剧情合规审核，不得要求合规审核 PASS；只保留专业质量和格式检查。",
              "01B / 01D 中的“待确认”只表示用户后续可修改点，不是 Stage 2 或 Stage 3 的阻断条件。",
          ]
        : [];
    const mxShellRequirement = isMxShellStoryboard
        ? [
              "",
              "Mx-Shell v1.5 清道夫分镜硬锁：分镜阶段必须使用 Mx-Shell_Prompts v1.5 的输出结构，不使用 Skill 5 大分镜模板。",
              "必须明确模式：一镜到底或多机位分镜；如用户未指定，优先根据场面复杂度选择多机位分镜并说明可改。",
              "输出顺序必须包含：基础设定、氛围与画质、声音、画面内容。",
              "基础设定必须列出角色、道具、场景的物理特征；有参考图时使用不超过 20 字的简述并保留 {@图N} 引用。",
              "严禁文学化修辞，必须改写成可拍摄的物理动作、表情、光线、空间和声音；对白 / 旁白 / 画外音必须保留，并绑定具体动作节拍。",
              "时间轴必须精确到秒：一镜到底在动作描述内标注关键秒点，多机位分镜每条写清时间段。",
              "声音默认不需要配乐，仅保留同期声；不添加素材中未指定的额外音轨，禁止字幕叠加。",
              "请优先输出 JSON 字段：summary、mode、baseSettings、atmosphereQuality、soundRules、pictureContent、seedancePrompts、items。",
          ]
        : [];
    const emotionDirectorRequirement =
        hasEmotionDirector && stage.stageId === "seedance-storyboard"
            ? [
                  "",
                  "情绪导演 v2.1 增强硬锁：分镜阶段必须先把抽象情绪转译为可拍摄的生理反应、微动作、声音状态和环境反馈，再进入最终提示词结构。",
                  "禁止把文学化情绪、比喻、象征或内心独白直接写进画面；必须写成表情肌肉变化、眼神、呼吸、身体重心、手部动作、停顿和同步环境声。",
                  "每个关键时间段都要有情绪过渡，不得让角色长时间静止或面无表情；峰值情绪需要出现可表演的失控反应，回落需要出现呼吸、肌肉或动作速度变化。",
                  "对白必须绑定音量、语速、音质、停顿和说话时的身体动作；倾听者也必须有反应。",
                  "1900 字限制只约束单条最终可复制 Seedance 提示词，不压缩剧本母版、资产说明、审核证据或 JSON 摘要。",
              ]
            : [];
    const scriptRequirement =
        stage.stageId === "script-adaptation"
            ? [
                  "",
                  "剧本适配要求：只整理和结构化剧本，不做导演分析、不输出资产清单、不写分镜或 Seedance 提示词。",
                  "必须保留原剧情事实、人物关系、事件顺序、人物发言顺序、原台词文字、关键转折和原场次边界。",
                  "请优先输出 JSON 字段：productionScript、structuredScript、warnings、items。",
              ]
            : [];
    const sceneRequirement =
        stage.stageId === "seedance-storyboard"
            ? isMxShellStoryboard
                ? ["", "阶段三清道夫要求：按用户素材生成 Mx-Shell 同款视频提示词；保留原剧情、原台词和素材中已有旁白，不扩写无关剧情。", "一镜到底输出单镜头连续动作链；多机位分镜输出每条分镜的时间段、景别运镜、动作描述和对白 / 画外音。"]
                : isOriginalFormatV5
                  ? [
                        "",
                        "阶段三 Skill 5 要求：按剧情动作单元拆大分镜，不修改剧情、不压缩剧本台词；台词超载时拆分连续 P。",
                        "输出必须包含：剧情分析、大分镜总表、Pxx 大分镜、情绪锚点表、本段情境对照、6 字段分镜、跨段衔接卡、一键复制 Seedance 2.0 提示词。",
                        "请优先输出 JSON 字段：summary、storyboardTableSummary、emotionAnchorSummary、shotPromptSummary、seedancePrompts、items。",
                    ]
                  : [
                        "",
                        "阶段三场次推进要求：本次只能处理当前场次 / 子场次，不得整集一次性生成到底。",
                        "输出必须包含：场次视觉 DNA、生成 P / 镜头 P 拆分表摘要、单 P 任务卡 / Seedance 提示词正文、工业化预检记录摘要。",
                        "请优先输出 JSON 字段：summary、sceneVisualDna、promptPlanSummary、singlePTaskCards 或 seedancePrompts、industrialPrecheckSummary、items。",
                    ]
            : [];
    return [
        `你正在执行 Seedance 工作流的文本阶段草案生成任务。请仅返回文本草案，不调用图片/视频生成接口，不触发扣费。`,
        `workflowId: ${workflowId}`,
        `workflowVersion: ${workflowVersion}`,
        `stageId: ${stage.stageId}`,
        `stageName: ${stage.name}`,
        `agentId: ${agent.agentId}`,
        `agentName: ${agent.name}`,
        `stagePurpose: ${stage.purpose}`,
        `outputSummary: ${stage.outputSummary}`,
        `agentRole: ${agent.role}`,
        `agentResponsibility: ${agent.responsibility}`,
        `agentSystemPromptSummary: ${agent.systemPromptSummary}`,
        `skills: ${skills.map((skill) => `${skill.name}（${skill.purpose}）`).join("；")}`,
        `qualityGates: ${qualityGates.map((gate) => `${gate.name}（${gate.summary}）`).join("；")}`,
        `sourceFiles: ${sourceFiles.join("；") || "（无）"}`,
        "",
        `最小上下文：${buildWorkflowStageContextLines(inputSnapshot, agent.agentId, stage.stageId).join("；")}`,
        ...originalFormatRequirement,
        ...mxShellOriginalFormatRequirement,
        ...mxShellRequirement,
        ...emotionDirectorRequirement,
        ...scriptRequirement,
        ...sceneRequirement,
        "",
        `要求：输出可读、可审核的文本草案，并在必要处给出校验建议。若你能输出 JSON，请将结果放在 JSON 里；若不适配，可输出纯文本，但必须完整可读。`,
    ].join("\n");
}

export function buildWorkflowStagePromptMessages(params: WorkflowStagePromptBuildInput): ChatCompletionMessage[] {
    return [
        { role: "system", content: "你是 Seedance workflow 阶段文本助手，只输出可人工审核的文本产物。" },
        { role: "user", content: buildWorkflowStagePrompt(params) },
    ];
}

export function buildWorkflowTextRunOutput(input: AgentRunInput, rawText: string, now: string): WorkflowTextRunOutput {
    const parsed = tryParseTextOutput(rawText);
    return {
        rawText,
        summary: summarizeWorkflowTextOutput(parsed.value, rawText),
        structuredOutput: parsed.value,
        outputFormat: parsed.format,
        stageId: input.stageId || "",
        agentId: input.agentId || "",
        workflowId: input.workflowId || input.sourcePresetId || input.presetId || "workflow",
        sourceFiles: normalizeStringList(input.sourceFiles),
        qualityGateIds: normalizeStringList(input.qualityGateIds),
        createdAt: now,
    };
}

function buildWorkflowStageContextLines(snapshot: WorkflowStagePromptContext | undefined, agentId: string, stageId: string) {
    if (!snapshot) return ["（未提供上下文）"];
    const lines: string[] = [];
    if (snapshot.projectTitle) lines.push(`项目：${snapshot.projectTitle}`);
    if (snapshot.episodeTitle) lines.push(`本集：${snapshot.episodeTitle}`);
    if (snapshot.scriptSnapshot) lines.push(`剧本：${snapshot.scriptSnapshot}`);
    if (snapshot.stageSummary) lines.push(`阶段输入摘要：${snapshot.stageSummary}`);

    if (agentId === "script-optimizer" || stageId === "script-adaptation") {
        return lines.length ? lines : ["未提供原始剧本上下文"];
    }
    if (agentId === "director" || stageId === "director-analysis") {
        if (snapshot.scriptAdaptationOutputSummary) lines.push(`剧本适配产物摘要：${snapshot.scriptAdaptationOutputSummary}`);
        if (snapshot.sceneSummary) lines.push(`场次摘要：${snapshot.sceneSummary}`);
        return lines.length ? lines : ["未提供项目/剧本/场次上下文"];
    }
    if (agentId === "art-designer" || stageId === "art-design") {
        if (snapshot.directorOutputSummary) lines.push(`导演产物摘要：${snapshot.directorOutputSummary}`);
        if (snapshot.assetNeedSummary) lines.push(`本集资产需求摘要：${snapshot.assetNeedSummary}`);
        return lines.length ? lines : ["未提供导演产物摘要 / 资产需求"];
    }
    if (agentId === "storyboard-artist" || stageId === "seedance-storyboard") {
        if (snapshot.sceneKey || snapshot.sceneLabel) lines.push(`当前场次 / 子场次：${[snapshot.sceneKey, snapshot.sceneLabel].filter(Boolean).join(" · ")}`);
        if (snapshot.sceneScriptText) lines.push(`当前场次剧本片段：${snapshot.sceneScriptText}`);
        if (snapshot.sceneVisualDnaSummary) lines.push(`当前场次已有视觉 DNA：${snapshot.sceneVisualDnaSummary}`);
        if (snapshot.previousSceneSummary) lines.push(`前序衔接状态：${snapshot.previousSceneSummary}`);
        if (snapshot.directorOutputSummary) lines.push(`导演产物摘要：${snapshot.directorOutputSummary}`);
        if (snapshot.artDesignOutputSummary) lines.push(`服化道产物摘要：${snapshot.artDesignOutputSummary}`);
        if (snapshot.storyboardRequirement) lines.push(`分镜输出要求：${snapshot.storyboardRequirement}`);
        return lines.length ? lines : ["未提供导演 / 服化道产物及要求"];
    }
    return lines.length ? lines : ["未提供阶段上下文"];
}
