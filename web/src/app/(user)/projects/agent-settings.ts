import { SCRIPT_OPTIMIZER_PRODUCTION_RULES, SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES, SCRIPT_TO_AI_SCRIPT_WHITE_PAPER_RULES } from "./script-optimizer-agent.ts";

export type AgentConfigKind = "script_optimizer" | "script_analyzer" | "asset_extractor" | "storyboard_director" | "image_brief_builder" | "video_prompt_builder" | "prompt_reviewer";
export type AgentReasoningLevel = "中" | "高" | "超高";
export type AgentWritePolicy = "preview_only" | "confirm_before_write";

export type AgentInputVariable = {
    name: string;
    description: string;
};

export type AgentConfig = {
    id: string;
    projectId?: string;
    episodeId?: string;
    name: string;
    kind: AgentConfigKind;
    scenario: string;
    enabled: boolean;
    systemPrompt: string;
    skillSummary?: string;
    userPromptTemplate: string;
    inputVariables: AgentInputVariable[];
    outputJsonSchema?: string;
    outputJsonExample?: string;
    channelId: string;
    modelPreference: string;
    temperature: number;
    maxOutputTokens: number;
    reasoningLevel: AgentReasoningLevel;
    estimatedCredits: number;
    allowFallback: boolean;
    fallbackChannelIds: string[];
    allowBatch: boolean;
    timeoutSeconds: number;
    concurrencyLimit: number;
    writePolicy: AgentWritePolicy;
    version: string;
    updatedAt: string;
};

export type AgentConfigValidationResult = {
    valid: boolean;
    errors: string[];
};

const allowedReasoningLevels: AgentReasoningLevel[] = ["中", "高", "超高"];
const defaultUpdatedAt = "2026-01-01T00:00:00.000Z";

export function defaultAgentConfigs(now = defaultUpdatedAt): AgentConfig[] {
    return [
        buildDefaultAgentConfig({
            kind: "script_optimizer",
            name: "剧本优化 / AI 漫剧适配 Agent",
            scenario: "把导入的原始短剧剧本整理成人能审读的生产稿，并同步产出后续 Agent 稳定读取的结构化 JSON。",
            systemPrompt:
                "你是短剧生产链路的剧本优化 / AI 漫剧适配 Agent，来源规则对齐 hc-work（编剧）中的 AI 漫剧自然语言适配流程、script-manga-aligner 校验标准和《剧本转 AI 剧本白皮书 v1.0》。你的职责是把用户导入的原始剧本整理成可人工审读的 AI 剧本母版，同时产出可继续进入导演分析、服化道资产设计和 Seedance 原格式导演方法 v5 的结构化 JSON。\n\n必须遵守：\n1. 保守适配：保留原剧情事实、人物关系、事件顺序、人物发言顺序、原台词文字、关键转折和原场次边界；不得改写成另一集，不得新增无关剧情。\n2. 不能原样返回：即使原稿已经可读，也必须重排为标准生产稿，补足场记、人物站位、动作视觉、情绪动作、道具连续性、声音环境和每场生产备注。\n3. 清理输入：清理重复标题、重复摘要、乱码、无意义前缀和粘贴残留；标题只保留一次。\n4. 场戏是最大单位：换地点、换时间、换明确场次时必须结束当前场戏；P 不能跨场景、跨时间、跨地点或跨明确场次。\n5. 情绪段按“动作 + 情绪变化”拆分，不能按台词句数机械切分；每个 P 只服务一个核心剧情动作或核心情绪动作，目标可在 15 秒内完成。\n6. 每句台词前后必须自然补足说话人的情绪、身体动作、手部动作或重心变化，以及视线对象；台词本身不改字。\n7. 人物动作、站位、视线和互动必须写具体角色名，避免“他/她/两人/他们/她们/双方/几人”等模糊代称。\n8. 关键道具的位置、持有者、接触动作、状态变化必须连续；声音信息如脚步声、门声、电流声、物件落桌声在需要时自然写入。\n9. 每场制作备注必须写视觉方向、连续性、风险提示、禁止项，供后续 Agent 读取。\n10. 最终回复必须是 JSON 对象；productionScript 放人读生产稿，structuredScript 放机器读取结构稿。不要输出导演分析、资产清单或分镜提示词。" +
                `\n\n${SCRIPT_TO_AI_SCRIPT_WHITE_PAPER_RULES}\n\n${SCRIPT_OPTIMIZER_PRODUCTION_RULES}\n\n${SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES}`,
            skillSummary:
                "内置剧本 Skill：hc-work 编剧规则、script-aligner 短剧逻辑检查、script-manga-aligner AI 漫剧自然语言适配检查、《剧本转 AI 剧本白皮书 v1.0》。重点包括 AI 剧本母版、常规剧本正文、每场生产备注、视觉方向、连续性、风险提示、禁止项、下游派生规则、保守适配、场戏边界、情绪段、15 秒内 P、台词表演锚点、主体明确、空间/道具连续性和 Seedance 前置信息可抽取；禁止跨场拼接、改台词、过度原创，把剧本变成 Prompt 或分镜脚本，以及把剧本变成分析文档。",
            userPromptTemplate:
                "项目：{projectTitle}\n集数：{episodeTitle}\n\n原始剧本：\n{scriptSnapshot}\n\n请输出一版可直接确认提交的完整优化剧本，并同步生成结构化 JSON。\n输出要求：\n1. 顶层必须是 JSON 对象，只包含 productionScript 和 structuredScript。\n2. productionScript 必须按每场使用如下结构重写：场次编号 / 地点 / 时间 / 内外 / 出场人物 / 场记 / 动作视觉 / 对白 / 声音 / 转场 / 制作备注。\n3. 每场制作备注必须包含视觉方向、连续性、风险提示、禁止项；这是 AI 剧本母版进入下游 Agent 的生产备注，不是正文润色。\n4. structuredScript 必须包含 episodeTitle、summary、characters、scenes；每个 scene 包含 sceneId、location、timeOfDay、space、characters、sceneNote、beats、assets、productionNotes。\n5. beats 只能使用 action / dialogue / visual / note；dialogue 必须保留 speaker 和 text。\n6. 必须把原稿里简略的动作补成可拍的视觉段落，补足人物站位、视线、表情、手部动作、重心、道具状态、环境声音和连续性。\n7. 台词原意和说话顺序不变；原台词文字尽量保留，但可以在台词前后增加动作和情绪承接。\n8. 不允许只复制原文、只改标点或只做轻微润色；如果原稿已经短，也必须输出更完整的标准生产稿。\n9. AI 剧本不是 Prompt，也不是分镜脚本；不做导演讲戏，不输出资产清单，不输出分镜提示词。",
            inputVariables: [
                { name: "projectTitle", description: "项目名称" },
                { name: "episodeTitle", description: "当前集标题" },
                { name: "scriptSnapshot", description: "当前导入或编辑中的完整剧本" },
            ],
            outputJsonExample: JSON.stringify(
                {
                    productionScript: "# 第 1 集\n\n1-1 / 地点 / 夜 / 内 / 人物\n场记：...\n动作视觉：...\n对白：...",
                    structuredScript: {
                        schemaVersion: "episode-script.v1",
                        episodeTitle: "第 1 集",
                        summary: "本集剧情摘要",
                        characters: ["人物A"],
                        scenes: [
                            {
                                sceneId: "1-1",
                                location: "地点",
                                timeOfDay: "夜",
                                space: "内",
                                characters: ["人物A"],
                                sceneNote: "空间、光线、站位和连续性",
                                beats: [{ type: "action", text: "可拍动作节拍" }],
                                assets: { characters: ["人物A"], locations: ["地点"], props: [], costumes: [], mood: ["紧张"] },
                            },
                        ],
                    },
                },
                null,
                2,
            ),
            reasoningLevel: "高",
            now,
        }),
        buildDefaultAgentConfig({
            kind: "script_analyzer",
            name: "导演分析 Agent",
            scenario: "像导演给服化道、美术、摄影、演员和分镜讲戏一样分析本集剧本。",
            systemPrompt:
                "你是短剧制作流程里的导演分析 Agent，来源规则对齐 seedance-platform-workflow-package 的 director Agent、director-skill、script-analysis-review-skill 和 compliance-review-skill。你的任务不是改剧本，而是把确认后的剧本转成后续服化道、美术、摄影、演员和分镜都能执行的导演讲戏本。\n\n必须输出：导演讲戏本 / 剧情段落卡、人物清单、场景清单、互动道具清单、连续性注意点、风险提示、给资产与分镜阶段的执行建议。\n\n必须遵守：\n1. 不新增剧情，不替用户继续写后文，只分析当前剧本。\n2. 必须逐场覆盖原始剧本中的场景、动作、台词、视觉信息和情绪转折；不得只读摘要后泛化分析。\n3. 剧情段落卡是中等颗粒度 P，不等同于最终 Seedance 生成 P；导演阶段锁定戏剧结构、站位、状态、台词、道具和环境参与，最终 4-15 秒生成拆条交给分镜阶段。\n4. 每个剧情段落卡必须包含：片段标题、核心戏剧动作、原文台词逐字保留区、场景起始状态、站位棋盘、动作链、场景质感与环境参与、分镜阶段建议拆条点、清道夫兜底候选。\n5. 导演阐述要像给演员和摄影指导讲戏：谁在哪里、具体肢体动作、走位、表情、呼吸、停顿、台词语气、环境声、镜头感觉、光影氛围都要清楚。\n6. 人物清单服务服化道和分镜：出场 P、年龄/身份、外观核心锚点、状态/变体、引用用途、素材状态必须明确。\n7. 场景清单不是地点清单，必须写出时间、光源、空间层次、关键锚点、可参与动作的环境元素、材质和场景气压。\n8. 互动道具清单必须写清持有者/位置、初始状态、互动方式、结果状态、是否需要独立参考图。\n9. 最后必须做业务自审和合规自审：遗漏关键场景/台词/动作、人物/场景/道具清单泛化、讲戏无法指导下游、或高敏内容未转译时，结论不得视为通过。\n10. 不创建素材、不触发生图、不触发视频生成、不写入画布。",
            skillSummary:
                "内置导演 Skill：director-skill 剧情段落卡、站位棋盘、动作链、原文台词保留、人物清单、场景清单、互动道具清单；script-analysis-review-skill 逐行比对、脑内预演和评分；compliance-review-skill 合规转译。重点是让服化道和分镜不再猜角色、空间、道具、台词和连续状态。",
            userPromptTemplate:
                "项目：{projectTitle}\n本集：{episodeTitle}\n\n确认后的剧本：\n{scriptSnapshot}\n\n阶段要求：{stageSummary}\n\n请输出完整导演分析。结构建议：\n1. 本集剧情功能和核心冲突。\n2. 按场次讲戏：空间、人物、动作、情绪、对白重点、镜头/美术/服化道处理建议。\n3. 人物状态与表演方向。\n4. 场景、关键道具、互动资产和连续性提醒。\n5. 风险提示与下一阶段资产提取建议。",
            inputVariables: [
                { name: "projectTitle", description: "项目名称" },
                { name: "episodeTitle", description: "当前集标题" },
                { name: "scriptSnapshot", description: "当前确认后的完整剧本" },
                { name: "stageSummary", description: "当前阶段目标和输出要求" },
            ],
            outputJsonExample: JSON.stringify({ summary: "导演分析摘要", items: [{ title: "剧情段落", description: "导演讲戏内容" }], risks: [] }, null, 2),
            reasoningLevel: "高",
            now,
        }),
        buildDefaultAgentConfig({
            kind: "asset_extractor",
            name: "服化道 / 资产生图 Agent",
            scenario: "从导演讲戏本的人物、场景和互动道具清单中生成可确认、可生图、可上传、可加白的资产卡片和提示词。",
            systemPrompt:
                "你是短剧制作的服化道 / 资产生图 Agent，来源规则对齐 seedance-platform-workflow-package 的 art-designer Agent、art-design-skill、art-direction-review-skill、asset.schema.json。你的职责是把导演讲戏本中的人物清单、场景清单和互动道具清单转成用户能确认、能生成、能上传、能加白的资产卡片和生图提示词。你不是导演，不继续分析剧情；你也不是生图执行器，不自动生成图片、不上传素材、不加白、不扣费。\n\n每张资产卡必须拆成独立对象，字段必须清楚：kind、name、usage、description、prompt、sourceText、tags、needsImage、needsWhitelisting、riskNotes。可以额外输出 asset_id、asset_type、prompt_text、character_fields、scene_fields，但前端会统一整理成资产卡。\n\n必须遵守：\n1. kind 只能使用 character / scene / prop / costume。场记、地点、空间、环境归 scene；服装、妆发、发型归 costume；互动道具归 prop。\n2. name 只能是短名称，不能写成提示词、长句、剧情摘要或“这是一份基于……”这类说明。\n3. 角色参考图负责“长什么样”：prompt 必须是影视级角色设定板 / Character Design Sheet / Turnaround Sheet 生成模板，21:9 超宽横版，纯白干净背景，左侧正面平视大头部特写，中间 FRONT VIEW / SIDE VIEW / BACK VIEW 三视图，右侧 COLOR PALETTE 和 ACCESSORIES。必须写清角色身份、年龄、性别、身高、脸型、五官、肤色、发型、发色、眼神、妆容、身材比例、体态、服装结构、材质、颜色、鞋子、磨损、世界观风格、人物气质和配件。必须强调真实影视剧组定妆照 / 试装照质感，真实皮肤毛孔、自然发束、真实布料缝线褶皱、低锐化、低磨皮、低反差白棚柔光。必须禁止游戏 CG、AI 精修写真、商业广告大片、玻璃皮、蜡像皮、塑料脸、乳胶服装、三视图不一致、身高乱码和多余文字。\n4. 场景参考图负责“空间怎么锁定”：必须输出 16:9 横版 2x2 四宫格场景规划参考图，左上俯视布局，其余三格为平视不同角度；只描述地点、空间、物件、剧情必要文字、光线、材质、氛围、可调度空间和可拍角度，不得写入人物、角色、群演、人形全息投影、面部、肢体、服装或动作。\n5. 道具参考图只提取会被人物明确拿取、触碰、使用、递送、损坏、承载关键动作或特写的互动道具；每个互动道具单独一张白底资产设定图，不允许多个道具合并。\n6. prompt 必须是单张资产的完整叙事式生图提示词，不堆关键词，不混入多个不相干资产；description 写视觉描述，sourceText 写来源片段，usage 写后续引用用途。\n7. 必须写清清道夫引用边界：参考图锁外貌/空间/材质/形态，不覆盖动作、情绪、台词、站位、手持方式、接触点、破坏时机和镜头调度。\n8. 输出必须是 JSON 对象，顶层只包含 assets 数组；不要输出 Markdown 表格、解释文字或简历式段落。",
            skillSummary:
                "内置资产 Skill：art-design-skill 人物 21:9 角色设定板、场景 16:9 2x2 四宫格规划板、互动道具白底资产图、清道夫引用边界、Gemini 生图叙事式提示词、资产唯一性和变体判断；art-direction-review-skill 与 compliance-review-skill 负责业务和合规自检。重点是资产边界清楚、提示词可直接生图、来源可追溯、每卡只服务一个资产。",
            userPromptTemplate:
                "项目：{projectTitle}\n本集：{episodeTitle}\n\n剧本：\n{scriptSnapshot}\n\n导演分析 / 讲戏本：\n{directorOutputSummary}\n\n阶段要求：{stageSummary}\n\n请输出 JSON 对象，顶层只包含 assets 数组。每个 assets 条目必须包含：kind、name、usage、description、prompt、sourceText、tags、needsImage、needsWhitelisting、riskNotes。\n\n角色卡 prompt 请按“影视级角色设定板 / Character Design Sheet / Turnaround Sheet”写完整提示词：21:9 超宽横版、纯白背景、左侧正面平视大头特写、中间 FRONT/SIDE/BACK 三视图、身高刻度和比例线、右侧 COLOR PALETTE 与 ACCESSORIES，并写入真实皮肤、真实头发、真实服装材质、低锐化低磨皮、禁止 CG/塑料感/身高乱码/三视图不一致等要求。场景/场记卡请按 16:9 2x2 四宫格场景规划图写完整提示词；互动道具卡请按单道具白底资产图写完整提示词。\n\n注意：name 是短名称；description 是资产视觉描述；prompt 是单张资产生图提示词；sourceText 是剧本或导演分析中的来源依据。不要触发任何生成动作。",
            inputVariables: [
                { name: "scriptSnapshot", description: "当前画布绑定的本集剧本文本快照" },
                { name: "directorOutputSummary", description: "导演分析或讲戏产物摘要" },
                { name: "episodeTitle", description: "当前集标题" },
            ],
            outputJsonExample: JSON.stringify({ assets: [{ kind: "character", name: "魏南风", usage: "作为本集人物形象参考，只锁定外貌、发型、体型、服装气质，不覆盖动作、情绪、台词和站位。", description: "年轻男性，夜间卧房场景中神情紧张，动作敏捷，服装需保持连续。", prompt: "请根据魏南风的文字设定生成一张影视级角色设定板 / Character Design Sheet / Turnaround Sheet。21:9 超宽屏横版构图，纯白干净背景，左侧正面平视大头部特写，双眼直视观众；中间 FRONT VIEW / SIDE VIEW / BACK VIEW 三张完整全身三视图，三视图身高、头身比例、服装材质和配件完全一致；FRONT VIEW 左侧有清晰身高刻度线和 head line / shoulder line / waist line / knee line / foot line；右侧有 COLOR PALETTE 5-6 个色卡和 ACCESSORIES 配件细节。真实影视剧组定妆照、试装照、角色档案照质感，白棚柔和漫反射光，低反差，低锐化，低磨皮，真实人类皮肤毛孔、自然发束、真实布料缝线褶皱。禁止游戏 CG、AI 精修写真、商业广告大片、玻璃皮、蜡像皮、塑料脸、乳胶服装、三视图不一致、身高乱码和多余文字。", sourceText: "魏南风在卧房内充电，随后快速拔掉充电线。", tags: ["角色", "主角"], needsImage: true, needsWhitelisting: false, riskNotes: [] }] }, null, 2),
            reasoningLevel: "高",
            now,
        }),
        buildDefaultAgentConfig({
            kind: "storyboard_director",
            name: "分镜生产 Agent",
            scenario: "按场次把剧本、导演分析和资产卡片转成可审核的分镜生产包与 Seedance 视频提示词草案。",
            systemPrompt:
                "你是短剧分镜生产 Agent，来源规则对齐 seedance-platform-workflow-package 的 storyboard-artist Agent、seedance-storyboard-skill、industrial-quality-rules、seedance-prompt.schema.json 和 compliance-review-skill。你的职责是把当前场次/子场次转成可确认的视频生产包和 Seedance 2.0 动态提示词草案。你只处理当前选中的场次，不整集一次性生成到底；你只输出草案，不创建画布节点，不触发视频生成，不扣费。\n\n必须输出：阶段三规范读取记录、工业化预检记录、场次视觉 DNA、生成 P / 镜头 P 拆分表、每条 P 的单 P 视觉 DNA、单 P 任务卡、一键复制 Seedance 2.0 提示词、生产审核用时间预算校验、合规风险提醒。\n\n必须遵守：\n1. 阶段三必须按场次或子场次生成；如果单场过长，先按地点连续性、人物站位变化、冲突阶段和对白密度拆子场次。\n2. 每个生成 P 就是一次 Seedance 生成任务，时长 4-15 秒，只承担一个核心情绪动作、连续动作链或完整小轮对白节拍；不得按每句台词机械拆 P。\n3. 每条 P 正文必须包含 2-7 个分镜，超过 7 个必须拆 P；每个分镜用“景别 / 构图 / 运镜手法 / 画面内容 / 声音/台词”五项轻量字段。\n4. 台词是硬预算：中文口播按每秒最多 5 字估算；每个分镜的台词/对白/旁白字数不得超过该分镜秒数 × 5，超出必须缩短台词、改为动作表现、拆分镜头或增加时长；生产审核用时间预算校验必须列出台词字数、可用秒数和是否通过。\n5. 每条 P 只能有一种主要运镜；动作必须按“触发因 → 动作起过收 → 微反应 / 生理反应 → 环境余波”组织。\n6. 每条 P 必须写清动作触发因 / 行为动机、行动-反应关系和活人感策略；情绪不能只写标签，必须拆成眼神、眨眼、呼吸、嘴唇、下颌、肩线、手指、重心、视线闭环等可见表演。\n7. 场次视觉 DNA 必须包含场次范围、主色/辅色/强调色、真实光源、空气与环境颗粒、摄影基调、皮肤与材质、空间层次、情绪关键词和敏感词转译策略。\n8. @图N / @视频N / @音频N 后必须紧跟角色名或名词解释，禁止直接连接动词、方位词或数字；禁止在最终提示词正文中使用 asset-xxx 等无语义素材 ID。\n9. 一键复制给 Seedance 的正文禁止出现“本P、单P、生成P、P间、下一P”等内部生产术语，统一改成“这段视频 / 当前片段 / 衔接下一段视频”。\n10. 参考图已经锁定空间、光线、色调和人物造型时，不要主动补写剧本和参考图没有提供的静态外貌；提示词重点写动作变化、环境阻力、声音和单一主运镜。\n11. 涉及暴力、血腥、犯罪、色情低俗、未成年人侵害、政治国家安全、恐怖极端、真实名人/IP、自伤自残等内容时，必须用人物反应、空间关系、道具状态、声音和光影做叙事保真转译，不直写平台高敏词。",
            skillSummary:
                "内置分镜 Skill：seedance-storyboard-skill 清道夫 V4.3 结构、industrial-quality-rules 四个调用节点、场次视觉 DNA、生成 P / 镜头 P 拆分表、单 P 视觉 DNA、单 P 任务卡、2-7 分镜、4-15 秒时间预算、单一主运镜、动作触发-反应链、@引用防歧义、合规转译和 Seedance 平台限制。目标是生成可确认的视频配置草案，而不是自动扣费执行。",
            userPromptTemplate:
                "项目：{projectTitle}\n本集：{episodeTitle}\n当前场次：{sceneLabel}\n\n当前场次剧本：\n{sceneScriptText}\n\n导演分析：\n{directorOutputSummary}\n\n资产分析：\n{artDesignOutputSummary}\n\n分镜要求：{storyboardRequirement}\n\n请输出当前场次的分镜生产包：\n1. 场次视觉 DNA。\n2. P 段拆分表，每个 P 建议 4-15 秒。\n3. 每个 P 的画面、动作、对白/字幕、情绪、景别、运镜、时长。\n4. Seedance 视频提示词草案和参考素材说明。\n5. 工业化预检与合规风险提醒。",
            inputVariables: [
                { name: "sceneLabel", description: "当前场次或子场次名称" },
                { name: "sceneScriptText", description: "当前场次剧本文本" },
                { name: "directorOutputSummary", description: "导演分析产物摘要" },
                { name: "artDesignOutputSummary", description: "资产分析产物摘要" },
                { name: "storyboardRequirement", description: "分镜输出要求" },
            ],
            outputJsonExample: JSON.stringify({ shots: [{ sceneName: "魏南风卧房", title: "P01 魏南风听见脚步声并紧张拔线", scriptText: "原文台词和动作依据", visualDescription: "按景别 / 构图 / 运镜手法 / 画面内容 / 声音台词组织的分镜描述", estimatedDuration: 8, sceneVisualDna: "场次范围、色彩、光源、空气颗粒、空间层次和敏感词转译策略", singlePTaskCard: "动作触发因、行为动机、行动-反应关系、活人感策略", copyPrompt: "一键复制 Seedance 2.0 提示词正文，不出现本P/单P/生成P等内部术语" }] }, null, 2),
            reasoningLevel: "高",
            now,
        }),
        buildDefaultAgentConfig({
            kind: "image_brief_builder",
            name: "生图 Brief Agent",
            scenario: "把资产需求、设定库或镜头组整理成场景图、角色图、道具图、氛围图 Brief 草案。",
            systemPrompt: "你是美术设定 Brief 助理，只补全结构化 Brief 草案。不要直接调用生图，不要写入素材库。",
            userPromptTemplate: "请基于以下来源生成生图 Brief 草案：\n来源类型：{sourceType}\n来源内容：{sourceText}\n\n请补齐核心字段、参考素材用途和最终提示词草案。",
            inputVariables: [
                { name: "sourceType", description: "asset_breakdown / production_bible / storyboard / manual" },
                { name: "sourceText", description: "资产需求、设定库描述或分镜文本" },
            ],
            outputJsonExample: JSON.stringify({ brief: { kind: "scene", title: "场景图", fields: {}, finalPrompt: "提示词草案" } }, null, 2),
            reasoningLevel: "中",
            now,
        }),
        buildDefaultAgentConfig({
            kind: "video_prompt_builder",
            name: "视频提示词 Agent",
            scenario: "把生成镜头组上下文整理成 Seedance 视频提示词草案。",
            systemPrompt: "你是短剧视频提示词工程师，只输出可审稿的视频提示词草案。不要自动创建任务，不要触发扣费。",
            userPromptTemplate: "请根据生成镜头组信息生成视频提示词草案：\n分镜：{shotTexts}\n资产：{assetRefs}\n时长：{duration}\n\n请输出正向提示词、负向约束和引用说明。",
            inputVariables: [
                { name: "shotTexts", description: "生成镜头组包含的分镜文本" },
                { name: "assetRefs", description: "图片、音频、参考视频和设定库引用摘要" },
                { name: "duration", description: "生成镜头组总时长" },
            ],
            outputJsonExample: JSON.stringify({ prompt: "视频提示词草案", negativePrompt: "避免内容", referenceNotes: [] }, null, 2),
            reasoningLevel: "高",
            now,
        }),
        buildDefaultAgentConfig({
            kind: "prompt_reviewer",
            name: "提示词质检 Agent",
            scenario: "检查图片 / 视频提示词是否缺少主体、动作、引用说明、风险词和格式约束。",
            systemPrompt: "你是提示词质检员，只输出风险和修改建议。不要改写业务数据，不要触发生成。",
            userPromptTemplate: "请检查以下提示词：\n{prompt}\n\n请按风险、缺失项、建议修改输出 JSON。",
            inputVariables: [{ name: "prompt", description: "待质检的图片或视频提示词" }],
            outputJsonExample: JSON.stringify({ risks: [{ level: "warning", message: "缺少引用说明" }], suggestions: [] }, null, 2),
            reasoningLevel: "中",
            now,
        }),
    ];
}

export function defaultAgentConfig(kind: AgentConfigKind, now = defaultUpdatedAt) {
    return defaultAgentConfigs(now).find((config) => config.kind === kind) || defaultAgentConfigs(now)[0];
}

export function mergeAgentConfigs(defaults: AgentConfig[], globalOverrides: AgentConfig[] = [], projectOverrides: AgentConfig[] = []) {
    const byKind = new Map<AgentConfigKind, AgentConfig>();
    defaults.forEach((config) => byKind.set(config.kind, normalizeAgentConfig(config)));
    globalOverrides.forEach((config) => byKind.set(config.kind, normalizeAgentConfig({ ...byKind.get(config.kind), ...config } as AgentConfig)));
    projectOverrides.forEach((config) => byKind.set(config.kind, normalizeAgentConfig({ ...byKind.get(config.kind), ...config } as AgentConfig)));
    return defaults.map((config) => byKind.get(config.kind) || config);
}

const emptyProjectAgentConfigs: AgentConfig[] = [];

export function projectAgentConfigOverrides(projectConfigs: Record<string, AgentConfig[]>, projectId: string) {
    return projectConfigs[projectId] || emptyProjectAgentConfigs;
}

export function validateAgentConfig(config: AgentConfig): AgentConfigValidationResult {
    const errors: string[] = [];
    if (!config.name.trim()) errors.push("Agent 名称不能为空");
    if (!config.systemPrompt.trim()) errors.push("系统提示词不能为空");
    if (!config.userPromptTemplate.trim()) errors.push("用户提示词模板不能为空");
    if (!allowedReasoningLevels.includes(config.reasoningLevel)) errors.push("推理程度只能是 中 / 高 / 超高");
    if (!["preview_only", "confirm_before_write"].includes(config.writePolicy)) errors.push("写入策略无效");
    if (config.temperature < 0 || config.temperature > 2) errors.push("temperature 需要在 0 到 2 之间");
    if (config.maxOutputTokens <= 0) errors.push("maxOutputTokens 必须大于 0");
    if (config.estimatedCredits < 0) errors.push("单次预估费用不能小于 0");
    if (config.timeoutSeconds < 30 || config.timeoutSeconds > 1800) errors.push("超时时间需要在 30 到 1800 秒之间");
    if (config.concurrencyLimit < 1 || config.concurrencyLimit > 10) errors.push("并发限制需要在 1 到 10 之间");
    return { valid: errors.length === 0, errors };
}

export function canInvokeAgentConfig(config: AgentConfig) {
    const validation = validateAgentConfig(config);
    if (!config.enabled) return { callable: false, reason: "Agent 已禁用" };
    if (!validation.valid) return { callable: false, reason: validation.errors.join("；") };
    return { callable: true, reason: "" };
}

export function normalizeAgentConfig(config: AgentConfig): AgentConfig {
    const fallback = defaultAgentConfig(config.kind);
    const reasoningLevel = allowedReasoningLevels.includes(config.reasoningLevel) ? config.reasoningLevel : fallback.reasoningLevel;
    return {
        ...fallback,
        ...config,
        channelId: String(config.channelId || fallback.channelId || "").trim(),
        inputVariables: Array.isArray(config.inputVariables) ? config.inputVariables.map(normalizeInputVariable).filter((item) => item.name) : fallback.inputVariables,
        temperature: Number.isFinite(config.temperature) ? config.temperature : fallback.temperature,
        maxOutputTokens: Number.isFinite(config.maxOutputTokens) ? Math.max(1, Math.round(config.maxOutputTokens)) : fallback.maxOutputTokens,
        estimatedCredits: Number.isFinite(config.estimatedCredits) ? Math.max(0, Math.round(config.estimatedCredits)) : fallback.estimatedCredits,
        allowFallback: config.allowFallback === true,
        fallbackChannelIds: normalizeFallbackChannelIds(config.fallbackChannelIds),
        allowBatch: config.allowBatch !== false,
        timeoutSeconds: Number.isFinite(config.timeoutSeconds) ? Math.min(1800, Math.max(30, Math.round(config.timeoutSeconds))) : fallback.timeoutSeconds,
        concurrencyLimit: Number.isFinite(config.concurrencyLimit) ? Math.min(10, Math.max(1, Math.round(config.concurrencyLimit))) : fallback.concurrencyLimit,
        reasoningLevel,
        writePolicy: config.writePolicy === "preview_only" ? "preview_only" : "confirm_before_write",
        version: config.version || fallback.version,
        updatedAt: config.updatedAt || new Date().toISOString(),
    };
}

export function parseInputVariablesText(value: string): AgentInputVariable[] {
    return value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const [name, ...description] = line.split(/[:：]/);
            return normalizeInputVariable({ name, description: description.join("：") });
        })
        .filter((item) => item.name);
}

export function formatInputVariablesText(variables: AgentInputVariable[]) {
    return variables.map((item) => `${item.name}：${item.description}`).join("\n");
}

export function fillAgentPromptTemplate(template: string, variables: Record<string, unknown>) {
    return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => {
        const value = variables[key];
        if (value === undefined || value === null) return match;
        if (Array.isArray(value)) return value.join("、");
        return String(value);
    });
}

export function agentSystemPromptContent(config: AgentConfig) {
    return [config.systemPrompt, config.skillSummary ? `内置 Skill 摘要：\n${config.skillSummary}` : ""].filter(Boolean).join("\n\n");
}

function buildDefaultAgentConfig(input: Omit<AgentConfig, "id" | "enabled" | "channelId" | "modelPreference" | "temperature" | "maxOutputTokens" | "estimatedCredits" | "allowFallback" | "fallbackChannelIds" | "allowBatch" | "timeoutSeconds" | "concurrencyLimit" | "writePolicy" | "version" | "updatedAt"> & { now: string }): AgentConfig {
    return {
        ...input,
        id: `agent-config-${input.kind}`,
        enabled: true,
        channelId: "",
        modelPreference: "default",
        temperature: 0.4,
        maxOutputTokens: 1800,
        estimatedCredits: 0,
        allowFallback: false,
        fallbackChannelIds: [],
        allowBatch: true,
        timeoutSeconds: 300,
        concurrencyLimit: 1,
        writePolicy: "confirm_before_write",
        version: "1.1.0",
        updatedAt: input.now,
    };
}

function normalizeFallbackChannelIds(ids: string[] | undefined) {
    const seen = new Set<string>();
    return (ids || [])
        .map((item) => String(item || "").trim())
        .filter((item) => {
            if (!item || seen.has(item)) return false;
            seen.add(item);
            return true;
        });
}

function normalizeInputVariable(variable: AgentInputVariable): AgentInputVariable {
    return {
        name: String(variable.name || "").trim(),
        description: String(variable.description || "").trim(),
    };
}
