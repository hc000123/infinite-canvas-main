import type { WorkflowIndustrialQualityCallNode, WorkflowReadingSourceType, WorkflowRequiredReading } from "./workflow-quality-gates";
import { SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID, SEEDANCE_MX_SHELL_STORYBOARD_V15_PRESET_ID, SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID, SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID } from "./agent-workflow-presets.ts";

export function buildSeedanceRequiredReadings(workflowId?: string) {
    if (workflowId === SEEDANCE_MX_SHELL_STORYBOARD_V15_PRESET_ID || workflowId === SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID) {
        return [...v5ScriptReadings(), ...v5ArtDesignReadings(), ...mxShellStoryboardReadings(workflowId === SEEDANCE_MX_SHELL_EMOTION_DIRECTOR_V21_PRESET_ID)];
    }
    if (workflowId === SEEDANCE_ORIGINAL_FORMAT_DIRECTOR_METHOD_V5_PRESET_ID || workflowId === SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID) {
        return [...v5ScriptReadings(), ...v5ArtDesignReadings(), ...v5StoryboardReadings(workflowId === SEEDANCE_ORIGINAL_FORMAT_EMOTION_DIRECTOR_V21_PRESET_ID)];
    }
    return [...scriptReadings(), ...artDesignReadings(), ...storyboardReadings()];
}

function reading(stageId: string, readingId: string, sourceFile: string, sourceType: WorkflowReadingSourceType, label: string, note?: string, industrialCallNode?: WorkflowIndustrialQualityCallNode): WorkflowRequiredReading {
    return { stageId, readingId: `${stageId}:${readingId}`, sourceFile, sourceType, label, note, industrialCallNode };
}

function scriptReadings() {
    return [
        reading("script-adaptation", "script-agent", "web/src/app/(user)/projects/agent-settings.ts", "agent", "script_optimizer agent 设定"),
        reading("script-adaptation", "script-rules", "web/src/app/(user)/projects/script-optimizer-agent.ts", "rule", "剧本适配与白皮书规则"),
    ];
}

function artDesignReadings() {
    return [
        reading("art-design", "agents", "AGENTS.md", "rule", "主工作流规范"),
        reading("art-design", "art-agent", "agents/art-designer.md", "agent", "art-designer agent 文件"),
        reading("art-design", "director-agent", "agents/director.md", "agent", "director 参考文件"),
        reading("art-design", "director-skill", "skills/director-skill/SKILL.md", "skill", "内置导演讲戏技能"),
        reading("art-design", "director-template", "skills/director-skill/templates/director-analysis-template.md", "template", "导演讲戏模板"),
        reading("art-design", "script-review", "skills/script-analysis-review-skill/SKILL.md", "skill", "内置导演自审技能"),
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
        reading("seedance-storyboard", "director-agent", "agents/director.md", "agent", "director 参考文件"),
        reading("seedance-storyboard", "director-skill", "skills/director-skill/SKILL.md", "skill", "内置导演讲戏技能"),
        reading("seedance-storyboard", "director-template", "skills/director-skill/templates/director-analysis-template.md", "template", "导演讲戏模板"),
        reading("seedance-storyboard", "script-review", "skills/script-analysis-review-skill/SKILL.md", "skill", "内置导演自审技能"),
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

function v5ScriptReadings() {
    return [
        reading("script-adaptation", "agents", "AGENTS.md", "rule", "v5.2 主工作流规范"),
        reading("script-adaptation", "workflow-config", "config/workflow.yaml", "rule", "v5.2 工作流必读清单"),
        reading("script-adaptation", "script-agent", "web/src/app/(user)/projects/agent-settings.ts", "agent", "script_optimizer agent 设定"),
        reading("script-adaptation", "script-rules", "web/src/app/(user)/projects/script-optimizer-agent.ts", "rule", "剧本适配与白皮书规则"),
        reading("script-adaptation", "format-lock", "specs/skills/original-prompt-format-lock/SKILL.md", "skill", "原提示词格式锁"),
        reading("script-adaptation", "script-ingestion-schema", "schemas/script-ingestion.schema.json", "template", "剧本导入结构"),
        reading("script-adaptation", "v5-runbook", "docs/original-format-v5-runbook.md", "rule", "v5 操作说明"),
    ];
}

function v5ArtDesignReadings() {
    return [
        reading("art-design", "agents", "AGENTS.md", "rule", "v5.2 主工作流规范"),
        reading("art-design", "art-agent", "specs/agents/art-designer.md", "agent", "v5 art-designer agent 文件"),
        reading("art-design", "format-lock", "specs/skills/original-prompt-format-lock/SKILL.md", "skill", "原提示词格式锁"),
        reading("art-design", "director-method-shot", "specs/skills/director-method-shot-skill/SKILL.md", "skill", "内置导演方法真分镜技能"),
        reading("art-design", "director-method-cards", "specs/knowledge/director-methods/director_method_cards.md", "rule", "导演方法卡"),
        reading("art-design", "director-methods-json", "specs/knowledge/director-methods/director_methods.json", "rule", "导演方法结构数据"),
        reading("art-design", "scene-type-playbook", "specs/knowledge/director-methods/scene_type_playbook.md", "rule", "场景类型 playbook"),
        reading("art-design", "shot-script-rules", "specs/knowledge/director-methods/shot_script_method_rules.md", "rule", "真分镜规则"),
        reading("art-design", "method-selection-matrix", "specs/knowledge/director-methods/method_selection_matrix.csv", "rule", "方法选择矩阵"),
        reading("art-design", "art-skill", "specs/skills/art-design-skill/SKILL.md", "skill", "原格式服化道技能"),
        reading("art-design", "art-template", "specs/skills/art-design-skill/templates/art-design-template.md", "template", "原格式服化道模板"),
        reading("art-design", "character-examples", "specs/skills/art-design-skill/examples/character-prompt-examples.md", "example", "人物提示词示例"),
        reading("art-design", "scene-examples", "specs/skills/art-design-skill/examples/scene-prompt-examples.md", "example", "场景提示词示例"),
    ];
}

function v5StoryboardReadings(withEmotionDirector = false) {
    return [
        reading("seedance-storyboard", "agents", "AGENTS.md", "rule", "v5.2 主工作流规范"),
        reading("seedance-storyboard", "storyboard-agent", "specs/agents/storyboard-artist.md", "agent", "v5 storyboard-artist agent 文件"),
        reading("seedance-storyboard", "format-lock", "specs/skills/original-prompt-format-lock/SKILL.md", "skill", "原提示词格式锁"),
        reading("seedance-storyboard", "director-method-shot", "specs/skills/director-method-shot-skill/SKILL.md", "skill", "内置导演方法真分镜技能"),
        reading("seedance-storyboard", "director-method-cards", "specs/knowledge/director-methods/director_method_cards.md", "rule", "导演方法卡"),
        reading("seedance-storyboard", "director-methods-json", "specs/knowledge/director-methods/director_methods.json", "rule", "导演方法结构数据"),
        reading("seedance-storyboard", "scene-type-playbook", "specs/knowledge/director-methods/scene_type_playbook.md", "rule", "场景类型 playbook"),
        reading("seedance-storyboard", "shot-script-rules", "specs/knowledge/director-methods/shot_script_method_rules.md", "rule", "真分镜规则"),
        reading("seedance-storyboard", "method-selection-matrix", "specs/knowledge/director-methods/method_selection_matrix.csv", "rule", "方法选择矩阵"),
        reading("seedance-storyboard", "storyboard-skill", "specs/skills/seedance-storyboard-skill/SKILL.md", "skill", "Skill 5 轻量分镜技能"),
        reading("seedance-storyboard", "seedance-template", "specs/skills/seedance-storyboard-skill/templates/seedance-prompts-template.md", "template", "Skill 5 通用版模板"),
        reading("seedance-storyboard", "seedance-examples", "specs/skills/seedance-storyboard-skill/examples/seedance-prompt-examples.md", "example", "Seedance 提示词示例"),
        reading("seedance-storyboard", "copy-only", "tools/export_copy_only.py", "tool", "copy-only 导出工具"),
        ...emotionDirectorReadings(withEmotionDirector),
    ];
}

function mxShellStoryboardReadings(withEmotionDirector = false) {
    return [
        reading("seedance-storyboard", "agents", "AGENTS.md", "rule", "Mx-Shell 主工作流规范"),
        reading("seedance-storyboard", "storyboard-agent", "specs/agents/storyboard-artist.md", "agent", "storyboard-artist agent 文件"),
        reading("seedance-storyboard", "format-lock", "specs/skills/original-prompt-format-lock/SKILL.md", "skill", "原提示词格式锁"),
        reading("seedance-storyboard", "director-method-shot", "specs/skills/director-method-shot-skill/SKILL.md", "skill", "内置导演方法真分镜技能"),
        reading("seedance-storyboard", "director-method-cards", "specs/knowledge/director-methods/director_method_cards.md", "rule", "导演方法卡"),
        reading("seedance-storyboard", "director-methods-json", "specs/knowledge/director-methods/director_methods.json", "rule", "导演方法结构数据"),
        reading("seedance-storyboard", "scene-type-playbook", "specs/knowledge/director-methods/scene_type_playbook.md", "rule", "场景类型 playbook"),
        reading("seedance-storyboard", "shot-script-rules", "specs/knowledge/director-methods/shot_script_method_rules.md", "rule", "真分镜规则"),
        reading("seedance-storyboard", "method-selection-matrix", "specs/knowledge/director-methods/method_selection_matrix.csv", "rule", "方法选择矩阵"),
        reading("seedance-storyboard", "mx-shell-prompts", "Mx-Shell_Prompts_v1.5.md", "skill", "Mx-Shell 清道夫分镜技能"),
        ...emotionDirectorReadings(withEmotionDirector),
    ];
}

function emotionDirectorReadings(enabled: boolean) {
    return enabled ? [reading("seedance-storyboard", "emotion-director", "情绪导演_Skill_V2.1.md", "skill", "情绪导演增强技能")] : [];
}
