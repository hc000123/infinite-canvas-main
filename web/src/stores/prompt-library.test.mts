import assert from "node:assert/strict";
import test from "node:test";

import { deletePromptFolder, matchesPromptLibraryFilter, normalizePromptFolderName } from "./prompt-library.ts";

test("normalizes folder names and rejects empty names", () => {
    assert.equal(normalizePromptFolderName("  人物参考  "), "人物参考");
    assert.throws(() => normalizePromptFolderName("   "), /文件夹名称不能为空/);
});

test("deleting a folder keeps its prompts and moves them to uncategorized", () => {
    const result = deletePromptFolder(
        [{ id: "folder-1", name: "人物", createdAt: "now", updatedAt: "now" }],
        [{ id: "prompt-1", title: "角色", prompt: "角色设定", tags: [], folderId: "folder-1", nodeGroup: "image", type: "asset", createdAt: "now", updatedAt: "now" }],
        "folder-1",
    );
    assert.deepEqual(result.folders, []);
    assert.equal(result.prompts[0]?.folderId, undefined);
});

test("filters personal prompts by folder, keyword and node group", () => {
    const item = { id: "prompt-1", title: "角色母版", prompt: "正侧背三视图", tags: ["人物"], folderId: "folder-1", nodeGroup: "image", type: "asset", createdAt: "now", updatedAt: "now" };
    assert.equal(matchesPromptLibraryFilter(item, { folderId: "folder-1", keyword: "三视图", nodeGroup: "image" }), true);
    assert.equal(matchesPromptLibraryFilter(item, { folderId: "folder-2", keyword: "", nodeGroup: "all" }), false);
    assert.equal(matchesPromptLibraryFilter(item, { keyword: "场景", nodeGroup: "all" }), false);
});
