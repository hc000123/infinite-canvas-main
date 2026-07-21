export type WorkflowReferenceEvidence = {
    imageRef: string;
    observations: string[];
    appliedTo: string[];
};

export function parseWorkflowReferenceEvidence(contentJson?: string): WorkflowReferenceEvidence[] {
    if (!contentJson) return [];
    try {
        const payload = JSON.parse(contentJson) as { referenceEvidence?: unknown };
        if (!Array.isArray(payload.referenceEvidence)) return [];
        return payload.referenceEvidence.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const value = item as Record<string, unknown>;
            const imageRef = typeof value.imageRef === "string" ? value.imageRef.trim() : "";
            const observations = stringList(value.observations);
            const appliedTo = stringList(value.appliedTo);
            return imageRef && observations.length && appliedTo.length ? [{ imageRef, observations, appliedTo }] : [];
        });
    } catch {
        return [];
    }
}

function stringList(value: unknown) {
    if (typeof value === "string") return value.trim() ? [value.trim()] : [];
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
}
