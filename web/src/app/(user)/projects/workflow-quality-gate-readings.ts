import type { WorkflowIndustrialQualityCallNode, WorkflowReadingSourceType, WorkflowRequiredReading } from "./workflow-quality-gates";

export function buildSeedanceRequiredReadings() {
    return [...directorReadings(), ...artDesignReadings(), ...storyboardReadings()];
}

function reading(stageId: string, readingId: string, sourceFile: string, sourceType: WorkflowReadingSourceType, label: string, note?: string, industrialCallNode?: WorkflowIndustrialQualityCallNode): WorkflowRequiredReading {
    return { stageId, readingId: `${stageId}:${readingId}`, sourceFile, sourceType, label, note, industrialCallNode };
}

function directorReadings() {
    return [
        reading("director-analysis", "agents", "AGENTS.md", "rule", "主工作流规范"),
        reading("director-analysis", "director-agent", "agents/director.md", "agent", "director agent 文件"),
        reading("director-analysis", "director-skill", "skills/director-skill/SKILL.md", "skill", "导演分析技能"),
        reading("director-analysis", "director-template", "skills/director-skill/templates/director-analysis-template.md", "template", "导演分析模板"),
        reading("director-analysis", "script-review", "skills/script-analysis-review-skill/SKILL.md", "skill", "阶段一导演自审技能"),
        reading("director-analysis", "compliance-review", "skills/compliance-review-skill/SKILL.md", "skill", "合规审核技能"),
    ];
}

function artDesignReadings() {
    return [
        reading("art-design", "agents", "AGENTS.md", "rule", "主工作流规范"),
        reading("art-design", "art-agent", "agents/art-designer.md", "agent", "art-designer agent 文件"),
        reading("art-design", "director-agent", "agents/director.md", "agent", "director 审核 agent 文件"),
        reading("art-design", "art-skill", "skills/art-design-skill/SKILL.md", "skill", "服化道设计技能"),
        reading("art-design", "gemini-image-guide", "skills/art-design-skill/gemini-image-prompt-guide.md", "rule", "Gemini 图片提示词指南"),
        reading("art-design", "character-examples", "skills/art-design-skill/examples/character-prompt-examples.md", "example", "角色提示词示例"),
        reading("art-design", "scene-examples", "skills/art-design-skill/examples/scene-prompt-examples.md", "example", "场景提示词示例"),
        reading("art-design", "art-template", "skills/art-design-skill/templates/art-design-template.md", "template", "服化道输出模板"),
        reading("art-design", "art-review", "skills/art-direction-review-skill/SKILL.md", "skill", "阶段二服化道审核技能"),
        reading("art-design", "compliance-review", "skills/compliance-review-skill/SKILL.md", "skill", "合规审核技能"),
    ];
}

function storyboardReadings() {
    return [
        reading("seedance-storyboard", "agents", "AGENTS.md", "rule", "主工作流规范"),
        reading("seedance-storyboard", "storyboard-agent", "agents/storyboard-artist.md", "agent", "storyboard-artist agent 文件"),
        reading("seedance-storyboard", "director-agent", "agents/director.md", "agent", "director 审核 agent 文件"),
        reading("seedance-storyboard", "storyboard-skill", "skills/seedance-storyboard-skill/SKILL.md", "skill", "Seedance 分镜技能"),
        reading("seedance-storyboard", "methodology", "skills/seedance-storyboard-skill/seedance-prompt-methodology.md", "rule", "Seedance 提示词方法论"),
        reading("seedance-storyboard", "industrial-stage-start", "skills/seedance-storyboard-skill/industrial-quality-rules.md", "rule", "工业化质检：阶段开始前", "记录阶段三开始前读取 industrial-quality-rules。", "stage_start"),
        reading("seedance-storyboard", "industrial-scene-start", "skills/seedance-storyboard-skill/industrial-quality-rules.md", "rule", "工业化质检：场次开写前", "记录每个场次 / 子场次开写前调用 industrial-quality-rules。", "scene_start"),
        reading("seedance-storyboard", "industrial-prompt-generated", "skills/seedance-storyboard-skill/industrial-quality-rules.md", "rule", "工业化质检：每条生成 P 后", "记录每条生成 P 写完后调用 industrial-quality-rules。", "prompt_generated"),
        reading("seedance-storyboard", "industrial-before-review", "skills/seedance-storyboard-skill/industrial-quality-rules.md", "rule", "工业化质检：导演审核前", "记录导演审核前调用 industrial-quality-rules。", "before_director_review"),
        reading("seedance-storyboard", "seedance-examples", "skills/seedance-storyboard-skill/examples/seedance-prompt-examples.md", "example", "Seedance 提示词示例"),
        reading("seedance-storyboard", "seedance-template", "skills/seedance-storyboard-skill/templates/seedance-prompts-template.md", "template", "Seedance 输出模板"),
        reading("seedance-storyboard", "seedance-review", "skills/seedance-prompt-review-skill/SKILL.md", "skill", "阶段三 Seedance 提示词审核技能"),
        reading("seedance-storyboard", "compliance-review", "skills/compliance-review-skill/SKILL.md", "skill", "合规审核技能"),
    ];
}
