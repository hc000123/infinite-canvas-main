export type AgentAssetSlot = {
    slotId: string;
    category: "character" | "scene" | "prop" | "blocking";
    name: string;
    description: string;
    status: "placeholder" | "candidate" | "bound" | "ignored";
    sourceSceneIds: string[];
    sourceEvidence: string[];
    subjectId?: string;
    variantId?: string;
    assetId?: string;
    candidateId?: string;
};

export function renameAgentAssetSlot(slot: AgentAssetSlot, name: string): AgentAssetSlot {
    return { ...slot, name: name.trim() || slot.name };
}

export function bindAgentAssetSlot(slot: AgentAssetSlot, binding: { assetId: string; subjectId?: string; variantId?: string }): AgentAssetSlot {
    return { ...slot, ...binding, candidateId: undefined, status: "bound" };
}

export function createAgentAssetSlot(slotId: string, category: AgentAssetSlot["category"]): AgentAssetSlot {
    const label = { character: "角色", scene: "场景", prop: "道具", blocking: "站位" }[category];
    return { slotId, category, name: `未命名${label}`, description: "", status: "placeholder", sourceSceneIds: [], sourceEvidence: [] };
}

export function ignoreAgentAssetSlot(slot: AgentAssetSlot): AgentAssetSlot {
    return { ...slot, status: "ignored", subjectId: undefined, variantId: undefined, assetId: undefined, candidateId: undefined };
}

export function removeAgentAssetSlot(slots: AgentAssetSlot[], slotId: string): AgentAssetSlot[] {
    return slots.filter((slot) => slot.slotId !== slotId);
}

export function agentAssetSlotSummary(slots: AgentAssetSlot[]) {
    return {
        total: slots.length,
        bound: slots.filter((slot) => slot.status === "bound").length,
        candidate: slots.filter((slot) => slot.status === "candidate").length,
        placeholder: slots.filter((slot) => slot.status === "placeholder").length,
        ignored: slots.filter((slot) => slot.status === "ignored").length,
    };
}

export function mergeAgentAssetSlots(slots: AgentAssetSlot[], identity: { slotId: string; name: string }): AgentAssetSlot {
    if (!slots.length) throw new Error("至少选择一个资产槽位");
    const base = slots[0];
    return {
        ...base,
        slotId: identity.slotId,
        name: identity.name.trim() || base.name,
        description: unique(slots.map((slot) => slot.description)).join("；"),
        sourceSceneIds: unique(slots.flatMap((slot) => slot.sourceSceneIds)),
        sourceEvidence: unique(slots.flatMap((slot) => slot.sourceEvidence)),
        status: "placeholder",
        subjectId: undefined,
        variantId: undefined,
        assetId: undefined,
        candidateId: undefined,
    };
}

export function splitAgentAssetSlot(slot: AgentAssetSlot, identities: Array<{ slotId: string; name: string }>): AgentAssetSlot[] {
    return identities.map((identity) => ({ ...slot, slotId: identity.slotId, name: identity.name.trim() || slot.name, status: "placeholder", subjectId: undefined, variantId: undefined, assetId: undefined, candidateId: undefined }));
}

export function agentAssetSlotReference(slot: AgentAssetSlot, availableAssetIds: Set<string>): { kind: "image" | "text" | "ignored"; value: string; assetId?: string } {
    if (slot.status === "ignored") return { kind: "ignored", value: slot.name };
    if (slot.status === "bound" && slot.assetId && availableAssetIds.has(slot.assetId)) return { kind: "image", assetId: slot.assetId, value: slot.name };
    return { kind: "text", value: slot.description.trim() ? `${slot.name}：${slot.description.trim()}` : slot.name };
}

function unique(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
