export type AgentWorkflowSourceFile = {
    path: string;
    category: "agent" | "skill" | "template" | "example" | "tool" | "config" | "guide";
    summary: string;
};

export type AgentWorkflowStage = {
    stageId: string;
    name: string;
    agentId: string;
    order: number;
    purpose: string;
    inputSummary: string;
    outputSummary: string;
    requiredSkills: string[];
    qualityGateIds: string[];
};

export type AgentWorkflowAgent = {
    agentId: string;
    name: string;
    role: string;
    responsibility: string;
    systemPromptSummary: string;
    sourceFile: string;
};

export type AgentWorkflowSkill = {
    skillId: string;
    name: string;
    purpose: string;
    summary: string;
    sourceFiles: AgentWorkflowSourceFile[];
};

export type AgentWorkflowQualityGate = {
    gateId: string;
    name: string;
    stageIds: string[];
    purpose: string;
    summary: string;
    sourceFiles: AgentWorkflowSourceFile[];
};

export type AgentWorkflowPreset = {
    workflowId: string;
    name: string;
    version: string;
    description: string;
    stages: AgentWorkflowStage[];
    agents: AgentWorkflowAgent[];
    skills: AgentWorkflowSkill[];
    qualityGates: AgentWorkflowQualityGate[];
    sourceFiles: AgentWorkflowSourceFile[];
    sourceRoot: string;
    importedAt: string;
    enabled: boolean;
    selected: boolean;
};

export type AgentWorkflowPresetSelection = {
    workflowId: string;
    projectId?: string;
    enabled: boolean;
    selected: boolean;
    updatedAt: string;
};

export const SEEDANCE_WORKFLOW_PRESET_ID = "seedance-2-multi-agent-storyboard-team";
export const SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID = "seedance-original-format-director-method-v5";

const sourceRoot = "/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/86.废才Seedance 2.0 AI 分镜师团队";
const v5SourceRoot = "/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/hc工作流-新版/seedance-original-workflow-plus-director-method-v5";
const importedAt = "2026-06-06T00:00:00.000Z";

export function builtInAgentWorkflowPresets(): AgentWorkflowPreset[] {
    return [buildSeedanceWorkflowPreset(), buildSeedanceOriginalFormatDirectorMethodV5Preset()];
}

export function buildSeedanceWorkflowPreset(): AgentWorkflowPreset {
    const sourceFiles = uniqueSourceFiles([
        sourceFile("project.config.json", "config", "声明三阶段需要读取的 agent、skill、template、example 与工具配置。"),
        sourceFile("AGENTS.md", "config", "定义制片人调度、三阶段流程、阶段门禁和强制执行锁。"),
        sourceFile("tools/README.md", "tool", "说明 workflow guard、quality gate、spec cache、asset index 等工具入口。"),
        ...stage1SourceFiles(),
        ...stage2SourceFiles(),
        ...stage3SourceFiles(),
    ]);
    return {
        workflowId: SEEDANCE_WORKFLOW_PRESET_ID,
        name: "Seedance 2.0 分镜师团队",
        version: "1.0.0",
        description: "将 director、art-designer、storyboard-artist 三阶段旧工作流导入为项目内可查看、可选择、可保存的多 Agent workflow 预设；本预设只保存结构摘要和来源，不执行工作流。",
        stages: [
            {
                stageId: "director-analysis",
                name: "导演分析",
                agentId: "director",
                order: 1,
                purpose: "通读本集剧本，拆解剧情段落卡，输出导演讲戏本、人物清单、场景清单和互动道具清单。",
                inputSummary: "本集剧本、项目流程规则、导演执行模板和阶段一审核规范。",
                outputSummary: "导演分析 / 讲戏本、人物清单、场景清单、互动道具清单与阶段一审核证据。",
                requiredSkills: ["director-skill", "script-analysis-review-skill", "compliance-review-skill"],
                qualityGateIds: ["stage-spec-read-record", "director-business-review", "compliance-review"],
            },
            {
                stageId: "art-design",
                name: "服化道美术设计",
                agentId: "art-designer",
                order: 2,
                purpose: "基于导演分析输出角色、场景、道具参考图提示词，并明确参考图绑定边界。",
                inputSummary: "导演分析中的人物 / 场景 / 道具清单、Gemini 图片提示词指南、角色与场景示例、服化道模板。",
                outputSummary: "人物设定提示词、2x2 场景规划提示词、道具提示词和阶段二审核证据。",
                requiredSkills: ["art-design-skill", "art-direction-review-skill", "compliance-review-skill"],
                qualityGateIds: ["stage-spec-read-record", "art-direction-review", "compliance-review", "asset-uniqueness-check"],
            },
            {
                stageId: "seedance-storyboard",
                name: "Seedance 分镜师",
                agentId: "storyboard-artist",
                order: 3,
                purpose: "按场次 / 子场次把导演讲戏和美术参考转成 Seedance 2.0 动态提示词。",
                inputSummary: "导演讲戏本、角色 / 场景 / 道具参考提示词、Seedance 方法论、工业化质检规范、示例和输出模板。",
                outputSummary: "场次视觉 DNA、生成 P / 镜头 P 拆分表、单 P 任务卡、一键复制提示词和阶段三审核证据。",
                requiredSkills: ["seedance-storyboard-skill", "seedance-prompt-review-skill", "compliance-review-skill"],
                qualityGateIds: ["stage-spec-read-record", "scene-by-scene-lock", "industrial-quality-precheck", "seedance-prompt-review", "compliance-review"],
            },
        ],
        agents: [
            {
                agentId: "director",
                name: "导演 / director",
                role: "剧本分析与全程质控",
                responsibility: "负责阶段一导演分析，并对阶段一、阶段二、阶段三执行业务审核与合规审核闭环。",
                systemPromptSummary: "资深影视导演，聚焦叙事结构、镜头语言、视觉连续性、导演讲戏和两步审核。",
                sourceFile: "agents/director.md",
            },
            {
                agentId: "art-designer",
                name: "服化道 / art-designer",
                role: "影视美术设定",
                responsibility: "把导演分析中的人物、场景和道具需求转化为可生成参考图的结构化提示词。",
                systemPromptSummary: "专业服装、化妆、道具、场景设定师，强调角色定妆板、2x2 场景规划和参考图绑定边界。",
                sourceFile: "agents/art-designer.md",
            },
            {
                agentId: "storyboard-artist",
                name: "分镜师 / storyboard-artist",
                role: "Seedance 动态提示词编写",
                responsibility: "按场次 / 子场次拆生成 P，编写带 @引用的 Seedance 2.0 视频提示词，并执行工业化预检留痕。",
                systemPromptSummary: "影视分镜师，负责把导演讲戏翻译成 4-15 秒、单一主运镜、素材引用明确的 Seedance 生成脚本。",
                sourceFile: "agents/storyboard-artist.md",
            },
        ],
        skills: [
            skill("director-skill", "导演执行技能", "剧本分析、剧情段落卡、导演讲戏、人物 / 场景 / 道具清单。", stage1SourceFiles(["skills/director-skill/SKILL.md", "skills/director-skill/templates/director-analysis-template.md"])),
            skill(
                "art-design-skill",
                "服化道设计技能",
                "角色设定板、场景 2x2 四宫格、互动道具参考图和清道夫引用边界。",
                stage2SourceFiles([
                    "skills/art-design-skill/SKILL.md",
                    "skills/art-design-skill/gemini-image-prompt-guide.md",
                    "skills/art-design-skill/examples/character-prompt-examples.md",
                    "skills/art-design-skill/examples/scene-prompt-examples.md",
                    "skills/art-design-skill/templates/art-design-template.md",
                ]),
            ),
            skill(
                "seedance-storyboard-skill",
                "Seedance 分镜编写技能",
                "场次视觉 DNA、生成 P 拆分、单 P 任务卡、Seedance 2.0 一键复制提示词。",
                stage3SourceFiles([
                    "skills/seedance-storyboard-skill/SKILL.md",
                    "skills/seedance-storyboard-skill/seedance-prompt-methodology.md",
                    "skills/seedance-storyboard-skill/industrial-quality-rules.md",
                    "skills/seedance-storyboard-skill/examples/seedance-prompt-examples.md",
                    "skills/seedance-storyboard-skill/templates/seedance-prompts-template.md",
                ]),
            ),
            skill("script-analysis-review-skill", "导演分析审核技能", "审核阶段一导演分析是否覆盖剧情、人物、场景、连续性和讲戏质量。", [sourceFile("skills/script-analysis-review-skill/SKILL.md", "skill", "阶段一业务审核规范。")]),
            skill("art-direction-review-skill", "服化道审核技能", "审核人物造型、场景规划、风格一致性和提示词可执行性。", [sourceFile("skills/art-direction-review-skill/SKILL.md", "skill", "阶段二业务审核规范。")]),
            skill("seedance-prompt-review-skill", "Seedance 提示词审核技能", "审核阶段三提示词的规范性、运镜节奏、叙事连贯和素材引用。", [sourceFile("skills/seedance-prompt-review-skill/SKILL.md", "skill", "阶段三业务审核规范。")]),
            skill("compliance-review-skill", "合规审核技能", "检查 Seedance 与 Gemini 平台红线，并要求用风险转译保留叙事功能。", [sourceFile("skills/compliance-review-skill/SKILL.md", "skill", "各阶段合规审核规范。")]),
        ],
        qualityGates: [
            gate("stage-spec-read-record", "规范读取记录", ["director-analysis", "art-design", "seedance-storyboard"], "每阶段开始前记录读取的 agent、skill、template、example 和上游输入文件。", "未记录本阶段规范读取路径时，阶段不得开始或 PASS。", [
                sourceFile("AGENTS.md", "config", "阶段规范读取记录要求。"),
                sourceFile("project.config.json", "config", "三阶段 specFiles 清单。"),
            ]),
            gate("director-business-review", "导演分析业务审核", ["director-analysis"], "检查导演分析、讲戏本、人物清单和场景清单质量。", "阶段一审核需写入业务评分、问题清单、硬性 FAIL 检查和 PASS / FAIL 结论。", [
                sourceFile("skills/script-analysis-review-skill/SKILL.md", "skill", "阶段一业务审核规范。"),
            ]),
            gate("art-direction-review", "服化道业务审核", ["art-design"], "检查角色、场景、道具设定的造型准确性、风格一致性和可执行性。", "阶段二审核需覆盖角色关键字段、场景 2x2 规划、参考图一致性锁定和资产唯一性。", [
                sourceFile("skills/art-direction-review-skill/SKILL.md", "skill", "阶段二业务审核规范。"),
            ]),
            gate(
                "seedance-prompt-review",
                "Seedance 提示词业务审核",
                ["seedance-storyboard"],
                "逐条比对导演讲戏本，预演 Seedance 生成效果，审核提示词结构、运镜、节奏和素材引用。",
                "阶段三审核需覆盖场次处理锁、工业化预检、2-7 个分镜、时间预算、兜底约束和敏感内容转译。",
                [sourceFile("skills/seedance-prompt-review-skill/SKILL.md", "skill", "阶段三业务审核规范。")],
            ),
            gate("compliance-review", "合规审核", ["director-analysis", "art-design", "seedance-storyboard"], "每阶段业务审核后检查平台内容红线。", "合规处理只能做风险转译，不能删除剧情功能；业务和合规都 PASS 才能进入下一阶段。", [
                sourceFile("skills/compliance-review-skill/SKILL.md", "skill", "各阶段合规审核规范。"),
            ]),
            gate("scene-by-scene-lock", "阶段三场次推进锁", ["seedance-storyboard"], "阶段三必须按场次 / 子场次推进，不能整集一次性生成到底。", "每个场次 / 子场次先写场次视觉 DNA，再写生成 P，并保留审核证据。", [
                sourceFile("AGENTS.md", "config", "阶段三强制执行锁。"),
            ]),
            gate("industrial-quality-precheck", "工业化质检预检", ["seedance-storyboard"], "阶段三开始前、场次开写前、单 P 完成后、导演审核前调用工业化质检规范。", "记录台词核对、空间状态追踪、抽象转译、拆 P 负载预判和导演审核前预检结论。", [
                sourceFile("skills/seedance-storyboard-skill/industrial-quality-rules.md", "guide", "阶段三工业化质检规范包。"),
                sourceFile("tools/workflow_gate.py", "tool", "质量门 pre / post 入口。"),
            ]),
            gate("asset-uniqueness-check", "资产唯一性检查", ["art-design", "seedance-storyboard"], "不同功能、形态、叙事用途的角色 / 道具 / 机器人不能错误合并。", "需说明复用理由；无法说明时按新增资产处理。", [
                sourceFile("AGENTS.md", "config", "资产唯一性强制检查。"),
                sourceFile("tools/asset_index.py", "tool", "素材索引和重复 ID 预检。"),
            ]),
        ],
        sourceFiles,
        sourceRoot,
        importedAt,
        enabled: false,
        selected: false,
    };
}

export function buildSeedanceOriginalFormatDirectorMethodV5Preset(): AgentWorkflowPreset {
    const sourceFiles = uniqueSourceFiles([
        sourceFile("AGENTS.md", "config", "原提示词格式锁、三阶段输出和禁止项。"),
        sourceFile("config/workflow.yaml", "config", "v5.1 三阶段流程、hard locks 和必读清单。"),
        sourceFile("tools/workflow_validate.py", "tool", "阶段原格式质量门校验。"),
        sourceFile("tools/export_copy_only.py", "tool", "从清道夫 V4.3 主文件导出 copy-only。"),
        ...v5Stage1SourceFiles(),
        ...v5Stage2SourceFiles(),
        ...v5Stage3SourceFiles(),
    ]);
    return {
        workflowId: SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID,
        name: "Seedance 原格式导演方法 v5",
        version: "5.1.0",
        description: "并行接入 seedance-original-workflow-plus-director-method-v5：保留现有三阶段流程 ID，但强化原提示词格式锁、导演方法包、@图N 引用和 copy-only 导出；不启用剧情合规审核 gate。",
        stages: [
            {
                stageId: "director-analysis",
                name: "导演方法真分镜",
                agentId: "director",
                order: 1,
                purpose: "基于导演方法包输出导演分析、Beat Board、真分镜脚本和用户修改轨。",
                inputSummary: "本集剧本、原格式锁、导演方法卡、场景类型 playbook 和真分镜规则。",
                outputSummary: "01A 导演分析、01B Beat Board、01C 真分镜脚本、01D 用户修改轨。",
                requiredSkills: ["original-prompt-format-lock", "director-method-shot-skill"],
                qualityGateIds: ["v5-stage-spec-read-record", "v5-director-method-shot-gate"],
            },
            {
                stageId: "art-design",
                name: "原格式服化道",
                agentId: "art-designer",
                order: 2,
                purpose: "沿用原工作流图片提示词格式，输出人物提示词和场景 / 互动道具提示词。",
                inputSummary: "01A / 01B / 01C / 01D、原格式锁、服化道模板和示例。",
                outputSummary: "assets/character-prompts.md 与 assets/scene-prompts.md；互动道具写入 scene-prompts 的对应章节。",
                requiredSkills: ["original-prompt-format-lock", "art-design-skill"],
                qualityGateIds: ["v5-stage-spec-read-record", "v5-original-art-prompt-format", "v5-asset-uniqueness-check"],
            },
            {
                stageId: "seedance-storyboard",
                name: "原清道夫 V4.3 Seedance",
                agentId: "storyboard-artist",
                order: 3,
                purpose: "按场次 / 子场次输出原清道夫 V4.3 Seedance 2.0 提示词，并导出 copy-only。",
                inputSummary: "导演真分镜、原格式服化道资产提示词、Seedance 模板、方法论和工业化质检规则。",
                outputSummary: "02-seedance-prompts.md 与 02-seedance-copy-only.md，使用 @图N 引用。",
                requiredSkills: ["original-prompt-format-lock", "seedance-storyboard-skill"],
                qualityGateIds: ["v5-stage-spec-read-record", "v5-scene-by-scene-lock", "v5-industrial-quality-precheck", "v5-original-seedance-prompt-format"],
            },
        ],
        agents: [
            {
                agentId: "director",
                name: "导演 / director",
                role: "导演方法 + 真分镜",
                responsibility: "输出 01A/01B/01C/01D；每个场次包含 method_plan，每个 Shot 包含 method_tags 与 method_reason。",
                systemPromptSummary: "资深影视导演，使用导演方法包转化镜头策略，不写最终图片或 Seedance 提示词。",
                sourceFile: "specs/agents/director.md",
            },
            {
                agentId: "art-designer",
                name: "服化道 / art-designer",
                role: "原格式图片提示词",
                responsibility: "读取阶段一四个文件，输出原格式 character-prompts.md 与 scene-prompts.md。",
                systemPromptSummary: "严格沿用 art-design-template，不输出 v3 图片提示词文件，不因待确认阻断 Stage 2。",
                sourceFile: "specs/agents/art-designer.md",
            },
            {
                agentId: "storyboard-artist",
                name: "分镜师 / storyboard-artist",
                role: "原清道夫 V4.3 Seedance 提示词",
                responsibility: "输出 02-seedance-prompts.md，使用 @图N，并额外导出 copy-only。",
                systemPromptSummary: "按场次生成单 P 视觉 DNA、任务卡和一键复制正文，控制内部术语与引用数量。",
                sourceFile: "specs/agents/storyboard-artist.md",
            },
        ],
        skills: [
            skill("original-prompt-format-lock", "原提示词格式锁", "锁定原工作流图片提示词和 Seedance 清道夫 V4.3 格式，禁止简化替代格式。", [sourceFile("specs/skills/original-prompt-format-lock/SKILL.md", "skill", "原格式锁。")]),
            skill("director-method-shot-skill", "导演方法真分镜技能", "导演方法选择、method_plan、Shot 级 method_tags / method_reason 和真分镜脚本。", v5Stage1SourceFiles(["specs/skills/director-method-shot-skill/SKILL.md", "specs/knowledge/director-methods/director_method_cards.md", "specs/knowledge/director-methods/director_methods.json", "specs/knowledge/director-methods/scene_type_playbook.md", "specs/knowledge/director-methods/shot_script_method_rules.md", "specs/knowledge/director-methods/method_selection_matrix.csv"])),
            skill("art-design-skill", "原格式服化道技能", "沿用原工作流人物、场景和互动道具提示词格式。", v5Stage2SourceFiles(["specs/skills/art-design-skill/SKILL.md", "specs/skills/art-design-skill/templates/art-design-template.md", "specs/skills/art-design-skill/examples/character-prompt-examples.md", "specs/skills/art-design-skill/examples/scene-prompt-examples.md"])),
            skill("seedance-storyboard-skill", "原清道夫 V4.3 Seedance 技能", "输出原格式 Seedance 2.0 提示词、工业化预检、单 P 任务卡和 copy-only。", v5Stage3SourceFiles(["specs/skills/seedance-storyboard-skill/SKILL.md", "specs/skills/seedance-storyboard-skill/templates/seedance-prompts-template.md", "specs/skills/seedance-storyboard-skill/seedance-prompt-methodology.md", "specs/skills/seedance-storyboard-skill/industrial-quality-rules.md", "specs/skills/seedance-storyboard-skill/examples/seedance-prompt-examples.md"])),
        ],
        qualityGates: [
            gate("v5-stage-spec-read-record", "v5 规范读取记录", ["director-analysis", "art-design", "seedance-storyboard"], "每阶段开始前记录原格式锁和本阶段必读规范。", "未读取原格式锁和阶段必读文件时不得通过。", [
                sourceFile("AGENTS.md", "config", "v5 必读规则。"),
                sourceFile("config/workflow.yaml", "config", "v5 必读清单。"),
            ]),
            gate("v5-director-method-shot-gate", "导演方法真分镜检查", ["director-analysis"], "检查 01A/01B/01C/01D、method_plan、method_tags 和 method_reason。", "Stage 1 必须输出四个导演文件，待确认不是 Stage 2/3 阻断。", v5Stage1SourceFiles(["specs/skills/director-method-shot-skill/SKILL.md"])),
            gate("v5-original-art-prompt-format", "原格式服化道检查", ["art-design"], "检查 character-prompts.md 与 scene-prompts.md 是否沿用原模板。", "不得输出 character-image-prompts.md、scene-image-prompts.md 或 prop-image-prompts.md。", v5Stage2SourceFiles(["specs/skills/art-design-skill/templates/art-design-template.md"])),
            gate("v5-asset-uniqueness-check", "资产唯一性检查", ["art-design", "seedance-storyboard"], "检查角色、场景和互动道具没有错误合并。", "互动道具写入 scene-prompts.md 的互动道具章节，不单独输出 prop 文件。", [
                sourceFile("AGENTS.md", "config", "资产唯一性与禁止输出。"),
            ]),
            gate("v5-scene-by-scene-lock", "阶段三场次推进锁", ["seedance-storyboard"], "阶段三按场次 / 子场次推进，不能整集一次性生成到底。", "每个场次先写视觉 DNA，再写生成 P 和单 P 任务卡。", [
                sourceFile("AGENTS.md", "config", "阶段三推进锁。"),
            ]),
            gate("v5-industrial-quality-precheck", "工业化质检预检", ["seedance-storyboard"], "阶段三按工业化质检规则留痕。", "记录阶段开始、场次开始、单 P 生成后和导演审核前的质检节点。", v5Stage3SourceFiles(["specs/skills/seedance-storyboard-skill/industrial-quality-rules.md"])),
            gate("v5-original-seedance-prompt-format", "原清道夫 V4.3 格式检查", ["seedance-storyboard"], "检查 02-seedance-prompts.md、@图N 引用和 copy-only 导出。", "不得输出 02-seedance-final-prompts.md，不得使用 @图片N。", [
                sourceFile("specs/skills/seedance-storyboard-skill/templates/seedance-prompts-template.md", "template", "原清道夫 V4.3 模板。"),
                sourceFile("tools/export_copy_only.py", "tool", "copy-only 导出工具。"),
            ]),
        ],
        sourceFiles,
        sourceRoot: v5SourceRoot,
        importedAt: "2026-06-15T00:00:00.000Z",
        enabled: false,
        selected: false,
    };
}

export function resolveWorkflowPreset(workflowId: string, selections: AgentWorkflowPresetSelection[] = []) {
    const preset = builtInAgentWorkflowPresets().find((item) => item.workflowId === workflowId);
    if (!preset) return undefined;
    return applyWorkflowPresetSelection(
        preset,
        selections.find((item) => item.workflowId === workflowId),
    );
}

export function applyWorkflowPresetSelection(preset: AgentWorkflowPreset, selection?: AgentWorkflowPresetSelection): AgentWorkflowPreset {
    if (!selection) return preset;
    return {
        ...preset,
        enabled: selection.enabled,
        selected: selection.selected,
    };
}

export function normalizeWorkflowPresetSelection(selection: AgentWorkflowPresetSelection): AgentWorkflowPresetSelection {
    const fallback = builtInAgentWorkflowPresets().find((preset) => preset.workflowId === selection.workflowId) || buildSeedanceWorkflowPreset();
    return {
        workflowId: selection.workflowId || fallback.workflowId,
        projectId: selection.projectId,
        enabled: Boolean(selection.enabled),
        selected: Boolean(selection.selected),
        updatedAt: selection.updatedAt || new Date().toISOString(),
    };
}

export function sortedWorkflowStages(preset: Pick<AgentWorkflowPreset, "stages">) {
    return [...preset.stages].sort((a, b) => a.order - b.order);
}

export function workflowStageDetail(preset: AgentWorkflowPreset, stage: AgentWorkflowStage) {
    return {
        stage,
        agent: preset.agents.find((agent) => agent.agentId === stage.agentId),
        skills: stage.requiredSkills.map((skillId) => preset.skills.find((skill) => skill.skillId === skillId)).filter((item): item is AgentWorkflowSkill => Boolean(item)),
        qualityGates: stage.qualityGateIds.map((gateId) => preset.qualityGates.find((gate) => gate.gateId === gateId)).filter((item): item is AgentWorkflowQualityGate => Boolean(item)),
    };
}

function skill(skillId: string, name: string, summary: string, sourceFiles: AgentWorkflowSourceFile[]): AgentWorkflowSkill {
    return { skillId, name, purpose: summary, summary, sourceFiles };
}

function gate(gateId: string, name: string, stageIds: string[], purpose: string, summary: string, sourceFiles: AgentWorkflowSourceFile[]): AgentWorkflowQualityGate {
    return { gateId, name, stageIds, purpose, summary, sourceFiles };
}

function stage1SourceFiles(only?: string[]) {
    return filterSources(
        [
            sourceFile("AGENTS.md", "config", "主流程、审核证据和强制执行锁。"),
            sourceFile("agents/director.md", "agent", "导演 Agent。"),
            sourceFile("skills/director-skill/SKILL.md", "skill", "导演分析技能。"),
            sourceFile("skills/director-skill/templates/director-analysis-template.md", "template", "导演分析输出模板。"),
            sourceFile("skills/script-analysis-review-skill/SKILL.md", "skill", "阶段一业务审核。"),
            sourceFile("skills/compliance-review-skill/SKILL.md", "skill", "合规审核。"),
        ],
        only,
    );
}

function stage2SourceFiles(only?: string[]) {
    return filterSources(
        [
            sourceFile("AGENTS.md", "config", "主流程、审核证据和强制执行锁。"),
            sourceFile("agents/art-designer.md", "agent", "服化道 Agent。"),
            sourceFile("agents/director.md", "agent", "导演审核 Agent。"),
            sourceFile("skills/art-design-skill/SKILL.md", "skill", "服化道设计技能。"),
            sourceFile("skills/art-design-skill/gemini-image-prompt-guide.md", "guide", "图片提示词指南。"),
            sourceFile("skills/art-design-skill/examples/character-prompt-examples.md", "example", "角色提示词示例。"),
            sourceFile("skills/art-design-skill/examples/scene-prompt-examples.md", "example", "场景提示词示例。"),
            sourceFile("skills/art-design-skill/templates/art-design-template.md", "template", "服化道输出模板。"),
            sourceFile("skills/art-direction-review-skill/SKILL.md", "skill", "阶段二业务审核。"),
            sourceFile("skills/compliance-review-skill/SKILL.md", "skill", "合规审核。"),
        ],
        only,
    );
}

function stage3SourceFiles(only?: string[]) {
    return filterSources(
        [
            sourceFile("AGENTS.md", "config", "主流程、审核证据和强制执行锁。"),
            sourceFile("agents/storyboard-artist.md", "agent", "分镜师 Agent。"),
            sourceFile("agents/director.md", "agent", "导演审核 Agent。"),
            sourceFile("skills/seedance-storyboard-skill/SKILL.md", "skill", "Seedance 分镜技能。"),
            sourceFile("skills/seedance-storyboard-skill/seedance-prompt-methodology.md", "guide", "Seedance 提示词方法论。"),
            sourceFile("skills/seedance-storyboard-skill/industrial-quality-rules.md", "guide", "工业化质检规范包。"),
            sourceFile("skills/seedance-storyboard-skill/examples/seedance-prompt-examples.md", "example", "Seedance 提示词示例。"),
            sourceFile("skills/seedance-storyboard-skill/templates/seedance-prompts-template.md", "template", "Seedance 输出模板。"),
            sourceFile("skills/seedance-prompt-review-skill/SKILL.md", "skill", "阶段三业务审核。"),
            sourceFile("skills/compliance-review-skill/SKILL.md", "skill", "合规审核。"),
        ],
        only,
    );
}

function v5Stage1SourceFiles(only?: string[]) {
    return filterSources(
        [
            sourceFile("AGENTS.md", "config", "v5 原格式锁、必读文件和待确认规则。"),
            sourceFile("specs/agents/director.md", "agent", "导演方法 + 真分镜 Agent。"),
            sourceFile("specs/skills/original-prompt-format-lock/SKILL.md", "skill", "原提示词格式锁。"),
            sourceFile("specs/skills/director-method-shot-skill/SKILL.md", "skill", "导演方法真分镜技能。"),
            sourceFile("specs/knowledge/director-methods/director_method_cards.md", "guide", "导演方法卡。"),
            sourceFile("specs/knowledge/director-methods/director_methods.json", "guide", "导演方法结构数据。"),
            sourceFile("specs/knowledge/director-methods/scene_type_playbook.md", "guide", "场景类型 playbook。"),
            sourceFile("specs/knowledge/director-methods/shot_script_method_rules.md", "guide", "真分镜规则。"),
            sourceFile("specs/knowledge/director-methods/method_selection_matrix.csv", "guide", "方法选择矩阵。"),
        ],
        only,
    );
}

function v5Stage2SourceFiles(only?: string[]) {
    return filterSources(
        [
            sourceFile("AGENTS.md", "config", "v5 原格式锁、禁止输出和待确认规则。"),
            sourceFile("specs/agents/art-designer.md", "agent", "原格式服化道 Agent。"),
            sourceFile("specs/skills/original-prompt-format-lock/SKILL.md", "skill", "原提示词格式锁。"),
            sourceFile("specs/skills/art-design-skill/SKILL.md", "skill", "服化道技能。"),
            sourceFile("specs/skills/art-design-skill/templates/art-design-template.md", "template", "原格式服化道模板。"),
            sourceFile("specs/skills/art-design-skill/examples/character-prompt-examples.md", "example", "人物提示词示例。"),
            sourceFile("specs/skills/art-design-skill/examples/scene-prompt-examples.md", "example", "场景提示词示例。"),
        ],
        only,
    );
}

function v5Stage3SourceFiles(only?: string[]) {
    return filterSources(
        [
            sourceFile("AGENTS.md", "config", "v5 原格式锁、@图N 和 copy-only 规则。"),
            sourceFile("specs/agents/storyboard-artist.md", "agent", "原清道夫 V4.3 Seedance Agent。"),
            sourceFile("specs/skills/original-prompt-format-lock/SKILL.md", "skill", "原提示词格式锁。"),
            sourceFile("specs/skills/seedance-storyboard-skill/SKILL.md", "skill", "Seedance 分镜技能。"),
            sourceFile("specs/skills/seedance-storyboard-skill/templates/seedance-prompts-template.md", "template", "Seedance 清道夫 V4.3 模板。"),
            sourceFile("specs/skills/seedance-storyboard-skill/industrial-quality-rules.md", "guide", "工业化质检规则。"),
            sourceFile("specs/skills/seedance-storyboard-skill/seedance-prompt-methodology.md", "guide", "Seedance 提示词方法论。"),
            sourceFile("specs/skills/seedance-storyboard-skill/examples/seedance-prompt-examples.md", "example", "Seedance 提示词示例。"),
            sourceFile("tools/export_copy_only.py", "tool", "copy-only 导出工具。"),
        ],
        only,
    );
}

function sourceFile(path: string, category: AgentWorkflowSourceFile["category"], summary: string): AgentWorkflowSourceFile {
    return { path, category, summary };
}

function filterSources(files: AgentWorkflowSourceFile[], only?: string[]) {
    if (!only) return files;
    const allowed = new Set(only);
    return files.filter((file) => allowed.has(file.path));
}

function uniqueSourceFiles(files: AgentWorkflowSourceFile[]) {
    const byPath = new Map<string, AgentWorkflowSourceFile>();
    for (const file of files) {
        if (!byPath.has(file.path)) byPath.set(file.path, file);
    }
    return Array.from(byPath.values());
}
