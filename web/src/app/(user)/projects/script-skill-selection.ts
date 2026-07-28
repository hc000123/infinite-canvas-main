import type { SkillOption } from "@/services/api/admin-skills";

const includes = (values: readonly string[] | undefined, value: string) => Boolean(values?.includes(value));

export function compatibleScriptSkillOptions(options: SkillOption[]) {
    return options.filter((option) =>
        includes(option.manifest.capabilities, "workflow.stage.script") &&
        includes(option.manifest.inputArtifactTypes, "source_text") &&
        includes(option.manifest.outputArtifactTypes, "production_script"),
    );
}

export function resolveScriptSkillVersionId(options: SkillOption[], storedVersionId = "") {
    const compatible = compatibleScriptSkillOptions(options);
    if (compatible.some((option) => option.skillVersionId === storedVersionId)) return storedVersionId;
    return compatible.find((option) => option.isRecommended)?.skillVersionId || compatible[0]?.skillVersionId || "";
}
