import type { WorkflowContinuityReference, WorkflowReferenceBinding, WorkflowReferenceRole } from "../../../../../video/use-video-package-store.ts";

export const workflowReferenceRoleOptions: Array<{ label: string; value: Exclude<WorkflowReferenceRole, "continuity_reference"> }> = [
    { label: "角色基础形象", value: "character" }, { label: "角色马甲 / 状态", value: "character_variant" }, { label: "场景与材质", value: "scene" }, { label: "道具", value: "prop" }, { label: "人物站位 / 构图", value: "blocking" },
];

export function validateReferenceDefinition(input: Partial<WorkflowReferenceBinding>) {
    if (!input.role || input.role === "continuity_reference") return "请选择参考图定义";
    if (!input.label?.trim()) return "请填写参考图名称";
    if (!input.libraryAssetId || !input.version) return "参考图文件无效";
    if (input.role !== "blocking" && !input.logicalAssetId?.trim()) return "请选择或填写资产编号";
    if (input.role === "character_variant" && !input.parentLogicalAssetId?.trim()) return "角色马甲需要绑定所属角色编号";
    return "";
}

export function referenceUsage(role: WorkflowReferenceRole) {
    return ({ character: "角色身份、面部与基础外观一致性", character_variant: "角色服装、妆发或受伤状态一致性", scene: "场景空间、光线与材质一致性", prop: "道具造型与材质一致性", blocking: "人物站位、相对位置与画面构图参考", continuity_reference: "上一镜尾帧剧情连续性参考，不作为首帧" } as const)[role];
}

export function upsertReferenceBinding(items: WorkflowReferenceBinding[], binding: WorkflowReferenceBinding) {
    return [...items.filter((item) => item.libraryAssetId !== binding.libraryAssetId), binding];
}

export function limitShotReferences(items: WorkflowReferenceBinding[], continuity?: Pick<WorkflowContinuityReference, "libraryAssetId" | "sourceShotId" | "version"> | null) {
    const assetReferences = items.filter((item) => item.role !== "continuity_reference").slice(0, continuity ? 8 : 9);
    const references: WorkflowReferenceBinding[] = [...assetReferences];
    if (continuity) references.push({ role: "continuity_reference", label: "上一镜尾帧", libraryAssetId: continuity.libraryAssetId, sourceShotId: continuity.sourceShotId, version: continuity.version, usage: referenceUsage("continuity_reference") });
    return { assetReferences, references };
}
