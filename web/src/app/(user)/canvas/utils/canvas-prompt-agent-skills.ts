import type { PromptAgentComposerIntent, PromptAgentIntent, PromptAgentSkillPackId } from "./canvas-prompt-agent-types.ts";

type PromptAgentSkill = {
    id: string;
    label: string;
    intents: PromptAgentIntent[];
    source: string;
    useWhen: string;
    rules: string[];
    outputContract: string[];
    avoid: string[];
};

export type PromptAgentSkillPack = {
    id: PromptAgentSkillPackId;
    label: string;
    description: string;
    skillIds?: string[];
};

const promptAgentSkills: PromptAgentSkill[] = [
    {
        id: "script-master-adaptation",
        label: "白皮书 AI 剧本母版适配",
        intents: ["rewrite_prompt", "storyboard_prompt"],
        source: "视频工作流：剧本优化 / 白皮书 AI 剧本母版适配包 v1.1",
        useWhen: "用户要求改写剧情文本、补充分镜依据、从剧本提炼镜头任务或保持原剧情事实时使用。",
        rules: ["保留原剧情事实、台词顺序和场次边界", "只补视觉方向、连续性、风险提示、隐喻处理和画面生成禁止项", "不要把制作备注混进最终可复制提示词正文"],
        outputContract: ["输出可供图片、视频或分镜继续使用的明确创作依据", "需要分镜时先按场次 / Beat 拆分，再生成镜头提示词"],
        avoid: ["不要改人物关系、结局、动作顺序或台词原意", "不要输出大段内部分析过程"],
    },
    {
        id: "director-method-shot",
        label: "导演方法镜头策略",
        intents: ["image_prompt", "video_prompt", "storyboard_prompt"],
        source: "视频工作流：导演方法下沉到服化道和 Skill 5 分镜",
        useWhen: "用户需要镜头策略、Beat、人物调度、情绪节奏、场景重点或视觉基调时使用。",
        rules: ["把抽象判断转成可拍摄的调度、景别、机位、运镜、起幅和落幅", "动作、视线、空间状态和道具连续性必须明确", "镜头策略服务当前画布上下文，不引入其它集剧情"],
        outputContract: ["图片提示词体现构图、光线和主体关系", "视频提示词体现动作连续、镜头运动和时长节奏", "分镜提示词按镜头逐条给出画面、动作、景别和运镜"],
        avoid: ["不要只写情绪形容词", "不要用内部 method_tags 代替用户可用提示词"],
    },
    {
        id: "original-art-prompt-format",
        label: "原格式服化道图片提示词",
        intents: ["image_prompt"],
        source: "视频工作流：服化道 / 导演方法 + 原格式服化道包 v5.2",
        useWhen: "用户要角色、场景、道具、服装、氛围或参考图生图提示词时使用。",
        rules: ["角色提示词要锁定身份、年龄气质、服装、发型、材质、正侧背设定板或定妆照要求", "场景提示词必须是纯环境和空间规划，不写人物、肢体、表情、服装或具体动作", "道具提示词只写会影响表演、构图、叙事或视觉连续性的互动物件"],
        outputContract: ["图片 finalPrompt 必须可直接用于生图", "明确主体、风格、构图、光线、材质、色彩、参考图用法和负面约束"],
        avoid: ["不要把道具塞进场景段落", "不要把场景写成人物动作描述", "不要复制旧项目或旧集素材 ID"],
    },
    {
        id: "seedance-copy-only",
        label: "Skill 5 轻量分镜 Copy-only",
        intents: ["video_prompt", "storyboard_prompt"],
        source: "视频工作流：Copy-only / 轻量镜头 Copy-only v5.2",
        useWhen: "用户需要 Seedance 视频提示词、镜头拆分或可复制视频提示词块时使用。",
        rules: ["Copy-only 代码块字段硬规则：必须包含 `场景：`、`声音：`、`画面内容：`、`限制：` 四个字段", "逐时间段描述写成 `0-2秒：...` 格式", "引用图片必须写 @图N，禁止写 @图片N"],
        outputContract: ["视频 finalPrompt 要可直接放入视频配置节点", "分镜镜头需给出 4-15 秒范围内可执行的视频提示词", "视频第一版只创建配置节点，不自动生成视频"],
        avoid: ["不要出现本P、单P、生成P、P间、剧情分析、大分镜、情绪锚点、6 字段分镜等内部过程术语", "不要把长台词塞进单个短视频片段"],
    },
    {
        id: "mx-shell-copyonly",
        label: "清道夫 Copy-only",
        intents: ["video_prompt", "storyboard_prompt"],
        source: "视频工作流：Copy-only / 清道夫 Copy-only v1.5",
        useWhen: "用户需要更工业化、更稳定的 Seedance 视频提示词结构时使用。",
        rules: ["强化基础设定、氛围画质、同期声规则、画面内容和按秒时间轴", "把动作写成物理可拍的连续变化", "确保声音、人物和空间状态不互相矛盾"],
        outputContract: ["输出能直接复制的 Seedance 2.0 提示词结构", "镜头内动作要有明确起点、过程和落点"],
        avoid: ["不要只写抽象情绪", "不要用镜头术语替代画面内容字段"],
    },
    {
        id: "emotion-director-copyonly",
        label: "情绪导演 Copy-only",
        intents: ["video_prompt", "storyboard_prompt"],
        source: "视频工作流：Copy-only / 情绪导演 Copy-only v2.1",
        useWhen: "用户要求情绪、心理变化、克制表演、人物关系张力或氛围递进时使用。",
        rules: ["把情绪物理化为呼吸、眼神、肌肉反应、微动作、声音层次和环境反馈", "让情绪变化通过可见动作和节奏体现", "保持主体一致性和表演连续性"],
        outputContract: ["视频提示词要同时包含情绪表现和可拍摄动作", "分镜拆分要显示情绪从起幅到落幅的变化"],
        avoid: ["不要直接写不可拍摄的心理旁白", "不要为了情绪删除剧情功能"],
    },
];

export const promptAgentSkillPacks: PromptAgentSkillPack[] = [
    { id: "auto", label: "自动 Skill", description: "按当前提示词意图自动注入适配 Skill。" },
    { id: "art-direction", label: "美术设定", description: "角色、场景、道具和图片提示词优先。", skillIds: ["original-art-prompt-format", "director-method-shot"] },
    { id: "seedance-video", label: "Seedance 视频", description: "视频提示词、Copy-only 字段和按秒时间轴优先。", skillIds: ["seedance-copy-only", "mx-shell-copyonly", "emotion-director-copyonly", "director-method-shot"] },
    { id: "storyboard-director", label: "导演分镜", description: "剧本改写、Beat 拆分、镜头调度和分镜连续性优先。", skillIds: ["script-master-adaptation", "director-method-shot", "seedance-copy-only", "emotion-director-copyonly"] },
    { id: "review-cleanup", label: "清道夫审核", description: "检查内部术语、字段合同、情绪物理化和 Seedance 可生成性。", skillIds: ["mx-shell-copyonly", "emotion-director-copyonly", "seedance-copy-only"] },
];

export function promptAgentSkillsForIntent(intent: PromptAgentComposerIntent) {
    if (intent === "auto") return promptAgentSkills;
    if (intent === "chat") return [];
    return promptAgentSkills.filter((skill) => skill.intents.includes(intent));
}

export function promptAgentSkillsForSelection({ intent, skillPackId = "auto" }: { intent: PromptAgentComposerIntent; skillPackId?: PromptAgentSkillPackId }) {
    if (skillPackId === "auto") return promptAgentSkillsForIntent(intent);
    const pack = promptAgentSkillPacks.find((item) => item.id === skillPackId);
    const packSkillIds = new Set(pack?.skillIds || []);
    return promptAgentSkillsForIntent(intent).filter((skill) => packSkillIds.has(skill.id));
}

export function buildPromptAgentSkillContext(intent: PromptAgentComposerIntent, skillPackId: PromptAgentSkillPackId = "auto") {
    const pack = promptAgentSkillPacks.find((item) => item.id === skillPackId) || promptAgentSkillPacks[0];
    const skills = promptAgentSkillsForSelection({ intent, skillPackId });
    if (!skills.length) return "";
    return [
        "适配 Skill：以下规则来自视频工作流 Skill 的轻量化整理，只用于画布提示词 Agent，不执行本地 Runner，不读取外部文件。",
        `当前 Skill Pack：${pack.label}。${pack.description}`,
        ...skills.map((skill) =>
            [
                `【${skill.label}】`,
                `来源：${skill.source}`,
                `使用场景：${skill.useWhen}`,
                `规则：${skill.rules.join("；")}`,
                `输出契约：${skill.outputContract.join("；")}`,
                `避免：${skill.avoid.join("；")}`,
            ].join("\n"),
        ),
    ].join("\n\n");
}
