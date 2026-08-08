# Top Navigation Without Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant user navigation menu button and drawer while keeping every tool directly reachable on narrow screens.

**Architecture:** Keep the existing two top-bar implementations and change only their responsive navigation presentation. Both bars will render the tool list at every width inside a horizontally scrollable region; menu state and `MobileNavDrawer` wiring will be removed without changing route construction or right-side actions.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Node test runner

---

### Task 1: Lock the no-menu navigation contract and implement it

**Files:**
- Modify: `web/src/components/layout/app-top-nav.test.mts`
- Modify: `web/src/components/layout/app-top-nav.tsx`
- Modify: `web/src/app/(user)/projects/project-workspace-shell.tsx`

- [ ] **Step 1: Replace the stale top-navigation source test with the responsive contract**

Use one source-level regression test for both top bars:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sources = [
    readFileSync(new URL("./app-top-nav.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("../../app/(user)/projects/project-workspace-shell.tsx", import.meta.url), "utf8"),
];

test("user top navigations expose a scrollable tool row without a menu drawer", () => {
    for (const source of sources) {
        assert.doesNotMatch(source, /MobileNavDrawer|mobileNavOpen|打开导航菜单/);
        assert.match(source, /<nav className="ml-4 flex h-10 min-w-0 flex-1 items-center gap-1 overflow-x-auto/);
    }
});
```

- [ ] **Step 2: Record the expected pre-implementation result**

The project rules do not authorize running tests by default. If the user explicitly authorizes the targeted check, run:

```bash
cd web && node --experimental-strip-types --test src/components/layout/app-top-nav.test.mts
```

Expected before implementation: FAIL because both sources still contain `MobileNavDrawer` and `打开导航菜单`.

- [ ] **Step 3: Remove menu state and drawer wiring from the global top bar**

In `app-top-nav.tsx`:

```tsx
// Remove the MobileNavDrawer and useState imports.
// Remove mobileNavOpen and setMobileNavOpen.
// Remove the “菜单” button and the MobileNavDrawer element.

<nav className="ml-4 flex h-10 min-w-0 flex-1 items-center gap-1 overflow-x-auto">
    {navigationTools.map((tool) => {
        const active = tool.slug === activeToolSlug;
        return (
            <Link key={tool.slug} href={getToolHref(tool.slug)} className="workspace-top-button relative" title={tool.label} aria-label={tool.label} aria-current={active ? "page" : undefined}>
                <span className="whitespace-nowrap">{tool.shortLabel}</span>
            </Link>
        );
    })}
</nav>
```

Keep `buildReturnTarget`, `buildAssetsReturnHref`, model configuration, theme, release and user actions unchanged.

- [ ] **Step 4: Apply the same responsive contract to the project workspace top bar**

In `project-workspace-shell.tsx`:

```tsx
// Change the React import to type-only ReactNode.
import type { ReactNode } from "react";

// Remove the MobileNavDrawer import, menu state, “菜单” button and drawer element.
<nav className="ml-4 flex h-10 min-w-0 flex-1 items-center gap-1 overflow-x-auto">
    {navigationTools.map((tool) => (
        <ProjectWorkspaceLink key={tool.slug} label={tool.shortLabel} title={tool.label} href={getToolHref(tool.slug)} active={tool.slug === activeToolSlug} />
    ))}
</nav>
```

Preserve all pre-existing uncommitted changes in this file, especially canvas project routing and the flattened toolbar styling.

- [ ] **Step 5: Run the targeted check only if explicitly authorized**

```bash
cd web && node --experimental-strip-types --test src/components/layout/app-top-nav.test.mts
```

Expected after implementation: one passing test and zero failures.

- [ ] **Step 6: Perform the always-safe static checks**

```bash
rg -n "打开导航菜单|mobileNavOpen|MobileNavDrawer" web/src/components/layout/app-top-nav.tsx web/src/app/\(user\)/projects/project-workspace-shell.tsx
git diff --check -- web/src/components/layout/app-top-nav.test.mts web/src/components/layout/app-top-nav.tsx web/src/app/\(user\)/projects/project-workspace-shell.tsx
```

Expected: `rg` prints no matches and `git diff --check` exits successfully.

- [ ] **Step 7: Update the pending manual acceptance record**

Add this item to `docs/pending-test.md` without staging unrelated existing edits:

```markdown
### 顶部导航移除菜单

- 用户侧全局顶栏和项目工作区顶栏不再显示“菜单”按钮；工具入口在窄屏保持单行并可横向滚动。
- 人工验收：分别在桌面宽度和 390px 窄屏打开资产主体页与项目工作区，确认所有工具入口可达、当前项高亮正确、右侧账户操作未被挤出且页面没有横向溢出。
```

- [ ] **Step 8: Commit only the owned implementation files**

```bash
git add web/src/components/layout/app-top-nav.test.mts web/src/components/layout/app-top-nav.tsx
git add -p web/src/app/\(user\)/projects/project-workspace-shell.tsx
git commit -m "refactor: remove redundant top navigation menu"
```

Do not stage `docs/pending-test.md` or unrelated user changes. Verify the staged patch contains only the menu removal, scrollable navigation classes and regression test.
