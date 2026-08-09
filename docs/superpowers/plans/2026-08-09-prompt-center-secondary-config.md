# Prompt Center Secondary Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the prompt center from global primary navigation while preserving it as a secondary entry inside the existing configuration modal.

**Architecture:** Keep the `/prompts` page, prompt data, APIs, stores, and contextual template selectors unchanged. Remove only the `prompts` navigation descriptor, then add a small configuration card whose button closes the modal and routes to `/prompts` through the existing Next.js router.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Node test runner.

---

### Task 1: Lock the secondary-navigation boundary with a failing test

**Files:**
- Create: `web/src/components/layout/prompt-config-navigation.test.mts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { navigationTools } from "../../constant/navigation-tools.ts";

const modal = readFileSync(new URL("./app-config-modal.tsx", import.meta.url), "utf8");

test("prompt center is a secondary configuration instead of a primary navigation tool", () => {
    assert.equal(navigationTools.some((tool) => tool.slug === "prompts"), false);
    assert.ok(modal.includes("提示词配置"));
    assert.ok(modal.includes('router.push("/prompts")'));
    assert.match(modal, /const openPromptConfig = \(\) => \{\s*setConfigDialogOpen\(false\);\s*router\.push\("\/prompts"\);\s*\};/);
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
cd web && node --experimental-strip-types --input-type=module --eval "await import('./src/components/layout/prompt-config-navigation.test.mts')"
```

Expected: FAIL because `prompts` is still in `navigationTools` and the configuration modal has no secondary prompt entry.

### Task 2: Hide the primary entry and add the configuration entry

**Files:**
- Modify: `web/src/constant/navigation-tools.ts`
- Modify: `web/src/constant/navigation-tools.test.mts`
- Modify: `web/src/components/layout/app-config-modal.tsx`

- [ ] **Step 1: Remove the prompt descriptor and its unused icon**

Remove `FileText` from the Lucide import and delete this descriptor only:

```ts
{
    slug: "prompts",
    label: "提示词库",
    shortLabel: "提示词",
    icon: FileText,
},
```

- [ ] **Step 2: Align the existing navigation regression expectation**

```ts
assert.deepEqual(
    navigationTools.map((tool) => tool.slug),
    ["projects", "agent", "canvas", "image", "assets", "cache"],
);
```

- [ ] **Step 3: Add the prompt configuration route action**

```ts
const openPromptConfig = () => {
    setConfigDialogOpen(false);
    router.push("/prompts");
};
```

- [ ] **Step 4: Add a restrained secondary configuration card**

Place it below the existing model-channel summary and before model selectors:

```tsx
<div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
    <div>
        <div className="font-medium text-[var(--studio-text-primary)]">提示词配置</div>
        <div className="mt-1 text-sm text-[var(--studio-text-secondary)]">管理公司标准、项目风格和个人习惯，在画布与分镜任务中按需生效。</div>
    </div>
    <Button onClick={openPromptConfig}>打开提示词配置</Button>
</div>
```

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
cd web && node --experimental-strip-types --input-type=module --eval "await Promise.all([import('./src/components/layout/prompt-config-navigation.test.mts'), import('./src/constant/navigation-tools.test.mts'), import('./src/components/layout/app-config-modal.test.mts')])"
```

Expected: all relevant tests PASS.

### Task 3: Verify the live development UI and document the change

**Files:**
- Modify: `docs/pending-test.md`
- Check: `docs/todo.md`

- [ ] **Step 1: Run TypeScript and diff checks**

```bash
cd web && npm run typecheck
git diff --check
```

Expected: changed files introduce no new TypeScript or whitespace errors; any unrelated pre-existing failures are reported without modifying unrelated modules.

- [ ] **Step 2: Verify in the development browser**

Confirm the top navigation no longer contains a prompt entry. Open `配置`, confirm `打开提示词配置` is visible, click it, and confirm navigation to `/prompts` with no modal overlay left behind. Direct `/prompts` content and contextual prompt selectors remain unchanged.

- [ ] **Step 3: Update pending-test documentation**

Add this navigation change to the current top-navigation acceptance section. Only update `docs/todo.md` if it already contains a matching prompt-center navigation task.
