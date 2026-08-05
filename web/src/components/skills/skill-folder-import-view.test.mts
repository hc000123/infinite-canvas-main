import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./skill-folder-import.tsx", import.meta.url), "utf8");

test("folder import exposes editable metadata and real folder drop", () => {
    for (const text of ["Skill 名称", "用途与说明", "版本号", "onDrop", "readDroppedSkillFolder", "不执行其中脚本"]) assert.ok(source.includes(text), `missing ${text}`);
});

test("new version import fetches and renders the selected version diff", () => {
    for (const text of ["previousVersionId", "fetchAdminSkillSourceFiles", "fetchProjectSkillSourceFiles", "diffSkillFolderFiles", "新增", "修改", "删除", "文件内容无变化"]) assert.ok(source.includes(text), `missing ${text}`);
});
