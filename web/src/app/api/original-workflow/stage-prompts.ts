export function episodeAssetPrefix(episode: string) {
    return episode.match(/^ep\d+/i)?.[0] || episode;
}

export type WorkflowScriptBatch = {
    batchId: string;
    label: string;
    text: string;
};

const defaultBatchMaxChars = 450;
const mxShellSkillPath = "/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/Mx-Shell_Prompts_v1.5.md";
const emotionDirectorSkillPath = "/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/情绪导演_Skill_V2.1.md";
const stage3CopyOnlyFieldContract =
    "Copy-only 代码块字段硬规则：每个 ```text 代码块必须逐字包含 `场景：`、`声音：`、`画面内容：`、`限制：` 四个字段；逐时间段描述必须写成 `0-2秒：...` 这种 x-y秒格式；`画面内容：` 不可用 `镜头`、`动作` 或 `时间轴` 替代，可在该字段下继续写 0-2秒、2-5秒等分段。";

export function buildScriptBatchPlan(scriptText: string, episode: string, maxChars = defaultBatchMaxChars): WorkflowScriptBatch[] {
    const normalized = scriptText.replace(/\r\n/g, "\n").trim();
    if (!normalized) return [{ batchId: `${episode}-batch-01`, label: `${episode} 全集`, text: "" }];
    const scenes = splitScriptScenes(normalized);
    const batches: WorkflowScriptBatch[] = [];
    scenes.forEach((scene, sceneIndex) => {
        splitSceneIntoBatches(scene.text, maxChars).forEach((text, batchIndex, sceneBatches) => {
            const suffix = sceneBatches.length > 1 ? ` · 批次 ${batchIndex + 1}` : "";
            batches.push({
                batchId: `${slugKey(scene.label || `scene-${sceneIndex + 1}`)}-b${batchIndex + 1}`,
                label: `${scene.label || `场次 ${sceneIndex + 1}`}${suffix}`,
                text,
            });
        });
    });
    return batches.length ? batches : [{ batchId: `${episode}-batch-01`, label: `${episode} 全集`, text: normalized }];
}

export function buildStage1PartPromptTexts(rootPath: string, episode: string, projectSlug: string, scriptText = "") {
    const batches = buildScriptBatchPlan(scriptText, episode);
    const base = [
        "你正在执行 Seedance 视频工作流 Stage 1 的一个分文件任务。",
        `工作流根目录：${rootPath}`,
        `项目目录：${projectSlug}`,
        `集数：${episode}`,
        "网页 Runner 模式：不要启用子代理，不要等待人工回复，不要做剧情合规审核，不要生成最终 Seedance 提示词。",
        `只允许写入工作流根目录 outputs/${episode}/ 下指定的一个文件；不要写到 projects/${projectSlug}/outputs/。`,
        `必须读取 AGENTS.md、specs/agents/director.md、specs/skills/director-method-shot-skill/SKILL.md、projects/${projectSlug}/script/${episode}.md。`,
        `硬规则：只允许使用当前集数 ${episode} 的剧本和 outputs/${episode} 上游文件作为剧情来源；禁止输出 ep05、ep06、5-1、6-1 或其它旧集 ID。`,
        "样例只允许读取标题结构和字段名：outputs/ep05 只作为格式参考；不要读取或复制 ep05 / ep06 的剧情正文、人物动作、场次编号或 Beat / Shot ID。",
        "若必须看旧样例，只做结构抽样；不要把旧样例长正文粘进日志或当前文件。",
        "内容边界：只能丰富导演分析、镜头策略、调度、节奏和可修改项；不得改剧情事件、人物关系、动作顺序、结局或台词原文。",
        "分批策略：先按场次 / Beat 批次生成局部导演碎片，再汇总成 01A/01B/01C/01D；不要把整集一次性长推理到底。",
        "每个批次只处理当前批次原文；跨批次人物、场景和道具在汇总任务里去重，不在单批次里猜其它批次内容。",
        "输出前自检：目标文件不得包含 ep05、ep06、5-1、6-1；如发现必须修正后再结束。",
    ].join("\n");
    const fragmentDir = `outputs/${episode}/.scene-batches/stage1`;
    return [
        ...batches.map((batch, index) => ({
            label: `stage1-batch-${String(index + 1).padStart(2, "0")}`,
            text: [
                base,
                "",
                `任务：只处理当前批次「${batch.label}」，写入 ${fragmentDir}/${batch.batchId}.md。`,
                "碎片文件必须包含四个局部章节：01A 局部导演分析、01B 局部 Beat Board、01C 局部导演分镜脚本、01D 局部用户修改轨。",
                "不要写最终 01A/01B/01C/01D 文件，不要读取其它批次剧情，不要补写当前批次没有出现的剧情事件。",
                "如果当前批次是一段长台词，先按情绪变化和动作反应拆 Beat，再写局部 Shot；不要把整段演讲塞进一个 Shot。",
                "",
                "当前批次原文：",
                fenced(batch.text || "当前批次原文为空，请从当前集剧本中读取同名批次后处理。"),
            ].join("\n"),
        })),
        {
            label: "stage1-merge",
            text: [
                base,
                "",
                `任务：读取 ${fragmentDir}/ 下全部批次碎片，汇总生成最终 Stage 1 四个文件：`,
                `1. outputs/${episode}/01A-director-analysis.md`,
                `2. outputs/${episode}/01B-beat-board.md`,
                `3. outputs/${episode}/01C-director-shot-script.md`,
                `4. outputs/${episode}/01D-shot-edit-track.md`,
                "汇总时只做合并、去重、编号统一和跨批次连续性检查；不要重新整集长推理，不要改写批次原剧情和台词。",
                "01A 输出阶段一规范读取记录、本集核心戏剧任务、场次清单、人物清单、场景清单、互动道具清单和提示词污染预防。",
                "01B 输出按场次 / Beat 的 Beat Board、导演方法标签、具体镜头策略、用户决策点和确认状态。",
                "01C 输出全量真分镜脚本，Shot 标题清楚，包含 method_tags、时长、景别、机位、镜头运动、起幅、落幅、人物调度、声音/台词、剪辑关系、资产需求和可修改项。",
                "01D 输出每场可改项、风险提示、默认确认状态和用户批注区；“待确认”不是 Stage 2 或 Stage 3 的阻断条件。",
            ].join("\n"),
        },
    ];
}

export function buildStage2Instruction(episode: string, projectSlug: string, skillPresetId?: string) {
    const episodePrefix = episodeAssetPrefix(episode);
    const charactersPath = `projects/${projectSlug}/assets/character-prompts.md`;
    const scenesPath = `projects/${projectSlug}/assets/scene-prompts.md`;
    const propsPath = `projects/${projectSlug}/assets/prop-prompts.md`;
    return [
        "按 art-designer 角色要求执行，但不要 spawn_agent、不要 fork、不要 collab Wait，必须在当前 Codex exec 进程内直接完成。",
        `当前服化道 Skill：${stage2SkillName(skillPresetId)}。`,
        `当前项目：${projectSlug}`,
        `当前集：${episode}`,
        `只允许读取当前项目剧本 projects/${projectSlug}/script/${episode}.md；如当前集 outputs/${episode}/01A-director-analysis.md、01B-beat-board.md、01C-director-shot-script.md、01D-shot-edit-track.md 已存在，可作为导演方法参考，但不得要求先生成独立导演分析阶段。`,
        "服化道阶段内置导演方法，但只输出资产交付，不展示导演分析过程。",
        "必须读取 original-prompt-format-lock 和 art-design-template，只把它们作为格式锁和字段模板，不复制样例剧情、样例人物或样例场景。",
        "禁止读取、复制、合并或续写根目录 assets/character-prompts.md、assets/scene-prompts.md、assets/prop-prompts.md，也禁止读取其它 projects/*/assets 作为内容底稿；已有旧资产如果不是当前集，只视为污染源。",
        `这是当前集服化道重制任务：只允许覆盖写入 ${charactersPath}、${scenesPath} 与 ${propsPath}，不要追加旧内容，不要写根目录 assets/，不要输出 image-prompts 文件。`,
        `素材 ID 和章节必须使用当前集前缀 ${episodePrefix}，例如 ${episodePrefix}-CHAR-001、${episodePrefix}-SC01、${episodePrefix}-PROP-001；输出前自检目标文件不得包含非当前集的 ep05、ep06、5-1、6-1 等旧集 ID。`,
        "内容边界：只能根据当前剧本和本阶段内置导演方法判断丰富角色外观、场景空间、道具材质、参考图锁定范围和出图要求；不得改剧情事件、人物关系、动作顺序、结局或台词原文。",
        "场景提示词必须是纯环境/空间规划，不得写入人物、角色、群演、人形影子、面部、肢体、服装或具体动作；需要人物时写到人物资产文件，不要塞进场景资产。",
        "最小自检：角色、场景、道具三份文件互相命名一致；道具不塞进场景段落，场景不写人物动作，角色不改剧情事实。",
    ].join("\n");
}

export function buildStage2PartPromptTexts(rootPath: string, episode: string, projectSlug: string, scriptText = "", skillPresetId?: string) {
    const base = [
        "你正在执行 Seedance 视频工作流服化道阶段的一个并行资产任务。",
        `工作流根目录：${rootPath}`,
        `项目目录：${projectSlug}`,
        `集数：${episode}`,
        buildStage2Instruction(episode, projectSlug, skillPresetId),
        "并行规则：三个资产任务都读取整集剧本，但每个任务只写自己的目标文件；不要等待其它任务，不要合并其它任务结果。",
        "统一交付标准：每个资产条目用二级或三级标题，包含素材ID、素材类型、用途/出现位置、视觉描述、提示词；不要输出解释自己如何分析。",
        "当前整集剧本：",
        fenced(scriptText || "当前剧本为空，请读取当前项目剧本文件。"),
    ].join("\n");
    const prefix = episodeAssetPrefix(episode);
    return [
        {
            label: "stage2-character-assets",
            text: [
                base,
                "",
                `任务：只提取角色 / 群体 / 服装定妆资产，覆盖写入 projects/${projectSlug}/assets/character-prompts.md。`,
                "文件标题必须为 `# 人物提示词`；每个条目必须保留原格式标记：`**素材ID**`、`**清道夫引用信息**`、`**出图要求**`、`**提示词**`。",
                "人物出图要求必须包含 `通用角色设定板提示词｜真实定妆照版 V2`、`FRONT VIEW`、`SIDE VIEW`、`BACK VIEW`。",
                `素材 ID 使用 ${prefix}-CHAR-001 起编号；毕业生群体、老师群体等可作为群体角色资产。`,
                "不要写场景空间规划，不要写可独立成物件的道具资产。",
            ].join("\n"),
        },
        {
            label: "stage2-scene-assets",
            text: [
                base,
                "",
                `任务：只提取场景 / 空间 / 光线 / 环境资产，覆盖写入 projects/${projectSlug}/assets/scene-prompts.md。`,
                "文件标题必须为 `# 场景道具提示词`；每个条目必须保留原格式标记：`**素材ID**`、`**清道夫引用信息**`、`**出图要求**`、`**提示词**`。",
                "场景出图要求必须包含 `2x2 四宫格` 或 `2x2四宫格`。",
                `素材 ID 使用 ${prefix}-SC01 起编号。`,
                "场景提示词必须是纯环境，不写人物、肢体、表情、服装、具体动作或群演。",
            ].join("\n"),
        },
        {
            label: "stage2-prop-assets",
            text: [
                base,
                "",
                `任务：只提取互动道具 / 关键物件 / 仪式物件资产，覆盖写入 projects/${projectSlug}/assets/prop-prompts.md。`,
                "文件标题必须为 `# 道具资产提示词`；每个条目必须包含：`**素材ID**`、`**素材类型**`、`**用途 / 出现位置**`、`**视觉描述**`、`**提示词**`。",
                `素材 ID 使用 ${prefix}-PROP-001 起编号。`,
                "只写会影响表演、构图、叙事或视觉连续性的道具；不要把普通场景陈设重复写成道具。",
                "若当前集确实没有关键道具，也必须写出文件标题和一句 `无关键互动道具。`，不要省略文件。",
            ].join("\n"),
        },
    ];
}

export function buildStage3PartPromptTexts(rootPath: string, episode: string, projectSlug: string, sourceText = "", skillPresetId?: string) {
    const batches = buildScriptBatchPlan(sourceText, episode, 900);
    const skill = stage3SkillProfile(skillPresetId);
    const base = [
        "你正在执行 Seedance 视频工作流 Copy-only 阶段的一个分批任务。",
        `工作流根目录：${rootPath}`,
        `项目目录：${projectSlug}`,
        `集数：${episode}`,
        `当前 Copy-only Skill：${skill.name}。`,
        "网页 Runner 模式：不要启用子代理，不要等待人工回复，不要做剧情合规审核。",
        `只允许读取当前项目剧本 projects/${projectSlug}/script/${episode}.md、projects/${projectSlug}/assets/character-prompts.md、projects/${projectSlug}/assets/scene-prompts.md、projects/${projectSlug}/assets/prop-prompts.md；如当前集 outputs/${episode}/01C-director-shot-script.md 已存在，只作为隐藏过程参考，不得要求先生成独立导演分析阶段。`,
        "Copy-only 阶段内部可完成 Beat、情绪、调度和镜头策略判断，但所有文件交付只保留可复制 Seedance 提示词正文，不写过程分析。",
        skill.readingRule,
        "分批策略：按场次 / Beat / P 段逐批生成 Copy-only 碎片，最后只面向用户交付 02-seedance-copy-only.md；02-seedance-prompts.md 只作为隐藏缓存。",
        "每批只处理当前批次原文；台词超载时拆连续 P，不能压缩剧情台词，不能把长演讲塞进单个 4-15 秒片段。",
        "引用必须用 @图N，禁止 @图片N；Copy-only 正文禁止出现“本P、单P、生成P、P间、分镜思路、导演分析、剧情分析、大分镜、情绪锚点、跨段衔接卡、6 字段分镜”等内部过程术语。",
        stage3CopyOnlyFieldContract,
        skill.outputRule,
    ].join("\n");
    const fragmentDir = `outputs/${episode}/.scene-batches/stage3`;
    return [
        ...batches.map((batch, index) => ({
            label: `stage3-batch-${String(index + 1).padStart(2, "0")}`,
            text: [
                base,
                "",
                `任务：只处理当前 Copy-only 批次「${batch.label}」，写入 ${fragmentDir}/${batch.batchId}.md。`,
                `碎片只允许使用此格式：# Copy-only 批次；随后多个 ## P临时编号｜段落｜秒数；每个标题下只放一个 \`\`\`text 代码块。`,
                `代码块内容风格：${skill.fragmentOutput}。`,
                "每个代码块必须满足字段硬规则；即使写了时间轴，也不能省略 `画面内容：` 字段。",
                "每个 P 目标 4-15 秒；若台词超过可读秒数，拆成连续 P 或改由画面/动作承载。",
                "不要写规范读取记录、参考图映射表、剧情分析、大分镜表、情绪锚点、6 字段分镜、跨段衔接卡、自检报告或解释性文字。",
                "不要写最终 outputs 文件，不要读取其它批次剧情来补当前批次。",
                "",
                "当前批次依据：",
                fenced(batch.text || "当前批次依据为空，请从当前集剧本中读取同名批次后处理。"),
            ].join("\n"),
        })),
        {
            label: "stage3-merge",
            text: [
                base,
                "",
                `任务：读取 ${fragmentDir}/ 下全部 Copy-only 批次碎片，生成两个文件：`,
                `1. outputs/${episode}/02-seedance-copy-only.md：用户可见交付，只保留 ## Pxx｜段落｜秒数 + 代码块提示词。`,
                `2. outputs/${episode}/02-seedance-prompts.md：隐藏缓存，内容与 Copy-only 保持同一交付标准，可附极简素材索引，但不要写过程分析。`,
                "汇总时只做合并、去重、P 编号统一、跨段衔接和格式修正；不要重新整集长推理，不要改剧情事件和台词原意。",
                `最终文件只允许包含：${skill.finalOutput}。`,
                "合并时必须逐块补齐字段硬规则；不能把 `场景`、逐秒时间轴或镜头动作当作 `画面内容` 字段替代。",
                "最终文件禁止出现规范读取记录、剧情分析、大分镜总表、情绪锚点、6 字段分镜、跨段衔接卡、自检报告或解释性文字。",
            ].join("\n"),
        },
    ];
}

function stage2SkillName(skillPresetId?: string) {
    if (skillPresetId === "seedance-original-format-director-method-v5") return "导演方法 + 原格式服化道包 v5.2";
    return "导演方法 + 原格式服化道包 v5.2";
}

function stage3SkillProfile(skillPresetId?: string) {
    if (skillPresetId === "seedance-mx-shell-storyboard-v1-5") {
        return {
            name: "清道夫分镜包 v1.5",
            readingRule: `必须读取清道夫分镜 Skill 文件 ${mxShellSkillPath}、original-prompt-format-lock 和导演方法包，但不要复制旧样例剧情；禁止用 find /Users 全盘搜索 Skill 文件。`,
            outputRule: "内部按清道夫结构判断，但文件只输出可复制提示词代码块：基础设定、氛围画质、声音规则、画面内容、按秒时间轴、物理化动作和对白 / 画外音保留。",
            fragmentOutput: "清道夫 Copy-only 正文，包含基础设定、氛围画质、同期声规则、画面内容和按秒时间轴",
            finalOutput: "Pxx 标题和一键复制 Seedance 2.0 提示词代码块",
        };
    }
    if (skillPresetId === "seedance-original-format-emotion-director-v2-1") {
        return {
            name: "情绪导演 + Skill 5 轻量分镜包 v2.1",
            readingRule: `必须读取 original-prompt-format-lock、seedance-storyboard-skill、seedance-prompts-template 和情绪导演 Skill 文件 ${emotionDirectorSkillPath}，但不要复制旧样例剧情；禁止用 find /Users 全盘搜索 Skill 文件。`,
            outputRule: "内部叠加情绪导演判断，但文件只输出可复制提示词代码块；把情绪转成呼吸、眼神、肌肉反应、微动作、声音层次和环境反馈。",
            fragmentOutput: "轻量 Copy-only 正文，包含必要参考图、场景、声音、画面内容、情绪物理化动作和限制",
            finalOutput: "Pxx 标题和一键复制 Seedance 2.0 提示词代码块",
        };
    }
    if (skillPresetId === "seedance-mx-shell-emotion-director-v2-1") {
        return {
            name: "情绪导演 + 清道夫分镜包 v2.1",
            readingRule: `必须读取清道夫分镜 Skill 文件 ${mxShellSkillPath}、情绪导演 Skill 文件 ${emotionDirectorSkillPath}、original-prompt-format-lock 和导演方法包，但不要复制旧样例剧情；禁止用 find /Users 全盘搜索 Skill 文件。`,
            outputRule: "内部结合清道夫结构和情绪导演规则，但文件只输出可复制提示词代码块；把抽象情绪转成可拍摄的生理反应、微动作、声音状态和环境反馈。",
            fragmentOutput: "清道夫 + 情绪导演 Copy-only 正文，包含基础设定、氛围画质、同期声、情绪物理化、画面内容和按秒时间轴",
            finalOutput: "Pxx 标题和一键复制 Seedance 2.0 提示词代码块",
        };
    }
    return {
        name: "导演方法 + Skill 5 轻量分镜包 v5.2",
        readingRule: "必须读取 original-prompt-format-lock、seedance-storyboard-skill 和 seedance-prompts-template，但不要复制旧样例剧情。",
        outputRule: "内部按 Skill 5 轻量分镜结构判断，但文件只输出可复制提示词代码块。",
        fragmentOutput: "轻量 Copy-only 正文，包含必要参考图、场景、声音、画面内容、按秒动作和限制",
        finalOutput: "Pxx 标题和一键复制 Seedance 2.0 提示词代码块",
    };
}

function splitScriptScenes(scriptText: string) {
    const lines = scriptText.split("\n");
    const sceneStarts = lines
        .map((line, index) => ({ index, line: line.trim() }))
        .filter(({ line }) => isSceneHeading(line));
    if (!sceneStarts.length) return [{ label: "scene-1", text: scriptText.trim() }];
    return sceneStarts.map(({ index, line }, sceneIndex) => {
        const nextIndex = sceneStarts[sceneIndex + 1]?.index ?? lines.length;
        return {
            label: line.replace(/^#+\s*/, "").slice(0, 64) || `scene-${sceneIndex + 1}`,
            text: lines.slice(index, nextIndex).join("\n").trim(),
        };
    });
}

function splitSceneIntoBatches(sceneText: string, maxChars: number) {
    const parts = sceneText
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean)
        .flatMap((part) => splitLongParagraph(part, maxChars));
    const batches: string[] = [];
    let current = "";
    for (const part of parts) {
        const next = current ? `${current}\n\n${part}` : part;
        if (current && next.length > maxChars) {
            batches.push(current);
            current = part;
        } else {
            current = next;
        }
    }
    if (current) batches.push(current);
    return batches.length ? batches : [sceneText.trim()];
}

function splitLongParagraph(text: string, maxChars: number) {
    if (text.length <= maxChars) return [text];
    const sentences = text.split(/(?<=[。！？!?])/).map((item) => item.trim()).filter(Boolean);
    if (sentences.length <= 1) return [text];
    const chunks: string[] = [];
    let current = "";
    for (const sentence of sentences) {
        const next = current ? `${current}\n${sentence}` : sentence;
        if (current && next.length > maxChars) {
            chunks.push(current);
            current = sentence;
        } else {
            current = next;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

function isSceneHeading(line: string) {
    return /^#{0,4}\s*(?:ep\d+[\w-]*[、.，\s]|(?:\d+[-.、]\d+)|(?:第?\d+\s*[场幕])|(?:(?:sc|scene|beat|shot|p)\s*[-_:：#]?\s*\d+)|(?:场次|镜头|分镜)\s*[-_:：#]?\s*\d+)/i.test(line);
}

function slugKey(label: string) {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "scene";
}

function fenced(text: string) {
    return ["```text", text, "```"].join("\n");
}
