import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("top navigation always displays tools without a mobile menu", () => {
    const appTopNavSource = readFileSync(new URL("./app-top-nav.tsx", import.meta.url), "utf8");
    const projectWorkspaceSource = readFileSync(new URL("../../app/(user)/projects/project-workspace-shell.tsx", import.meta.url), "utf8");

    for (const navSource of [appTopNavSource, projectWorkspaceSource]) {
        assert.doesNotMatch(navSource, /MobileNavDrawer|mobileNavOpen|打开导航菜单/);
        assert.match(navSource, /<nav className="[^"]*\bflex\b[^"]*\bmin-w-0\b[^"]*\bflex-1\b[^"]*\boverflow-x-auto\b[^"]*\bthin-scrollbar\b[^"]*"/);
        assert.match(navSource, /className="flex min-w-0 flex-1 items-center"/);
        assert.match(navSource, /className="[^"]*\bmy-auto\b[^"]*\bshrink-0\b[^"]*"/);
    }
});
