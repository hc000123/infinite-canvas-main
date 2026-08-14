# 2026 Production Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card-heavy SaaS shell with the approved adaptive production workspace while preserving all existing project, episode, agent, canvas, generation, and persistence behavior.

**Architecture:** Keep current routes, Zustand stores, hooks, API clients, and action callbacks as the source of truth. Add only presentation projections and layout state: a global application spine, an editorial project workstream, a project context tree, task-oriented production views, and a collapsible canvas execution surface. Ship each area independently so the redesign remains reversible and never requires a data migration.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Tailwind CSS, Zustand, lucide-react, Node test runner.

---

## Scope and file map

### Create

- `web/src/components/layout/app-workspace-spine.tsx`: global vertical navigation using existing route helpers.
- `web/src/components/layout/app-workspace-spine.test.mts`: source-level regression coverage for route and accessibility boundaries.
- `web/src/app/(user)/projects/project-workstream.ts`: pure projection from existing project/canvas data to editorial workstream items.
- `web/src/app/(user)/projects/project-workstream.test.mts`: deterministic projection tests.
- `web/src/app/(user)/projects/components/project-workstream-list.tsx`: workstream and compact project-row presentation.
- `web/src/app/(user)/projects/[id]/components/project-context-rail.tsx`: project/episode/stage navigation.
- `web/src/app/(user)/agent/components/agent-attention-stream.tsx`: task-oriented cross-project status presentation.
- `web/src/app/(user)/canvas/components/canvas-execution-trace.tsx`: presentation-only trace built from current assistant/task state.

### Modify

- `web/src/app/(user)/user-layout-client.tsx`: mount the global spine outside immersive canvas routes.
- `web/src/components/layout/app-top-nav.tsx`: remove the old global header after route behavior moves to the spine.
- `web/src/components/layout/app-top-nav.test.mts`: lock the new shell boundary instead of horizontal button styling.
- `web/src/lib/app-theme.ts`: graphite/neutral Ant Design tokens and selective action emphasis.
- `web/src/app/globals.css`: production workspace tokens, flat surfaces, focus and responsive shell rules.
- `web/src/app/(user)/projects/page.tsx`: replace grid/list cards with workstream composition; retain all mutations.
- `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`: compose context rail, continuous stage surface, and execution trace without changing callbacks.
- `web/src/app/(user)/projects/[id]/page.tsx`: pass existing status values needed by the new presentation.
- `web/src/app/(user)/agent/agent-workspace.tsx`: render the attention stream while retaining filters, URL routing and workbench entry.
- `web/src/app/(user)/agent/agent-workspace-wiring.test.mts`: lock reuse of current model and episode workbench.
- `web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx`: switch panel chrome to the trace presentation while preserving sessions/actions.
- `web/src/app/(user)/canvas/components/canvas-assistant-panel-chrome.tsx`: rename user-facing chrome from generic chat language to execution/history language.
- `web/src/app/(user)/canvas/utils/canvas-editorial-surface.test.mts`: lock edge-tool and non-duplicated-action boundaries.
- `docs/todo.md`: move only completed redesign items when implementation is actually complete.
- `docs/pending-test.md`: record the exact pages and interactions needing user acceptance.

### Explicitly untouched

- `web/src/app/(user)/canvas/components/canvas-create-rail.tsx`
- `web/src/app/(user)/canvas/components/canvas-tool-button.tsx`
- `web/src/app/(user)/canvas/utils/canvas-node-overlay-layout.test.mts`
- all API clients, Zustand data shapes, localforage keys, generation controllers and backend code.

---

### Task 1: Establish the quiet production visual foundation

**Files:**
- Modify: `web/src/lib/app-theme.ts`
- Modify: `web/src/app/globals.css`
- Create: `web/src/lib/app-theme-source.test.mts`

- [ ] **Step 1: Write the visual token regression test**

Create `web/src/lib/app-theme-source.test.mts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const themeSource = readFileSync(new URL("./app-theme.ts", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("production theme uses neutral surfaces and one selective action accent", () => {
    assert.match(cssSource, /--studio-app-bg:/);
    assert.match(cssSource, /--studio-work-surface:/);
    assert.match(cssSource, /--studio-spine-bg:/);
    assert.match(cssSource, /--studio-accent:/);
    assert.match(cssSource, /--studio-border-subtle:/);
    assert.doesNotMatch(cssSource, /\.studio-shell\s*\{[^}]*linear-gradient/s);
    assert.match(themeSource, /primaryShadow:\s*"none"/);
});

test("production controls do not animate vertical card lift", () => {
    const workspaceRules = cssSource.slice(cssSource.indexOf(".workspace-top-button"), cssSource.indexOf(".studio-workspace :where"));
    assert.doesNotMatch(workspaceRules, /translateY/);
});
```

- [ ] **Step 2: Record the focused verification command**

Run when the user requests verification:

```bash
cd web
node --experimental-strip-types --test src/lib/app-theme-source.test.mts
```

Expected: two passing tests. Per project rules, do not execute it during routine implementation unless the user asks for tests or full acceptance.

- [ ] **Step 3: Add the new semantic surface tokens**

Add to both `:root` and `.dark` in `globals.css`:

```css
--studio-work-surface: #f4f4f0;
--studio-spine-bg: #e9eae4;
--studio-context-bg: #efefe9;
--studio-trace-bg: #ecece6;
```

Use dark values `#101110`, `#0c0d0c`, `#131512`, and `#151714`. Change the light action accent to `#4f6500` and dark action accent to `#d9ff63`; use corresponding hover, soft and focus values. Keep success, warning and danger tokens unchanged.

- [ ] **Step 4: Flatten shared workspace surfaces**

Replace `.studio-shell`, `.studio-panel`, `.studio-panel-muted`, `.studio-rail`, `.studio-section`, `.studio-toolbar`, `.studio-page-header` and `.workspace-top-button` rules so they use solid semantic surfaces, `border-radius: 0` for structural regions, no backdrop blur, and no hover lift. Keep `6px` radius for form controls and transient popovers.

- [ ] **Step 5: Align Ant Design tokens**

In `app-theme.ts`, set the studio primary colors to the same light/dark accent values, reduce container translucency, set `borderRadiusLG: 6`, keep button shadows off, and remove the primary hover shadow. Do not change component behavior or validation colors.

- [ ] **Step 6: Commit the foundation**

```bash
git add web/src/lib/app-theme.ts web/src/app/globals.css web/src/lib/app-theme-source.test.mts
git commit -m "style: establish production workspace foundation"
```

---

### Task 2: Replace the horizontal SaaS header with the application spine

**Files:**
- Create: `web/src/components/layout/app-workspace-spine.tsx`
- Create: `web/src/components/layout/app-workspace-spine.test.mts`
- Modify: `web/src/app/(user)/user-layout-client.tsx`
- Modify: `web/src/components/layout/app-top-nav.tsx`
- Modify: `web/src/components/layout/app-top-nav.test.mts`

- [ ] **Step 1: Write the shell boundary test**

Create `app-workspace-spine.test.mts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const spine = readFileSync(new URL("./app-workspace-spine.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../../app/(user)/user-layout-client.tsx", import.meta.url), "utf8");

test("application spine reuses route context and exposes stable navigation", () => {
    assert.match(spine, /navigationTools/);
    assert.match(spine, /contextualToolHref/);
    assert.match(spine, /workspaceProjectId/);
    assert.match(spine, /aria-label="全局工作区"/);
    assert.match(spine, /aria-current=/);
    assert.match(spine, /UserStatusActions/);
});

test("immersive canvas remains outside the global spine", () => {
    assert.match(layout, /immersiveCanvas/);
    assert.match(layout, /<AppWorkspaceSpine/);
    assert.match(layout, /immersiveCanvas\s*\?\s*children/);
});
```

- [ ] **Step 2: Implement `AppWorkspaceSpine` with existing navigation behavior**

The component must:

```tsx
export function AppWorkspaceSpine() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const projectId = workspaceProjectId(pathname, searchParams);

    return (
        <aside aria-label="全局工作区" className="studio-app-spine flex w-14 shrink-0 flex-col border-r border-[var(--studio-border-subtle)] bg-[var(--studio-spine-bg)]">
            <Link href="/projects" aria-label="眨眼之间" className="grid h-14 place-items-center text-sm font-semibold">眨</Link>
            <nav className="flex flex-col items-center gap-1 px-2 py-3">
                {navigationTools.map(({ slug, label, icon: Icon }) => {
                    const href = contextualToolHref(slug, projectId);
                    const active = pathname === `/${slug}` || pathname.startsWith(`/${slug}/`) || (slug === "projects" && pathname.startsWith("/agent"));
                    return <Link key={slug} href={href} aria-label={label} aria-current={active ? "page" : undefined} className="studio-spine-action"><Icon className="size-4" /></Link>;
                })}
            </nav>
            <div className="mt-auto px-2 pb-3"><UserStatusActions variant="icon" /></div>
        </aside>
    );
}
```

Preserve the existing assets return URL and canvas project URL handling by moving `buildAssetsReturnHref` and the canvas branch from `AppTopNav` into the new component unchanged.

- [ ] **Step 3: Mount the spine without affecting canvas**

In `UserLayoutClient`, compute:

```ts
const immersiveCanvas = /^\/canvas\/[^/]+/.test(pathname) || pathname.startsWith("/login");
```

Render authenticated content as:

```tsx
<div className="flex h-dvh overflow-hidden bg-[var(--studio-app-bg)] text-[var(--studio-text-primary)]">
    {immersiveCanvas ? null : <AppWorkspaceSpine />}
    <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
</div>
```

- [ ] **Step 4: Retire the horizontal header**

Delete the header markup and routing duplication from `AppTopNav`; keep a compatibility export returning `null` only until all imports are removed, then remove the file and update its test. Do not change `navigationTools` or route helpers.

- [ ] **Step 5: Add responsive and focus styles**

Add `.studio-spine-action` rules with a 36px target, a single active indicator line, no container border, and visible focus ring. At widths below 900px keep the 48px spine; do not hide core navigation behind hover.

- [ ] **Step 6: Record verification**

```bash
cd web
node --experimental-strip-types --test src/components/layout/app-workspace-spine.test.mts src/components/layout/app-top-nav.test.mts
```

Expected: route context, active state, and immersive canvas boundary pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/layout web/src/app/'(user)'/user-layout-client.tsx web/src/app/globals.css
git commit -m "feat: add adaptive application spine"
```

---

### Task 3: Turn the project card wall into an editorial workstream

**Files:**
- Create: `web/src/app/(user)/projects/project-workstream.ts`
- Create: `web/src/app/(user)/projects/project-workstream.test.mts`
- Create: `web/src/app/(user)/projects/components/project-workstream-list.tsx`
- Modify: `web/src/app/(user)/projects/page.tsx`
- Modify: `web/src/app/(user)/projects/project-card-entry.test.mts`

- [ ] **Step 1: Write projection tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectWorkstream } from "./project-workstream.ts";

test("workstream sorts by current attention and update time", () => {
    const items = buildProjectWorkstream([
        { id: "archived", title: "旧项目", description: "", status: "archived", updatedAt: "2026-08-14T09:00:00Z", canvasCount: 1 },
        { id: "active", title: "毕业典礼", description: "", status: "active", updatedAt: "2026-08-14T08:00:00Z", canvasCount: 3 },
    ]);
    assert.deepEqual(items.map((item) => item.id), ["active", "archived"]);
    assert.equal(items[0]?.actionLabel, "继续制作");
    assert.equal(items[1]?.actionLabel, "查看项目");
});

test("workstream derives only facts available in current stores", () => {
    const [item] = buildProjectWorkstream([{ id: "p1", title: "片名", description: "说明", status: "active", updatedAt: "2026-08-14T08:00:00Z", canvasCount: 0 }]);
    assert.equal(item?.summary, "说明");
    assert.equal(item?.meta, "暂无画布");
});
```

- [ ] **Step 2: Implement the pure projection**

```ts
export type ProjectWorkstreamSource = {
    canvasCount: number;
    description: string;
    id: string;
    status: "active" | "archived";
    title: string;
    updatedAt: string;
};

export type ProjectWorkstreamItem = ProjectWorkstreamSource & {
    actionLabel: "继续制作" | "查看项目";
    meta: string;
    summary: string;
};

export function buildProjectWorkstream(sources: ProjectWorkstreamSource[]): ProjectWorkstreamItem[] {
    return [...sources]
        .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .map((source) => ({
            ...source,
            actionLabel: source.status === "active" ? "继续制作" : "查看项目",
            meta: source.canvasCount ? `${source.canvasCount} 个画布` : "暂无画布",
            summary: source.description.trim() || "尚未添加项目说明",
        }));
}
```

- [ ] **Step 3: Build the presentation-only workstream list**

`ProjectWorkstreamList` receives items plus the existing edit/archive/restore/delete callbacks. Render one continuous list with thin separators, project title, summary, canvas count, updated time, one primary inline link, and a low-frequency dropdown. Do not put every row in a rounded card and do not introduce new mutation logic.

- [ ] **Step 4: Recompose `ProjectsPage`**

Keep `createAndOpen`, `removeProject`, `archiveProjectWithConfirm`, all Zustand selectors, search, filters and the create modal. Remove only `viewMode`, `Grid2X2`, `LayoutList`, the card grid and the external cover image decoration. Compose:

```tsx
<section className="studio-workstream h-full overflow-y-auto">
    <header className="studio-editorial-header">...</header>
    <div className="grid xl:grid-cols-[minmax(0,1fr)_300px]">
        <ProjectWorkstreamList ... />
        <aside aria-label="今日焦点">...</aside>
    </div>
</section>
```

The first version of “今日焦点” may show active project count, archived project count and the most recently updated active project only; do not invent remote task status.

- [ ] **Step 5: Record verification and commit**

```bash
cd web
node --experimental-strip-types --test src/app/'(user)'/projects/project-workstream.test.mts src/app/'(user)'/projects/project-card-entry.test.mts
git add src/app/'(user)'/projects
git commit -m "feat: replace project cards with workstream"
```

Expected: projections are deterministic and all existing mutation entry points remain present.

---

### Task 4: Recompose project detail into context rail and stage workspace

**Files:**
- Create: `web/src/app/(user)/projects/[id]/components/project-context-rail.tsx`
- Create: `web/src/app/(user)/projects/[id]/components/project-context-rail.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`
- Modify: `web/src/app/(user)/projects/[id]/page.tsx`
- Modify: `web/src/app/(user)/projects/project-detail-navigation.test.mts`

- [ ] **Step 1: Lock the navigation and action boundary**

Test that `ProjectContextRail` receives rows/current selection and emits only navigation callbacks; test that `ProjectEpisodeBoard` still contains callbacks for import, edit, Skill execution, canvas binding, project cache and production control.

```ts
assert.match(rail, /onSelectEpisode/);
assert.doesNotMatch(rail, /useCreativeProjectStore|useScriptStore|useCanvasStore/);
for (const callback of ["onImportEpisode", "onOptimizeEpisodeScript", "onOpenEpisodeCanvas", "onBindCanvas", "onOpenAgentWorkspace"]) assert.match(board, new RegExp(callback));
```

- [ ] **Step 2: Implement the context rail**

Render stable sections for project overview, assets, episode rows and current episode stages. Use buttons/links with `aria-current`, a 36px minimum target, and a single active border. On medium screens expose the same content through an Ant Design Drawer controlled locally by the board.

- [ ] **Step 3: Flatten `ProjectEpisodeBoard`**

Keep its prop contract. Replace the outer rounded panel and nested episode cards with:

```tsx
<div className="grid h-full min-h-0 xl:grid-cols-[224px_minmax(0,1fr)_280px]">
    <ProjectContextRail ... />
    <main className="min-w-0 overflow-y-auto bg-[var(--studio-work-surface)]">...</main>
    <aside className="border-l bg-[var(--studio-trace-bg)]">...</aside>
</div>
```

The stage rail uses existing derived values (`stage`, `progress`, `status`). The trace aside uses only `optimizingEpisodeIds` and `scriptOptimizeErrors`; idle state explains that no employee task is running. Preserve all modal and callback behavior.

- [ ] **Step 4: Keep the page as an assembly layer**

Do not move invocation execution or store mutations out of `page.tsx` in this visual task. Pass only existing derived status needed by the board. Do not add a new global store.

- [ ] **Step 5: Record verification and commit**

```bash
cd web
node --experimental-strip-types --test src/app/'(user)'/projects/'[id]'/components/project-context-rail.test.mts src/app/'(user)'/projects/project-detail-navigation.test.mts
git add src/app/'(user)'/projects/'[id]' src/app/'(user)'/projects/project-detail-navigation.test.mts
git commit -m "feat: add adaptive project production workspace"
```

---

### Task 5: Turn production control into an attention stream

**Files:**
- Create: `web/src/app/(user)/agent/components/agent-attention-stream.tsx`
- Modify: `web/src/app/(user)/agent/agent-workspace.tsx`
- Modify: `web/src/app/(user)/agent/components/agent-project-overview.tsx`
- Modify: `web/src/app/(user)/agent/components/agent-episode-overview.tsx`
- Modify: `web/src/app/(user)/agent/agent-workspace-wiring.test.mts`

- [ ] **Step 1: Expand the existing wiring test**

```ts
assert.match(source, /buildAgentProjectViews/);
assert.match(source, /filterAgentProjectViews/);
assert.match(source, /AgentAttentionStream/);
assert.match(source, /EpisodeWorkflowWorkbench/);
assert.match(source, /listWorkflowRuns/);
```

Also assert that the presentation component does not import API clients or stores.

- [ ] **Step 2: Implement the attention stream**

Accept `AgentProjectView[]` only. Group items in this order: failed/blocked, review, running, active without runs, completed. Each row shows project, episode, stage, state and a single “打开” action. Use existing fields from `agent-workspace-model.ts`; do not synthesize new workflow states.

- [ ] **Step 3: Recompose `AgentWorkspace`**

Keep remote fetch, keyword/status filters, project selector, URL routing and `EpisodeWorkflowWorkbench` unchanged. Replace the top marketing-style header and card stack with a compact production header, continuous attention stream, and status summary rail. The selected-project path continues to use `AgentEpisodeOverview` but with flat rows.

- [ ] **Step 4: Record verification and commit**

```bash
cd web
node --experimental-strip-types --test src/app/'(user)'/agent/agent-workspace-model.test.mts src/app/'(user)'/agent/agent-workspace-wiring.test.mts
git add src/app/'(user)'/agent
git commit -m "feat: present agent work as attention stream"
```

---

### Task 6: Reframe the canvas assistant as a collapsible execution trace

**Files:**
- Create: `web/src/app/(user)/canvas/components/canvas-execution-trace.tsx`
- Create: `web/src/app/(user)/canvas/components/canvas-execution-trace.test.mts`
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-panel-chrome.tsx`
- Modify: `web/src/app/(user)/canvas/utils/canvas-editorial-surface.test.mts`

- [ ] **Step 1: Write the preservation test**

```ts
assert.match(panel, /useCanvasAssistantSessions|CanvasAssistantComposer|CanvasAssistantHistory/);
assert.match(panel, /CanvasExecutionTrace/);
assert.match(trace, /aria-label="员工执行轨迹"/);
assert.doesNotMatch(trace, /useCanvasStore|fetch\(|services\/api/);
assert.match(editorialSurface, /CanvasCreateRail/);
```

The test must also assert that `canvas-create-rail.tsx` and `canvas-tool-button.tsx` are not imported by the new trace.

- [ ] **Step 2: Build a presentation-only trace**

Map current assistant messages and plan state into display rows without changing storage. Show `运行中`, `等待确认`, `已完成`, and `失败` only when those states already exist in current plan/message data; otherwise show ordinary conversation history.

- [ ] **Step 3: Recompose the assistant panel**

Keep history selection, deletion, session creation, composer submission, asset references and workflow actions intact. Change the default header to “员工执行轨迹”, make the panel collapsible by the existing `onCollapse`, and reduce empty-state branding to one quiet line plus the existing workflow assistant action.

- [ ] **Step 4: Leave all canvas action entry points untouched**

Do not edit the dirty `canvas-create-rail.tsx`, `canvas-tool-button.tsx`, deleted placeholder or overlay test. Do not change `CanvasTopBar` action callbacks, node generation, image/video tools or shortcuts.

- [ ] **Step 5: Record verification and commit**

```bash
cd web
node --experimental-strip-types --test src/app/'(user)'/canvas/components/canvas-execution-trace.test.mts src/app/'(user)'/canvas/utils/canvas-editorial-surface.test.mts src/app/'(user)'/canvas/utils/canvas-global-action-entry.test.mts
git add src/app/'(user)'/canvas/components/canvas-execution-trace.tsx src/app/'(user)'/canvas/components/canvas-execution-trace.test.mts src/app/'(user)'/canvas/components/canvas-assistant-panel.tsx src/app/'(user)'/canvas/components/canvas-assistant-panel-chrome.tsx src/app/'(user)'/canvas/utils/canvas-editorial-surface.test.mts
git commit -m "style: align canvas assistant with execution trace"
```

---

### Task 7: Accessibility, visual acceptance, and documentation

**Files:**
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Review only: `CHANGELOG.md`

- [ ] **Step 1: Inspect desktop layouts**

Check `/projects`, one `/projects/[id]`, `/agent`, and one `/canvas/[id]` at approximately 1440×1000 in both themes. Confirm main content dominates, navigation is visually quieter, no text clips, and no structural surface uses nested rounded cards.

- [ ] **Step 2: Inspect medium and narrow layouts**

Check 1024px and 768px widths. Confirm the project context rail becomes accessible without hover, execution trace does not permanently squeeze content, and the immersive canvas remains full width.

- [ ] **Step 3: Keyboard and state inspection**

Tab through the application spine, project workstream, context rail, primary actions and canvas edge controls. Confirm visible focus, `aria-current`, 36px targets, and distinguishable disabled/error states.

- [ ] **Step 4: Confirm logic preservation**

Manually inspect entry points for project create/edit/archive/restore/delete, episode import/rename/Skill run, production-control routing, canvas import/assets/organize/save, assistant sessions and paid-generation confirmation. This is a UI acceptance pass; do not submit real paid generation tasks.

- [ ] **Step 5: Update project documentation**

Move completed redesign items from `docs/todo.md` to `docs/pending-test.md`. Record only testable changes: application spine, project workstream, project context workspace, attention stream and canvas execution trace. Leave `docs/features.md` unchanged until the user confirms acceptance. Update `CHANGELOG.md` only with a version-level summary if the project already records this work in `Unreleased`.

- [ ] **Step 6: Optional complete verification when explicitly requested**

```bash
cd web
npm run test
npm run typecheck
npm run lint
```

Expected: all commands exit 0. Do not run by default under this repository's development rules.

- [ ] **Step 7: Final implementation commit**

```bash
git add docs/todo.md docs/pending-test.md CHANGELOG.md
git commit -m "docs: record production workspace acceptance"
```

---

## Self-review

- Spec coverage: global shell, workstream homepage, project context, production attention flow, canvas execution trace, deep/light themes, responsive behavior, accessibility and logic freeze all map to tasks above.
- Placeholder scan: every implementation step names exact files, actions and acceptance evidence. Later “generation lineage mode” is deliberately out of scope in the approved design, not an unfinished task.
- Type consistency: new projections consume existing `CreativeProject`, canvas counts and `AgentProjectView`; no store or API type changes are introduced.
- Dirty-worktree safety: the four pre-existing canvas changes are explicitly excluded from edit and staging commands.
