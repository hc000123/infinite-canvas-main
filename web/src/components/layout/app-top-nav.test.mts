import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("application navigation uses a stable spine without a hover-only menu", () => {
    const source = readFileSync(new URL("./app-workspace-spine.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(source, /MobileNavDrawer|mobileNavOpen|打开导航菜单/);
    assert.match(source, /aria-label="全局工作区"/);
    assert.match(source, /<nav className="[^"]*flex flex-col[^"]*"/);
    assert.match(source, /aria-current=/);
});

test("project center is the single project-level primary entry", () => {
    const spine = readFileSync(new URL("./app-workspace-spine.tsx", import.meta.url), "utf8");
    const navigationTools = readFileSync(new URL("../../constant/navigation-tools.ts", import.meta.url), "utf8");
    assert.doesNotMatch(navigationTools, /slug: "agent"|生产总控/);
    assert.match(spine, /pathname === `\/\$\{slug\}` \|\| pathname\.startsWith\(`\/\$\{slug\}\/`\)/);
});
