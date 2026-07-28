import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readProjectFile = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("project detail omits the project-level asset reference tab", () => {
    const board = readProjectFile("./[id]/components/project-episode-board.tsx");
    const page = readProjectFile("./[id]/page.tsx");

    assert.doesNotMatch(board, /label="素材引用"/);
    assert.doesNotMatch(board, /"asset-references"/);
    assert.doesNotMatch(board, /ProjectAssetReferencePanel/);
    assert.doesNotMatch(page, /assetReferenceFilters|filteredAssetReferenceRows/);
});

test("project script entry names the registry Agent instead of a local AI preset", () => {
    const page = readProjectFile("./[id]/page.tsx");
    const board = readProjectFile("./[id]/components/project-episode-board.tsx");

    assert.match(page, /\n\s+运行系统剧本制作 Agent\n/);
    assert.match(page, /buildScriptSkillOverride/);
    assert.match(page, /skillOverrides/);
    assert.match(board, /aria-label="剧本优化 Skill"/);
    assert.match(board, /系统剧本制作 Agent/);
    assert.doesNotMatch(page, /\n\s+AI 适配剧本\n/);
});

test("project Agent center has an explicit return-to-project action", () => {
    const page = readProjectFile("./[id]/agents/page.tsx");
    assert.match(page, /返回项目/);
    assert.match(page, /`\/projects\/\$\{project\.id\}`/);
});
