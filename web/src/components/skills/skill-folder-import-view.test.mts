import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./skill-folder-import.tsx", import.meta.url), "utf8");

test("folder import exposes editable metadata and real folder drop", () => {
    for (const text of ["Skill 名称", "用途与说明", "版本号", "onDrop", "readDroppedSkillFolder", "不执行其中脚本"]) assert.ok(source.includes(text), `missing ${text}`);
});

test("external Skill import offers both a single SKILL.md and a complete folder", () => {
    for (const text of ["选择 SKILL.md", "选择完整文件夹", "skillInputRef", "folderInputRef", "载入外部 Skill"]) assert.ok(source.includes(text), `missing ${text}`);
});

test("new version import fetches and renders the selected version diff", () => {
    for (const text of ["previousVersionId", "fetchAdminSkillSourceFiles", "importAdminSkillFolder", "diffSkillFolderFiles", "新增", "修改", "删除", "文件内容无变化"]) assert.ok(source.includes(text), `missing ${text}`);
    for (const text of ["fetchProjectSkill", "importProjectSkill", 'scope === "admin"']) assert.equal(source.includes(text), false, `unexpected ${text}`);
});

test("closing folder import invalidates requests and clears transient loading state", () => {
    const closeEffect = source.slice(source.indexOf("if (open) return;"), source.indexOf("}, [open]);"));
    assert.ok(closeEffect.includes("requestGuard.current.invalidate()"));
    assert.ok(closeEffect.includes("setReading(false)"));
    assert.ok(closeEffect.includes("setDiffing(false)"));
});

test("starting file selection and recursive drop clears stale confirmation before preparing", () => {
    assert.ok(source.includes("setPreparing(true)"));
    assert.ok(source.includes("preparing,"));
    assert.match(source, /handleDrop[\s\S]+beginPreparing\(true\)[\s\S]+readDroppedSkillFolder/);
    assert.match(source, /onChange=\{\(event\) => \{ const request = beginPreparing\(false\)/);
});
