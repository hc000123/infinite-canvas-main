import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { diffSkillFolderFiles, parseSkillFolderMetadata, readDroppedSkillFolder } from "./skill-folder-import-utils.ts";

function folderFile(content: string, name: string, path: string) {
    const file = new File([content], name);
    Object.defineProperty(file, "webkitRelativePath", { value: path });
    return file;
}

test("reads SKILL.md frontmatter and applies folder defaults", () => {
    assert.deepEqual(parseSkillFolderMetadata("---\nname: \u5267\u672c\u6574\u7406\ndescription: |\n  \u4fdd\u7559\u53f0\u8bcd\n  \u4e0e\u7ed3\u6784\nversion: 2.3.0\n---\n# Skill", "script-tools"), {
        name: "\u5267\u672c\u6574\u7406",
        summary: "\u4fdd\u7559\u53f0\u8bcd\n\u4e0e\u7ed3\u6784\n",
        version: "2.3.0",
    });
    assert.deepEqual(parseSkillFolderMetadata("# Skill", "script-tools"), { name: "script-tools", summary: "", version: "1.0.0" });
    assert.deepEqual(parseSkillFolderMetadata("---\ndescription: \u6d4b\u8bd5\n---", "script-tools", ""), { name: "script-tools", summary: "\u6d4b\u8bd5", version: "" });
});

test("classifies added, modified, deleted, and unchanged folder files", async () => {
    const files = [
        folderFile("skill", "SKILL.md", "Tools/SKILL.md"),
        folderFile("new rule", "rule.md", "Tools/rules/rule.md"),
        folderFile("new", "new.md", "Tools/new.md"),
        folderFile("changed trash", ".DS_Store", "Tools/cache/.DS_Store"),
        folderFile("new trash", "THUMBS.DB", "Tools/media/THUMBS.DB"),
    ];
    const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
    const diff = await diffSkillFolderFiles(files, [
        { path: "SKILL.md", hash: hash("skill") },
        { path: "rules/rule.md", hash: hash("old rule") },
        { path: "deleted.md", hash: hash("deleted") },
        { path: "cache/.DS_Store", hash: hash("old trash") },
        { path: "old/Thumbs.db", hash: hash("deleted trash") },
    ]);
    assert.deepEqual(diff, {
        added: ["new.md"],
        modified: ["rules/rule.md"],
        deleted: ["deleted.md"],
        unchanged: ["SKILL.md"],
    });
});

test("reads every directory reader batch recursively and preserves the top folder", async () => {
    const entryFile = (name: string, content: string) => ({
        isFile: true,
        isDirectory: false,
        name,
        file: (success: (file: File) => void) => success(new File([content], name)),
    });
    const directory = (name: string, batches: unknown[][]) => ({
        isFile: false,
        isDirectory: true,
        name,
        createReader: () => {
            let index = 0;
            return { readEntries: (success: (entries: unknown[]) => void) => success(batches[index++] || []) };
        },
    });
    const rules = directory("rules", [[entryFile("preserve.md", "rule")], []]);
    const root = directory("MySkill", [[entryFile("SKILL.md", "# Skill"), rules], [entryFile("asset.png", "png")], []]);

    const files = await readDroppedSkillFolder([{ webkitGetAsEntry: () => root }]);

    assert.deepEqual(files.map((file) => file.webkitRelativePath), ["MySkill/SKILL.md", "MySkill/rules/preserve.md", "MySkill/asset.png"]);
    await assert.rejects(() => readDroppedSkillFolder([{ webkitGetAsEntry: () => entryFile("SKILL.md", "# Skill") }]), /\u5b8c\u6574\u6587\u4ef6\u5939/);
});
