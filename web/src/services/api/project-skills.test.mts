import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./project-skills.ts", import.meta.url), "utf8");

test("project Skill client covers the authenticated management lifecycle", () => {
    for (const route of [
        'apiGet<SkillAdminItem[]>("/api/v1/skills", { projectId }, token)',
        'apiPost<ProjectSkillResolved>("/api/v1/skills", input, token)',
        '`${skillPath(id)}/copy`',
        '`${skillPath(skillId)}/versions`',
        'apiGet<SkillVersionDetail>(versionPath(id), undefined, token)',
        '`${versionPath(id)}/validate`',
        '`${versionPath(id)}/evaluations`',
        '`${versionPath(id)}/publish`',
        '`${skillPath(skillId)}/recommended-version`',
        '`${versionPath(id)}/archive`',
        '"/api/v1/skill-stage-templates"',
        '"/api/v1/skills/import-folder"',
        '`${skillPath(skillId)}/import-version`',
        '`${versionPath(id)}/source-files`',
        '`${versionPath(id)}/source-file`',
        '`${versionPath(id)}/trials`',
        '`/api/v1/skill-trials/${encodeURIComponent(id)}`',
    ]) assert.ok(source.includes(route), `missing route ${route}`);
    assert.match(source, /apiPatch<SkillDefinition>\(skillPath\(id\), input, token\)/);
    assert.match(source, /apiPatch<SkillVersion>\(versionPath\(id\), input, token\)/);
    assert.match(source, /apiDelete<\{ deleted: boolean \}>\(skillPath\(id\), token\)/);
    assert.match(source, /apiDelete<\{ deleted: boolean \}>\(versionPath\(id\), token\)/);
});

test("project Skill creation cannot request System ownership", () => {
    assert.match(source, /ProjectSkillCreateInput = SkillDraftInput & Pick<SkillDefinition, "name" \| "summary"> & \{ projectId: string \}/);
    assert.doesNotMatch(source, /ProjectSkillCreateInput[^\n]+ownerType/);
});
