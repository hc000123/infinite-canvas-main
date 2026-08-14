import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const agentWorkspace = readFileSync(new URL("./agent/agent-workspace.tsx", import.meta.url), "utf8");
const agentOverview = readFileSync(new URL("./agent/components/agent-project-overview.tsx", import.meta.url), "utf8");
const projectsPage = readFileSync(new URL("./projects/page.tsx", import.meta.url), "utf8");
const projectList = readFileSync(new URL("./projects/components/project-workstream-list.tsx", import.meta.url), "utf8");
const projectDetail = readFileSync(new URL("./projects/[id]/components/project-episode-board.tsx", import.meta.url), "utf8");
const resourcesPage = readFileSync(new URL("./resources/page.tsx", import.meta.url), "utf8");

test("生产总控使用单一紧凑工具栏且不重复返回入口", () => {
    assert.doesNotMatch(agentWorkspace, /Production control/);
    assert.doesNotMatch(agentWorkspace, /ArrowLeft/);
    assert.match(agentWorkspace, /aria-label="生产总控筛选"/);
});

test("生产总控项目使用连续行而不是大卡片网格", () => {
    assert.doesNotMatch(agentOverview, /lg:grid-cols-2/);
    assert.match(agentOverview, /hover:bg-\[var\(--studio-hover-bg\)\]/);
    assert.match(agentOverview, /border-b border-\[var\(--studio-border-subtle\)\]/);
});

test("项目页面不显示英文状态装饰", () => {
    assert.match(projectsPage, />项目中心<\/h1>/);
    assert.doesNotMatch(projectList, /LIVE|PAUSED/);
});

test("项目详情移除顶部状态占位并使用中文优化方案文案", () => {
    assert.doesNotMatch(projectDetail, /当前制作到/);
    assert.doesNotMatch(projectDetail, /aria-label="剧本优化 Skill"/);
    assert.match(projectDetail, /aria-label="剧本优化方案"/);
});

test("资源库入口整行提供悬停反馈且不保留无效说明", () => {
    assert.doesNotMatch(resourcesPage, /低频内容资源与系统维护入口/);
    assert.match(resourcesPage, /hover:bg-\[var\(--studio-hover-bg\)\]/);
});
