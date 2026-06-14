export type CharacterImagePromptInput = {
    description?: string;
    sourcePrompt?: string;
    title?: string;
};

export function buildCharacterImagePrompt({ description = "", sourcePrompt = "", title = "" }: CharacterImagePromptInput) {
    const sourceText = [sourcePrompt, description].map((item) => item.trim()).filter(Boolean).join("\n");
    if (isFullCharacterImagePrompt(sourceText)) return sourceText;
    const name = title.trim() || "当前角色";
    const height = extractCharacterHeight(sourceText);
    return [
        "请根据以下文字设定，生成一张「角色图：影视级角色设定板 / Character Design Sheet / Turnaround Sheet」。",
        "",
        "21:9 超宽屏横版构图，纯白干净背景，专业影视角色档案设定图。整体像真实剧组为演员拍摄的服化道定妆照、试装照、角色档案照，不是游戏 CG，不是 AI 精修写真，不是时尚广告大片。",
        "画面真实、克制、自然，带有短剧剧情片的冷感写实风格。白棚柔和漫反射光，中性自然色温，低反差阴影，低锐化，低磨皮，保留轻微真实摄影颗粒。",
        "全图所有人物的五官、发型、服装、体型、肤色完全一致，人物表情自然克制。",
        "",
        "【角色设定】",
        `角色名称：${name}`,
        `角色身高：${height || "未明确，请根据角色年龄、性别、身份和体型推断一个真实演员身高，并在画面中清晰标注"}`,
        sourceText ? `文字设定：\n${sourceText}` : "文字设定：请根据角色名称和剧情语境补足真实、克制、可拍摄的影视角色外貌、体型、服装和气质。",
        "",
        "请从文字设定中提炼：角色身份、年龄、性别、脸型、五官、肤色、发型、发色、眼神、妆容状态、身材比例、站姿气质、服装结构、材质、颜色、鞋子、磨损程度、世界观风格、人物气质和关键配件。不要编造成与文字设定冲突的新身份或夸张造型。",
        "",
        "【画面版式】",
        "整体是一张完整角色设定板，采用专业影视服化道设计稿排版，干净、克制、清晰。",
        "左侧为角色正面大头部特写：必须正面平视，人物脸部正对镜头，双眼直视观众；头部端正，不侧脸、不回头、不低头、不仰头、不三分之二侧脸；镜头高度与人物眼睛齐平，展示完整正面脸部、发型、眼神、真实皮肤纹理、妆容和领口服装细节。大特写占画面约 30%-40%，只生成一个稳定的正面大特写，像演员定妆档案照。",
        "中间主体区域为三视图：FRONT VIEW 正面、SIDE VIEW 侧面、BACK VIEW 背面。三视图必须完整全身入镜，标准自然站姿或轻微 A-pose，三个视图身高、头身比例、肩宽、腰线、腿长、鞋跟高度、镜头高度、透视和服装结构完全一致，鞋底完整可见。三视图必须是同一个角色，只改变观察角度。",
        "",
        "【身高与比例标注】",
        "必须在 FRONT VIEW 正面全身图左侧绘制清晰垂直身高刻度线，刻度线从脚底延伸到头顶。身高数字必须清晰可见，放在刻度线顶部附近；如果文字设定提供了身高，必须标注该身高。",
        "三视图脚底必须对齐同一水平基准线，三视图头顶必须对齐同一高度基准线。加入简洁横向比例参考线：head line、shoulder line、waist line、knee line、foot line。比例线干净、细、淡，不遮挡人物主体。",
        "角色身高比例真实，禁止腿部异常拉长、身体比例走形、不同视图高矮不一致、侧面和背面变成不同身材。",
        "",
        "【右侧信息区】",
        "右侧上方生成 COLOR PALETTE 色卡区域，5-6 个矩形色卡整齐排列，自动提取发色、肤色、服装主色、服装辅色、鞋子颜色、配件或装备颜色。允许标题 COLOR PALETTE，不要复杂说明文字。",
        "右侧下方生成 ACCESSORIES 配件特写区域，根据角色设定选择 2-3 个关键配件特写，例如耳机、腰带、鞋子、手套、工具、饰品、徽章、特殊装备。若无明显配件，则展示鞋子、领口、袖口、腰部结构、面料细节等服装局部特写。允许标题 ACCESSORIES，不要复杂说明文字。",
        "",
        "【摄影与质感】",
        "真实相机拍摄质感，70mm 或 85mm 人像镜头观感。白棚柔和漫反射光，低反差，中性自然色温，不要强 HDR，不要强烈轮廓光，不要过度棚拍高光。",
        "皮肤必须是真实人类皮肤质感，保留自然毛孔、轻微肤色不均、眼下细节、鼻翼和唇周真实纹理；自然哑光或半哑光，不要玻璃皮、蜡像皮、塑料脸、大面积油光或过度美颜。",
        "头发要有真实发束、发根层次、发尾细节和少量自然碎发，不要塑料假发、不要过度发光、不要整片发亮。",
        "服装要呈现真实布料、皮革、尼龙、棉麻、金属或其他材质的自然状态，有真实缝线、折痕、压痕、穿着张力和轻微使用痕迹。黑色或深色服装必须有层次，不要死黑一片；皮革偏真实哑光或半哑光，不要乳胶感或亮面塑料感。",
        "",
        "【文字规则】",
        "允许出现必要英文小标题、视图标签、身高数字和比例刻度标注。允许文字仅包括：FRONT VIEW、SIDE VIEW、BACK VIEW、COLOR PALETTE、ACCESSORIES、角色身高、head line、shoulder line、waist line、knee line、foot line。禁止其他无关文字、乱码、logo、水印、广告文字。",
        "",
        "【禁止项】",
        "禁止多个重复表情图、表情三连图、脸部漂移、三视图变成不同人物、肢体错误、手指错误、服装结构变化、身高不一致、腿部过长、头身比例异常、透视变形、额外人物、杂乱背景、低清晰度、CG 塑料感、游戏角色渲染感、AI 油腻感、塑料脸、玻璃皮肤、蜡像皮肤、过度磨皮、过度锐化、HDR 质感、商业写真精修感、皮肤大面积油光、头发像塑料假发、服装像乳胶或亮面塑料、脸部过度完美、过度对称、过度美颜、高饱和妆容和网红滤镜。",
        "禁止左侧大特写为侧脸、回头看镜头、三分之二角度、低头、仰头、斜视或眼神看向画面外。禁止三视图脚底不对齐、头顶不对齐、正面/侧面/背面服装细节不一致。禁止省略身高数字，禁止身高数字乱码，禁止比例标注变成杂乱文字。",
        "",
        "结构关键词：character turnaround sheet, film costume design sheet, production design board, front side back view, single front-facing portrait close-up, eye-level portrait, looking directly at camera, height measurement scale, clearly labeled height number, proportion guide lines, body proportion chart, head line, shoulder line, waist line, knee line, foot line, accessories breakdown, color palette extraction, white studio background, clean professional layout, costume fitting photo, wardrobe test photo, casting reference photo, real human skin texture, matte skin, subtle pores, slight skin imperfections, natural hair flyaways, soft diffused studio light, low contrast, low sharpening, no HDR, no plastic skin, no glossy skin, no wax skin, no beauty filter, no over-retouching, no CG render, no game character render, photorealistic.",
    ].join("\n");
}

function isFullCharacterImagePrompt(text: string) {
    return text.includes("【画面版式】") && text.includes("【身高与比例标注】") && text.includes("【右侧信息区】") && text.includes("【禁止项】");
}

function extractCharacterHeight(text: string) {
    return text.match(/(?:身高|height)[：:\s]*([12]\d{2}\s?cm)/i)?.[1]?.replace(/\s+/g, "") || text.match(/\b([12]\d{2}\s?cm)\b/i)?.[1]?.replace(/\s+/g, "") || "";
}
