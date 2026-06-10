import type { ProductionBibleKind } from "../canvas/utils/production-bible.ts";
import type { AgentWorkflowMappingPreviewItem } from "./agent-runner-types.ts";
import { buildPreviewItems, readCandidateField, readCandidateTags, readCandidateText, readCandidateTitle, stringField, type WorkflowMappingAnalysis } from "./agent-runner-mapping-utils.ts";
export { analyzeWorkflowStageOutput, numberField, objectListField, parseWorkflowMappingRawJson, stringField, stringListField } from "./agent-runner-mapping-utils.ts";

export function buildDirectorProductionBiblePreviewItems(analysis: WorkflowMappingAnalysis): AgentWorkflowMappingPreviewItem[] {
    return buildPreviewItems(analysis.candidates.slice(0, 6), "production_bible", (item, index) => ({
        title: readCandidateTitle(item, `导演分析设定 ${index + 1}`),
        reason: "将导演分析中的人物 / 场景摘要映射为设定库草案。",
        sourceText: readCandidateText(item),
        mappedFields: {
            kind: inferBibleKind(item, index === 0 ? "character" : "scene"),
            name: readCandidateTitle(item, `设定 ${index + 1}`),
            description: readCandidateText(item),
            tags: readCandidateTags(item),
            promptSnippets: { consistency: readCandidateText(item) },
        },
        confidence: analysis.warnings.length ? 0.45 : 0.72,
    }));
}

export function buildDirectorStoryboardPreviewItems(analysis: WorkflowMappingAnalysis): AgentWorkflowMappingPreviewItem[] {
    return buildPreviewItems(analysis.candidates.slice(0, 6), "storyboard_table", (item, index) => ({
        title: stringField(readCandidateField(item, "shotTitle")) || readCandidateTitle(item, `场次草案 ${index + 1}`),
        reason: "将导演分析中的剧情段落 / 场次摘要映射为分镜表预览。",
        sourceText: readCandidateText(item),
        mappedFields: {
            sceneName: readCandidateTitle(item, `场次 ${index + 1}`),
            title: stringField(readCandidateField(item, "shotTitle")) || readCandidateTitle(item, `镜头 ${index + 1}`),
            visualDescription: readCandidateText(item),
            action: readCandidateText(item),
        },
        confidence: analysis.warnings.length ? 0.42 : 0.68,
    }));
}

export function buildArtDesignProductionBiblePreviewItems(analysis: WorkflowMappingAnalysis): AgentWorkflowMappingPreviewItem[] {
    return buildPreviewItems(analysis.candidates.slice(0, 8), "production_bible", (item, index) => ({
        title: readCandidateTitle(item, `美术设定 ${index + 1}`),
        reason: "将服化道阶段产物映射为角色 / 场景 / 道具设定草案。",
        sourceText: readCandidateText(item),
        mappedFields: {
            kind: inferBibleKind(item, "prop"),
            name: readCandidateTitle(item, `设定 ${index + 1}`),
            description: readCandidateText(item),
            tags: readCandidateTags(item),
            promptSnippets: {
                positive: readCandidateField(item, "prompt") || readCandidateText(item),
                consistency: readCandidateField(item, "style") || "",
            },
        },
        confidence: analysis.warnings.length ? 0.48 : 0.78,
    }));
}

export function mapPreviewKindToProductionBibleKind(value: unknown): ProductionBibleKind {
    const kind = String(value || "")
        .trim()
        .toLowerCase();
    if (["character", "角色", "person"].includes(kind)) return "character";
    if (["scene", "场景", "mood", "style", "氛围", "风格"].includes(kind)) return "scene";
    if (["prop", "道具", "costume", "makeup", "服化道", "服装", "妆发"].includes(kind)) return "prop";
    return "prop";
}

export function buildStoryboardTablePreviewItems(analysis: WorkflowMappingAnalysis): AgentWorkflowMappingPreviewItem[] {
    return buildPreviewItems(analysis.candidates.slice(0, 8), "storyboard_table", (item, index) => ({
        title: stringField(readCandidateField(item, "shotTitle")) || readCandidateTitle(item, `分镜草案 ${index + 1}`),
        reason: "将 Seedance 分镜阶段产物映射为分镜头表草案。",
        sourceText: readCandidateText(item),
        mappedFields: {
            sceneId: readCandidateField(item, "sceneId") || "",
            sceneName: readCandidateField(item, "sceneName") || `场次 ${index + 1}`,
            location: readCandidateField(item, "location") || "",
            timeOfDay: readCandidateField(item, "timeOfDay") || "",
            title: stringField(readCandidateField(item, "shotTitle")) || readCandidateTitle(item, `镜头 ${index + 1}`),
            scriptText: readCandidateField(item, "scriptText") || "",
            visualDescription: readCandidateField(item, "visualDescription") || readCandidateText(item),
            characters: readCandidateField(item, "characters") || [],
            shotSize: readCandidateField(item, "shotSize") || "",
            cameraMovement: readCandidateField(item, "cameraMovement") || "",
            action: readCandidateField(item, "action") || readCandidateText(item),
            emotion: readCandidateField(item, "emotion") || "",
            dialogue: readCandidateField(item, "dialogue") || "",
            estimatedDuration: readCandidateField(item, "estimatedDuration") || "3",
            assetNeeds: readCandidateField(item, "assetNeeds") || [],
        },
        confidence: analysis.warnings.length ? 0.5 : 0.82,
    }));
}

export function buildVideoNodePreviewItems(analysis: WorkflowMappingAnalysis): AgentWorkflowMappingPreviewItem[] {
    return buildPreviewItems(analysis.candidates.slice(0, 8), "video_node", (item, index) => ({
        title: readCandidateTitle(item, `视频提示词 ${index + 1}`),
        reason: "将 Seedance 分镜阶段产物映射为画布视频配置节点草案。",
        sourceText: readCandidateText(item),
        mappedFields: {
            title: readCandidateTitle(item, `视频节点 ${index + 1}`),
            prompt: readCandidateField(item, "prompt") || readCandidateField(item, "videoPrompt") || readCandidateText(item),
            finalPrompt: readCandidateField(item, "finalPrompt") || readCandidateField(item, "effectivePrompt") || readCandidateField(item, "videoPrompt") || readCandidateField(item, "prompt") || readCandidateText(item),
            videoPrompt: readCandidateField(item, "videoPrompt") || readCandidateField(item, "prompt") || readCandidateText(item),
            effectivePrompt: readCandidateField(item, "effectivePrompt") || readCandidateField(item, "finalPrompt") || readCandidateField(item, "videoPrompt") || readCandidateField(item, "prompt") || readCandidateText(item),
            seconds: readCandidateField(item, "seconds") || readCandidateField(item, "duration") || "5",
            duration: readCandidateField(item, "duration") || readCandidateField(item, "seconds") || "5",
            ratio: readCandidateField(item, "ratio") || readCandidateField(item, "size") || "16:9",
            size: readCandidateField(item, "size") || readCandidateField(item, "ratio") || "16:9",
            references: readCandidateField(item, "references") || [],
            referenceAssets: readCandidateField(item, "referenceAssets") || [],
            shotGroupId: readCandidateField(item, "shotGroupId") || "",
            storyboardShotGroupId: readCandidateField(item, "storyboardShotGroupId") || readCandidateField(item, "shotGroupId") || "",
            storyboardTableShotIds: readCandidateField(item, "storyboardTableShotIds") || [],
            videoPromptReviewEnabled: "true",
        },
        confidence: analysis.warnings.length ? 0.46 : 0.8,
    }));
}

function inferBibleKind(item: unknown, fallback: ProductionBibleKind): ProductionBibleKind {
    const text = `${readCandidateTitle(item, "")} ${readCandidateField(item, "kind")} ${readCandidateText(item)}`.toLowerCase();
    if (text.includes("角色") || text.includes("人物") || text.includes("character")) return "character";
    if (text.includes("场景") || text.includes("scene")) return "scene";
    if (text.includes("道具") || text.includes("prop")) return "prop";
    return fallback;
}
