import type { AgentConfigKind } from "./agent-settings";

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

export type AgentWorkflowAgentBinding = {
    bindingId: string;
    stageId: string;
    agentId: string;
    agentConfigKind: AgentConfigKind;
    agentVersion: string;
    inputContract: string;
    outputContract: string;
    switchable: boolean;
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
    agentBindings: AgentWorkflowAgentBinding[];
    skills: AgentWorkflowSkill[];
    qualityGates: AgentWorkflowQualityGate[];
    sourceFiles: AgentWorkflowSourceFile[];
    sourceRoot: string;
    importedAt: string;
    enabled: boolean;
    selected: boolean;
};

export const SEEDANCE_WORKFLOW_PRESET_ID = "seedance-2-multi-agent-storyboard-team";
export const SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID = "seedance-original-format-director-method-v5";
export const SEEDANCE_MX_SHELL_STORYBOARD_V15_PRESET_ID = "seedance-mx-shell-storyboard-v1-5";
export const SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID = "seedance-original-format-emotion-director-v2-1";
export const SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID = "seedance-mx-shell-emotion-director-v2-1";

export const SEEDANCE_WORKFLOW_SOURCE_ROOT = "/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/86.废才Seedance 2.0 AI 分镜师团队";
export const SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_SOURCE_ROOT = "/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/hc工作流-新版/seedance-original-workflow-plus-director-method-v5";
export const SEEDANCE_MX_SHELL_STORYBOARD_V15_SOURCE_ROOT = "/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/Mx-Shell_Prompts_v1.5.md";
export const EMOTION_DIRECTOR_SKILL_SOURCE_ROOT = "/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/情绪导演_Skill_V2.1.md";
const MX_SHELL_PROMPTS_SOURCE_FILE = "Mx-Shell_Prompts_v1.5.md";
export const EMOTION_DIRECTOR_SKILL_ID = "emotion-director-skill";
const EMOTION_DIRECTOR_SKILL_SOURCE_FILE = "情绪导演_Skill_V2.1.md";
const importedAt = "2026-06-06T00:00:00.000Z";

export function builtInAgentWorkflowPresets(): AgentWorkflowPreset[] {
    return [buildSeedanceWorkflowPreset(), buildSeedanceOriginalFormatDirectorMethodV5Preset(), buildSeedanceOriginalFormatEmotionDirectorV21Preset(), buildSeedanceMxShellStoryboardV15Preset(), buildSeedanceMxShellEmotionDirectorV21Preset()];
}

export function buildSeedanceWorkflowPreset(): AgentWorkflowPreset {
    const sourceFiles = uniqueSourceFiles([
        sourceFile("project.config.json", "config", "声明主链需要读取的 agent、skill、template、example 与工具配置。"),
        sourceFile("AGENTS.md", "config", "定义制片人调度、阶段流程、阶段门禁和强制执行锁。"),
        sourceFile("tools/README.md", "tool", "说明 workflow guard、quality gate、spec cache、asset index 等工具入口。"),
        ...scriptStageSourceFiles(),
        ...stage1SourceFiles(),
        ...stage2SourceFiles(),
        ...stage3SourceFiles(),
    ]);
    return {
        workflowId: SEEDANCE_WORKFLOW_PRESET_ID,
        name: "Seedance 2.0 分镜师团队",
        version: "1.0.0",
        description: "将 script-optimizer、art-designer、storyboard-artist 导入为项目内可查看、可选择、可保存的主 Agent workflow 预设；导演分析不再作为独立阶段，导演 Skill 下沉到服化道和分镜阶段。",
        stages: [
            {
                stageId: "script-adaptation",
                name: "剧本适配",
                agentId: "script-optimizer",
                order: 1,
                purpose: "把用户导入的原始剧本整理成 AI 剧本母版和 structuredScript，作为导演、美术和分镜的稳定输入。",
                inputSummary: "本集原始剧本、剧本优化 Agent 规则、AI 剧本白皮书和下游生产备注要求。",
                outputSummary: "productionScript、structuredScript、场次 / 人物 / 道具连续性和下游生产备注。",
                requiredSkills: ["script-optimizer-skill"],
                qualityGateIds: ["script-adaptation-read-record", "script-production-draft-check"],
            },
            {
                stageId: "art-design",
                name: "服化道美术设计",
                agentId: "art-designer",
                order: 2,
                purpose: "直接读取剧本母版，先用导演讲戏 Skill 锁定人物、空间、道具和连续性，再输出角色、场景、道具参考图提示词。",
                inputSummary: "本集剧本母版、导演执行模板、Gemini 图片提示词指南、角色与场景示例、服化道模板。",
                outputSummary: "内置导演讲戏摘要、人物设定提示词、2x2 场景规划提示词、道具提示词和阶段审核证据。",
                requiredSkills: ["director-skill", "art-design-skill", "script-analysis-review-skill", "art-direction-review-skill", "compliance-review-skill"],
                qualityGateIds: ["stage-spec-read-record", "director-business-review", "art-direction-review", "compliance-review", "asset-uniqueness-check"],
            },
            {
                stageId: "seedance-storyboard",
                name: "Seedance 分镜师",
                agentId: "storyboard-artist",
                order: 3,
                purpose: "直接读取剧本母版和美术参考，先用导演讲戏 Skill 锁定戏剧节拍和调度，再转成 Seedance 2.0 动态提示词。",
                inputSummary: "本集剧本母版、角色 / 场景 / 道具参考提示词、导演执行模板、Seedance 方法论、工业化质检规范、示例和输出模板。",
                outputSummary: "内置导演讲戏摘要、场次视觉 DNA、生成 P / 镜头 P 拆分表、单 P 任务卡、一键复制提示词和阶段审核证据。",
                requiredSkills: ["director-skill", "seedance-storyboard-skill", "script-analysis-review-skill", "seedance-prompt-review-skill", "compliance-review-skill"],
                qualityGateIds: ["stage-spec-read-record", "director-business-review", "scene-by-scene-lock", "industrial-quality-precheck", "seedance-prompt-review", "compliance-review"],
            },
        ],
        agents: [
            {
                agentId: "script-optimizer",
                name: "剧本 / script-optimizer",
                role: "AI 剧本母版适配",
                responsibility: "把原始剧本整理为可人工审读、可被后续 Agent 稳定读取的生产稿和结构化剧本。",
                systemPromptSummary: "短剧剧本适配 Agent，保留原剧情事实、台词顺序和场次边界，输出常规剧本正文、分行制作备注和母版质检记录。",
                sourceFile: "web/src/app/(user)/projects/agent-settings.ts",
            },
            {
                agentId: "art-designer",
                name: "服化道 / art-designer",
                role: "导演讲戏 + 影视美术设定",
                responsibility: "先用导演 Skill 从剧本锁定人物、场景、道具、调度和连续性，再转化为可生成参考图的结构化提示词。",
                systemPromptSummary: "专业服装、化妆、道具、场景设定师，强调角色定妆板、2x2 场景规划和参考图绑定边界。",
                sourceFile: "agents/art-designer.md",
            },
            {
                agentId: "storyboard-artist",
                name: "分镜师 / storyboard-artist",
                role: "导演讲戏 + Seedance 动态提示词编写",
                responsibility: "先用导演 Skill 锁定戏剧节拍、调度和镜头感觉，再按场次 / 子场次拆生成 P，编写带 @引用的 Seedance 2.0 视频提示词。",
                systemPromptSummary: "影视分镜师，负责把导演讲戏翻译成 4-15 秒、单一主运镜、素材引用明确的 Seedance 生成脚本。",
                sourceFile: "agents/storyboard-artist.md",
            },
        ],
        agentBindings: [
            binding("script-adaptation", "script-optimizer", "script_optimizer", "1.0.0", "原始本集剧本", "AI 剧本母版 / structuredScript"),
            binding("art-design", "art-designer", "asset_extractor", "1.0.0", "AI 剧本母版 / 内置导演讲戏", "人物 / 场景 / 道具参考图提示词"),
            binding("seedance-storyboard", "storyboard-artist", "storyboard_director", "1.0.0", "AI 剧本母版 / 内置导演讲戏 / 美术资产", "Seedance 分镜提示词 / 视频配置草案"),
        ],
        skills: [
            skill("script-optimizer-skill", "剧本适配技能", "AI 剧本母版、structuredScript、场次边界、台词保留、空间 / 道具连续性和下游生产备注。", scriptStageSourceFiles()),
            skill("director-skill", "导演执行技能", "内置导演讲戏、剧情段落卡、人物 / 场景 / 道具清单和连续性锁定。", stage1SourceFiles(["skills/director-skill/SKILL.md", "skills/director-skill/templates/director-analysis-template.md"])),
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
            skill("script-analysis-review-skill", "内置导演讲戏自审技能", "审核内置导演讲戏是否覆盖剧情、人物、场景、连续性和下游执行建议。", [sourceFile("skills/script-analysis-review-skill/SKILL.md", "skill", "内置导演业务审核规范。")]),
            skill("art-direction-review-skill", "服化道审核技能", "审核人物造型、场景规划、风格一致性和提示词可执行性。", [sourceFile("skills/art-direction-review-skill/SKILL.md", "skill", "阶段二业务审核规范。")]),
            skill("seedance-prompt-review-skill", "Seedance 提示词审核技能", "审核阶段三提示词的规范性、运镜节奏、叙事连贯和素材引用。", [sourceFile("skills/seedance-prompt-review-skill/SKILL.md", "skill", "阶段三业务审核规范。")]),
            skill("compliance-review-skill", "合规审核技能", "检查 Seedance 与 Gemini 平台红线，并要求用风险转译保留叙事功能。", [sourceFile("skills/compliance-review-skill/SKILL.md", "skill", "各阶段合规审核规范。")]),
        ],
        qualityGates: [
            gate("script-adaptation-read-record", "剧本适配规范读取", ["script-adaptation"], "记录剧本优化 Agent 设定、白皮书规则和结构化输出要求。", "未读取剧本适配规则时不得通过。", scriptStageSourceFiles()),
            gate(
                "script-production-draft-check",
                "剧本生产稿检查",
                ["script-adaptation"],
                "检查 productionScript / structuredScript 是否保留原剧情并补齐生产信息。",
                "不得输出导演分析、资产清单或分镜提示词；不得改写核心剧情和台词顺序。",
                scriptStageSourceFiles(["web/src/app/(user)/projects/script-optimizer-agent.ts"]),
            ),
            gate("stage-spec-read-record", "规范读取记录", ["art-design", "seedance-storyboard"], "每阶段开始前记录读取的 agent、skill、template、example 和上游输入文件。", "未记录本阶段规范读取路径时，阶段不得开始或 PASS。", [
                sourceFile("AGENTS.md", "config", "阶段规范读取记录要求。"),
                sourceFile("project.config.json", "config", "旧工作流 specFiles 清单。"),
            ]),
            gate("director-business-review", "内置导演业务审核", ["art-design", "seedance-storyboard"], "检查内置导演讲戏是否覆盖剧情、人物、场景、道具、连续性和下游执行建议。", "服化道与分镜阶段都必须保留导演讲戏自审结论。", [
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
            gate("compliance-review", "合规审核", ["art-design", "seedance-storyboard"], "每阶段业务审核后检查平台内容红线。", "合规处理只能做风险转译，不能删除剧情功能；业务和合规都 PASS 才能进入下一阶段。", [
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
        sourceRoot: SEEDANCE_WORKFLOW_SOURCE_ROOT,
        importedAt,
        enabled: false,
        selected: false,
    };
}

export function buildSeedanceOriginalFormatDirectorMethodV5Preset(): AgentWorkflowPreset {
    const sourceFiles = uniqueSourceFiles([
        sourceFile("AGENTS.md", "config", "原提示词格式锁、主链输出和禁止项。"),
        sourceFile("config/workflow.yaml", "config", "v5.2 主链流程、hard locks 和必读清单。"),
        sourceFile("config/quality-gates.yaml", "config", "v5.2 阶段质量门和 Skill 5 标记清单。"),
        sourceFile("tools/workflow_validate.py", "tool", "阶段原格式质量门校验。"),
        sourceFile("tools/export_copy_only.py", "tool", "从 Skill 5 一键复制代码块导出 copy-only。"),
        ...v5ScriptStageSourceFiles(),
        ...v5Stage1SourceFiles(),
        ...v5Stage2SourceFiles(),
        ...v5Stage3SourceFiles(),
    ]);
    return {
        workflowId: SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID,
        name: "Seedance Skill 5 轻量分镜 v5.2",
        version: "5.2.0",
        description: "接入 seedance-original-workflow-plus-director-method-v5 的优化版：把剧本适配纳入主 Agent 链，保留原图片资产格式、导演方法包、@图N 引用和 copy-only 导出；导演方法不再独立成阶段，而是下沉到服化道和 Skill 5 分镜。",
        stages: [
            {
                stageId: "script-adaptation",
                name: "剧本适配",
                agentId: "script-optimizer",
                order: 1,
                purpose: "先把原始剧本整理成 AI 剧本母版和 structuredScript，保证导演方法、原格式服化道和 Skill 5 分镜读取同一版剧本。",
                inputSummary: "本集原始剧本、v5 原格式锁、剧本优化 Agent 规则和 AI 剧本白皮书。",
                outputSummary: "productionScript、structuredScript、场次边界、台词保留、空间 / 道具连续性和下游生产备注。",
                requiredSkills: ["script-optimizer-skill", "original-prompt-format-lock"],
                qualityGateIds: ["v5-stage-spec-read-record", "v5-script-production-draft-check"],
            },
            {
                stageId: "art-design",
                name: "原格式服化道",
                agentId: "art-designer",
                order: 2,
                purpose: "先用导演方法包锁定 Beat、调度和资产需求，再沿用原工作流图片提示词格式输出人物、场景和互动道具提示词。",
                inputSummary: "AI 剧本母版、原格式锁、导演方法卡、场景类型 playbook、服化道模板和示例。",
                outputSummary: "内置导演方法摘要、assets/character-prompts.md 与 assets/scene-prompts.md；互动道具写入 scene-prompts 的对应章节。",
                requiredSkills: ["original-prompt-format-lock", "director-method-shot-skill", "art-design-skill"],
                qualityGateIds: ["v5-stage-spec-read-record", "v5-director-method-shot-gate", "v5-original-art-prompt-format", "v5-asset-uniqueness-check"],
            },
            {
                stageId: "seedance-storyboard",
                name: "Skill 5 轻量分镜",
                agentId: "storyboard-artist",
                order: 3,
                purpose: "先用导演方法包锁定 Beat、调度、method_tags 和镜头策略，再按剧情动作单元输出 Skill 5 轻量分镜并导出 copy-only。",
                inputSummary: "AI 剧本母版、原格式服化道资产提示词、导演方法包、Skill 5 分镜技能和输出模板。",
                outputSummary: "内置导演方法摘要、02-seedance-prompts.md 与 02-seedance-copy-only.md，使用 @图N 引用和一键复制代码块。",
                requiredSkills: ["original-prompt-format-lock", "director-method-shot-skill", "seedance-storyboard-skill"],
                qualityGateIds: ["v5-stage-spec-read-record", "v5-director-method-shot-gate", "v5-scene-by-scene-lock", "v5-skill5-seedance-prompt-format"],
            },
        ],
        agents: [
            {
                agentId: "script-optimizer",
                name: "剧本 / script-optimizer",
                role: "AI 剧本母版适配",
                responsibility: "在 v5.2 主链最前置整理剧本，输出可人工确认、可供导演方法和 Skill 5 稳定读取的 productionScript / structuredScript。",
                systemPromptSummary: "短剧剧本适配 Agent，保留原剧情事实、台词顺序和场次边界，输出常规剧本正文、分行制作备注和母版质检记录。",
                sourceFile: "web/src/app/(user)/projects/agent-settings.ts",
            },
            {
                agentId: "art-designer",
                name: "服化道 / art-designer",
                role: "导演方法 + 原格式图片提示词",
                responsibility: "先用导演方法包拆 Beat、调度和资产需求，再输出原格式 character-prompts.md 与 scene-prompts.md。",
                systemPromptSummary: "严格沿用 art-design-template，不输出 v3 图片提示词文件，导演方法只服务资产需求和连续性。",
                sourceFile: "specs/agents/art-designer.md",
            },
            {
                agentId: "storyboard-artist",
                name: "分镜师 / storyboard-artist",
                role: "导演方法 + Skill 5 轻量视频分镜",
                responsibility: "先用导演方法包拆 Beat、method_tags 和镜头策略，再输出 Skill 5 通用版 02-seedance-prompts.md 与 copy-only。",
                systemPromptSummary: "按剧情动作单元输出大分镜、情绪锚点、6 字段分镜和干净的一键复制正文，导演方法服务镜头策略。",
                sourceFile: "specs/agents/storyboard-artist.md",
            },
        ],
        agentBindings: [
            binding("script-adaptation", "script-optimizer", "script_optimizer", "5.2.0", "原始本集剧本", "AI 剧本母版 / structuredScript"),
            binding("art-design", "art-designer", "asset_extractor", "5.2.0", "AI 剧本母版 / 导演方法 / 原格式锁", "character-prompts.md / scene-prompts.md"),
            binding("seedance-storyboard", "storyboard-artist", "storyboard_director", "5.2.0", "AI 剧本母版 / 导演方法 / 原格式资产", "Skill 5 Seedance 提示词 / copy-only"),
        ],
        skills: [
            skill("script-optimizer-skill", "剧本适配技能", "AI 剧本母版、structuredScript、场次边界、台词保留、空间 / 道具连续性和下游生产备注。", v5ScriptStageSourceFiles()),
            skill("original-prompt-format-lock", "原提示词格式锁", "锁定原图片提示词格式、Skill 5 阶段三结构和 @图N 引用，禁止输出旧文件名。", [sourceFile("specs/skills/original-prompt-format-lock/SKILL.md", "skill", "原格式锁。")]),
            skill(
                "director-method-shot-skill",
                "导演方法真分镜技能",
                "导演方法选择、method_plan、Shot 级 method_tags / method_reason 和真分镜脚本。",
                v5Stage1SourceFiles([
                    "specs/skills/director-method-shot-skill/SKILL.md",
                    "specs/knowledge/director-methods/director_method_cards.md",
                    "specs/knowledge/director-methods/director_methods.json",
                    "specs/knowledge/director-methods/scene_type_playbook.md",
                    "specs/knowledge/director-methods/shot_script_method_rules.md",
                    "specs/knowledge/director-methods/method_selection_matrix.csv",
                ]),
            ),
            skill(
                "art-design-skill",
                "原格式服化道技能",
                "沿用原工作流人物、场景和互动道具提示词格式。",
                v5Stage2SourceFiles([
                    "specs/skills/art-design-skill/SKILL.md",
                    "specs/skills/art-design-skill/templates/art-design-template.md",
                    "specs/skills/art-design-skill/examples/character-prompt-examples.md",
                    "specs/skills/art-design-skill/examples/scene-prompt-examples.md",
                ]),
            ),
            skill(
                "seedance-storyboard-skill",
                "Skill 5 轻量分镜技能",
                "输出剧情分析、大分镜、情绪锚点、6 字段分镜、一键复制 Seedance 2.0 提示词和 copy-only。",
                v5Stage3SourceFiles([
                    "specs/skills/seedance-storyboard-skill/SKILL.md",
                    "specs/skills/seedance-storyboard-skill/templates/seedance-prompts-template.md",
                    "specs/skills/seedance-storyboard-skill/examples/seedance-prompt-examples.md",
                    "tools/export_copy_only.py",
                ]),
            ),
        ],
        qualityGates: [
            gate("v5-stage-spec-read-record", "v5.2 规范读取记录", ["script-adaptation", "art-design", "seedance-storyboard"], "每阶段开始前记录原格式锁和本阶段必读规范。", "未读取原格式锁和阶段必读文件时不得通过。", [
                sourceFile("AGENTS.md", "config", "v5 必读规则。"),
                sourceFile("config/workflow.yaml", "config", "v5 必读清单。"),
                sourceFile("config/quality-gates.yaml", "config", "v5.2 质量门清单。"),
            ]),
            gate(
                "v5-script-production-draft-check",
                "剧本生产稿检查",
                ["script-adaptation"],
                "检查 productionScript / structuredScript 是否保留原剧情并补齐生产信息。",
                "不得输出导演分析、资产清单或分镜提示词；不得改写核心剧情和台词顺序。",
                v5ScriptStageSourceFiles(["web/src/app/(user)/projects/script-optimizer-agent.ts"]),
            ),
            gate(
                "v5-director-method-shot-gate",
                "内置导演方法检查",
                ["art-design", "seedance-storyboard"],
                "检查内置导演方法是否覆盖 Beat、method_plan、method_tags、method_reason、资产需求和镜头策略。",
                "服化道与分镜阶段都必须保留导演方法自审结论。",
                v5Stage1SourceFiles(["specs/skills/director-method-shot-skill/SKILL.md"]),
            ),
            gate(
                "v5-original-art-prompt-format",
                "原格式服化道检查",
                ["art-design"],
                "检查 character-prompts.md 与 scene-prompts.md 是否沿用原模板。",
                "不得输出 character-image-prompts.md、scene-image-prompts.md 或 prop-image-prompts.md。",
                v5Stage2SourceFiles(["specs/skills/art-design-skill/templates/art-design-template.md"]),
            ),
            gate("v5-asset-uniqueness-check", "资产唯一性检查", ["art-design", "seedance-storyboard"], "检查角色、场景和互动道具没有错误合并。", "互动道具写入 scene-prompts.md 的互动道具章节，不单独输出 prop 文件。", [
                sourceFile("AGENTS.md", "config", "资产唯一性与禁止输出。"),
            ]),
            gate("v5-scene-by-scene-lock", "阶段三场次推进锁", ["seedance-storyboard"], "阶段三按场次 / 子场次推进，不能整集一次性生成到底。", "每个场次先写剧情分析和大分镜总表，再写 Pxx 大分镜、6 字段分镜和一键复制提示词。", [
                sourceFile("AGENTS.md", "config", "阶段三推进锁。"),
            ]),
            gate(
                "v5-skill5-seedance-prompt-format",
                "Skill 5 Seedance 格式检查",
                ["seedance-storyboard"],
                "检查 02-seedance-prompts.md、@图N 引用、Skill 5 大分镜结构和 copy-only 导出。",
                "必须包含轻量规范读取记录、参考图映射、剧情分析、大分镜总表、Pxx 大分镜、6 字段分镜和一键复制代码块。",
                [sourceFile("specs/skills/seedance-storyboard-skill/templates/seedance-prompts-template.md", "template", "Skill 5 通用版模板。"), sourceFile("tools/export_copy_only.py", "tool", "copy-only 导出工具。")],
            ),
        ],
        sourceFiles,
        sourceRoot: SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_SOURCE_ROOT,
        importedAt: "2026-06-16T00:00:00.000Z",
        enabled: false,
        selected: false,
    };
}

export function buildSeedanceMxShellStoryboardV15Preset(): AgentWorkflowPreset {
    const base = buildSeedanceOriginalFormatDirectorMethodV5Preset();
    const removedStage3Files = new Set([
        "specs/skills/seedance-storyboard-skill/SKILL.md",
        "specs/skills/seedance-storyboard-skill/templates/seedance-prompts-template.md",
        "specs/skills/seedance-storyboard-skill/industrial-quality-rules.md",
        "specs/skills/seedance-storyboard-skill/seedance-prompt-methodology.md",
        "specs/skills/seedance-storyboard-skill/examples/seedance-prompt-examples.md",
        "tools/export_copy_only.py",
    ]);
    return {
        ...base,
        workflowId: SEEDANCE_MX_SHELL_STORYBOARD_V15_PRESET_ID,
        name: "Mx-Shell 清道夫分镜 v1.5",
        version: "1.5.0",
        description: "接入 Mx-Shell_Prompts v1.5：保留白皮书剧本适配、原格式服化道和导演方法包，分镜阶段切换为清道夫 Shell Prompt，支持一镜到底 / 多机位分镜、按秒时间轴、物理化描述和对白 / 画外音保留。",
        stages: base.stages.map((stage) =>
            stage.stageId === "seedance-storyboard"
                ? {
                      ...stage,
                      name: "Mx-Shell 清道夫分镜",
                      purpose: "先用导演方法包锁定 Beat、调度和镜头策略，再按 Mx-Shell v1.5 输出一镜到底或多机位分镜 Seedance 2.0 提示词。",
                      inputSummary: "AI 剧本母版、原格式服化道资产提示词、导演方法包、Mx-Shell_Prompts v1.5 和 Seedance 输出要求。",
                      outputSummary: "基础设定、氛围与画质、声音规则、一镜到底或多机位分镜画面内容、按秒时间轴和可复制 Seedance 提示词。",
                      requiredSkills: ["original-prompt-format-lock", "director-method-shot-skill", "mx-shell-storyboard-skill"],
                      qualityGateIds: ["v5-stage-spec-read-record", "v5-director-method-shot-gate", "mx-shell-storyboard-format"],
                  }
                : stage,
        ),
        agents: base.agents.map((agent) =>
            agent.agentId === "storyboard-artist"
                ? {
                      ...agent,
                      role: "导演方法 + Mx-Shell 清道夫视频分镜",
                      responsibility: "先用导演方法包拆 Beat 和镜头策略，再按 Mx-Shell v1.5 输出一镜到底或多机位分镜提示词。",
                      systemPromptSummary: "严格遵循 Mx-Shell_Prompts v1.5：基础设定、氛围画质、同期声、物理化动作、按秒时间轴和对白保留。",
                      sourceFile: MX_SHELL_PROMPTS_SOURCE_FILE,
                  }
                : agent,
        ),
        agentBindings: base.agentBindings.map((bindingItem) =>
            bindingItem.stageId === "seedance-storyboard"
                ? {
                      ...bindingItem,
                      bindingId: "seedance-storyboard:storyboard-artist:1.5.0",
                      agentVersion: "1.5.0",
                      inputContract: "AI 剧本母版 / 导演方法 / 原格式资产 / Mx-Shell 模式",
                      outputContract: "Mx-Shell Seedance 提示词 / 一镜到底或多机位分镜",
                  }
                : bindingItem,
        ),
        skills: base.skills.map((skillItem) =>
            skillItem.skillId === "seedance-storyboard-skill"
                ? skill("mx-shell-storyboard-skill", "Mx-Shell 清道夫分镜技能", "一镜到底 / 多机位分镜、基础设定、氛围画质、同期声、按秒时间轴、物理化动作和对白 / 画外音保留。", [
                      sourceFile(MX_SHELL_PROMPTS_SOURCE_FILE, "skill", "Mx-Shell_Prompts v1.5 清道夫分镜提示词规则。"),
                  ])
                : skillItem,
        ),
        qualityGates: base.qualityGates
            .filter((gateItem) => gateItem.gateId !== "v5-scene-by-scene-lock")
            .map((gateItem) =>
                gateItem.gateId === "v5-skill5-seedance-prompt-format"
                    ? gate(
                          "mx-shell-storyboard-format",
                          "Mx-Shell 清道夫格式检查",
                          ["seedance-storyboard"],
                          "检查清道夫分镜是否按 Mx-Shell_Prompts v1.5 输出基础设定、氛围画质、声音规则和画面内容。",
                          "必须选择一镜到底或多机位分镜；必须按秒标注时间轴；必须物理化描述动作和表情；对白 / 旁白必须保留并绑定动作节拍。",
                          [sourceFile(MX_SHELL_PROMPTS_SOURCE_FILE, "skill", "Mx-Shell_Prompts v1.5 清道夫分镜提示词规则。")],
                      )
                    : gateItem,
            ),
        sourceFiles: uniqueSourceFiles([...base.sourceFiles.filter((file) => !removedStage3Files.has(file.path)), sourceFile(MX_SHELL_PROMPTS_SOURCE_FILE, "skill", "Mx-Shell_Prompts v1.5 清道夫分镜提示词规则。")]),
        sourceRoot: SEEDANCE_MX_SHELL_STORYBOARD_V15_SOURCE_ROOT,
        importedAt: "2026-06-16T00:00:00.000Z",
    };
}

export function buildSeedanceOriginalFormatEmotionDirectorV21Preset(): AgentWorkflowPreset {
    return withEmotionDirectorStoryboardPreset(buildSeedanceOriginalFormatDirectorMethodV5Preset(), {
        workflowId: SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID,
        name: "Seedance Skill 5 + 情绪导演 v2.1",
        version: "5.2.1",
        description: "在 Seedance Skill 5 轻量分镜 v5.2 上叠加情绪导演 Skill v2.1：保留白皮书剧本适配、原格式服化道和导演方法包，分镜阶段额外强化情绪曲线、生理反应、微动作、声音层次和环境反馈。",
        stageName: "Skill 5 情绪导演分镜",
    });
}

export function buildSeedanceMxShellEmotionDirectorV21Preset(): AgentWorkflowPreset {
    return withEmotionDirectorStoryboardPreset(buildSeedanceMxShellStoryboardV15Preset(), {
        workflowId: SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID,
        name: "Mx-Shell 清道夫 + 情绪导演 v2.1",
        version: "1.5.1",
        description: "在 Mx-Shell 清道夫分镜 v1.5 上叠加情绪导演 Skill v2.1：清道夫负责提示词结构和按秒时间轴，情绪导演负责情绪物理化、微动作、台词声音状态和环境反馈。",
        stageName: "清道夫情绪导演分镜",
    });
}

function withEmotionDirectorStoryboardPreset(base: AgentWorkflowPreset, options: { workflowId: string; name: string; version: string; description: string; stageName: string }): AgentWorkflowPreset {
    const emotionDirectorSkill = skill(EMOTION_DIRECTOR_SKILL_ID, "情绪导演增强技能", "情绪曲线、生理反应、微动作、声音层次、环境反馈和短提示词压缩规则。", [sourceFile(EMOTION_DIRECTOR_SKILL_SOURCE_FILE, "skill", "情绪导演 Skill v2.1。")]);
    const emotionDirectorGate = gate(
        "emotion-director-storyboard-check",
        "情绪导演物理化检查",
        ["seedance-storyboard"],
        "检查分镜提示词是否把抽象情绪转译为可拍摄的表情、动作、呼吸、声音和环境反馈。",
        "不得直接使用文学化情绪词代替画面；必须有情绪过渡、微动作 / 惯性动作 / 神经反应和同步声音反馈。",
        [sourceFile(EMOTION_DIRECTOR_SKILL_SOURCE_FILE, "skill", "情绪导演 Skill v2.1。")],
    );
    return {
        ...base,
        workflowId: options.workflowId,
        name: options.name,
        version: options.version,
        description: options.description,
        stages: base.stages.map((stage) =>
            stage.stageId === "seedance-storyboard"
                ? {
                      ...stage,
                      name: options.stageName,
                      purpose: `${stage.purpose}；叠加情绪导演 v2.1，把抽象情绪转成可拍摄、可表演的生理反应和动作节拍。`,
                      inputSummary: `${stage.inputSummary}、情绪导演 Skill v2.1。`,
                      outputSummary: appendChineseSentence(stage.outputSummary, "强化情绪曲线、生理反应、声音层次和环境反馈。"),
                      requiredSkills: appendUnique(stage.requiredSkills, EMOTION_DIRECTOR_SKILL_ID),
                      qualityGateIds: appendUnique(stage.qualityGateIds, "emotion-director-storyboard-check"),
                  }
                : stage,
        ),
        agents: base.agents.map((agent) =>
            agent.agentId === "storyboard-artist"
                ? {
                      ...agent,
                      role: `${agent.role} + 情绪导演`,
                      responsibility: `${agent.responsibility} 同时把情绪外化为可拍摄的生理反应、微动作、声音和环境反馈。`,
                      systemPromptSummary: "分镜输出叠加情绪导演 v2.1：情绪曲线、生理反应、微动作、声音层次和环境反馈。",
                  }
                : agent,
        ),
        agentBindings: base.agentBindings.map((bindingItem) =>
            bindingItem.stageId === "seedance-storyboard"
                ? {
                      ...bindingItem,
                      bindingId: `seedance-storyboard:storyboard-artist:${options.version}`,
                      agentVersion: options.version,
                      inputContract: `${bindingItem.inputContract} / 情绪导演`,
                      outputContract: `${bindingItem.outputContract} / 情绪导演增强提示词`,
                  }
                : bindingItem,
        ),
        skills: appendWorkflowSkill(base.skills, emotionDirectorSkill),
        qualityGates: appendWorkflowQualityGate(base.qualityGates, emotionDirectorGate),
        sourceFiles: uniqueSourceFiles([...base.sourceFiles, sourceFile(EMOTION_DIRECTOR_SKILL_SOURCE_FILE, "skill", "情绪导演 Skill v2.1。")]),
        importedAt: "2026-06-16T00:00:00.000Z",
    };
}

export function sortedWorkflowStages(preset: Pick<AgentWorkflowPreset, "stages">) {
    return [...preset.stages].sort((a, b) => a.order - b.order);
}

export function workflowStageDetail(preset: AgentWorkflowPreset, stage: AgentWorkflowStage) {
    return {
        stage,
        agent: preset.agents.find((agent) => agent.agentId === stage.agentId),
        binding: workflowAgentBinding(preset, stage.stageId),
        skills: stage.requiredSkills.map((skillId) => preset.skills.find((skill) => skill.skillId === skillId)).filter((item): item is AgentWorkflowSkill => Boolean(item)),
        qualityGates: stage.qualityGateIds.map((gateId) => preset.qualityGates.find((gate) => gate.gateId === gateId)).filter((item): item is AgentWorkflowQualityGate => Boolean(item)),
    };
}

export function workflowAgentBinding(preset: AgentWorkflowPreset, stageId: string) {
    return preset.agentBindings.find((item) => item.stageId === stageId);
}

function skill(skillId: string, name: string, summary: string, sourceFiles: AgentWorkflowSourceFile[]): AgentWorkflowSkill {
    return { skillId, name, purpose: summary, summary, sourceFiles };
}

function gate(gateId: string, name: string, stageIds: string[], purpose: string, summary: string, sourceFiles: AgentWorkflowSourceFile[]): AgentWorkflowQualityGate {
    return { gateId, name, stageIds, purpose, summary, sourceFiles };
}

function binding(stageId: string, agentId: string, agentConfigKind: AgentConfigKind, agentVersion: string, inputContract: string, outputContract: string): AgentWorkflowAgentBinding {
    return {
        bindingId: `${stageId}:${agentId}:${agentVersion}`,
        stageId,
        agentId,
        agentConfigKind,
        agentVersion,
        inputContract,
        outputContract,
        switchable: true,
    };
}

function scriptStageSourceFiles(only?: string[]) {
    return filterSources([sourceFile("web/src/app/(user)/projects/agent-settings.ts", "agent", "script_optimizer 默认 Agent 设定。"), sourceFile("web/src/app/(user)/projects/script-optimizer-agent.ts", "guide", "剧本适配与白皮书规则。")], only);
}

function stage1SourceFiles(only?: string[]) {
    return filterSources(
        [
            sourceFile("AGENTS.md", "config", "主流程、审核证据和强制执行锁。"),
            sourceFile("agents/director.md", "agent", "导演 Agent。"),
            sourceFile("skills/director-skill/SKILL.md", "skill", "导演讲戏技能。"),
            sourceFile("skills/director-skill/templates/director-analysis-template.md", "template", "导演讲戏输出模板。"),
            sourceFile("skills/script-analysis-review-skill/SKILL.md", "skill", "内置导演业务审核。"),
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

function v5ScriptStageSourceFiles(only?: string[]) {
    return filterSources(
        [
            sourceFile("AGENTS.md", "config", "v5 原格式锁、必读文件和待确认规则。"),
            sourceFile("config/workflow.yaml", "config", "v5.2 流程和必读清单。"),
            sourceFile("web/src/app/(user)/projects/agent-settings.ts", "agent", "script_optimizer 默认 Agent 设定。"),
            sourceFile("web/src/app/(user)/projects/script-optimizer-agent.ts", "guide", "剧本适配与白皮书规则。"),
            sourceFile("schemas/script-ingestion.schema.json", "template", "剧本导入结构。"),
            sourceFile("docs/original-format-v5-runbook.md", "guide", "v5 操作说明。"),
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
            sourceFile("specs/agents/storyboard-artist.md", "agent", "Skill 5 轻量分镜 Agent。"),
            sourceFile("specs/skills/original-prompt-format-lock/SKILL.md", "skill", "原提示词格式锁。"),
            sourceFile("specs/skills/seedance-storyboard-skill/SKILL.md", "skill", "Seedance 分镜技能。"),
            sourceFile("specs/skills/seedance-storyboard-skill/templates/seedance-prompts-template.md", "template", "Skill 5 通用版模板。"),
            sourceFile("specs/skills/seedance-storyboard-skill/industrial-quality-rules.md", "guide", "旧工业化质检规则，仅作辅助参考。"),
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

function appendUnique<T>(items: T[], item: T) {
    return items.includes(item) ? items : [...items, item];
}

function appendWorkflowSkill(skills: AgentWorkflowSkill[], item: AgentWorkflowSkill) {
    return skills.some((skillItem) => skillItem.skillId === item.skillId) ? skills : [...skills, item];
}

function appendWorkflowQualityGate(gates: AgentWorkflowQualityGate[], item: AgentWorkflowQualityGate) {
    return gates.some((gateItem) => gateItem.gateId === item.gateId) ? gates : [...gates, item];
}

function appendChineseSentence(text: string, sentence: string) {
    const trimmed = text.trim();
    if (!trimmed) return sentence;
    return `${trimmed.replace(/[。；;，,、\s]+$/, "")}；${sentence}`;
}
