# Workspace Navigation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved five-entry workspace navigation, collapsible application spine, single project production entry, canonical episode Workflow route, and source-aware return paths without changing business data or generation behavior.

**Architecture:** Keep the current Next.js routes, stores, API clients, Workflow workbench, Canvas actions, and asset data as the source of truth. Change only route builders, navigation presentation, lightweight local UI preference, and source parameters. The existing `/agent` page remains the cross-project attention surface; the existing nested episode Workflow route becomes the canonical single-episode production surface.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Tailwind CSS, Zustand, lucide-react, Node test runner.

---

## Scope and file map

### Create

- `web/src/app/(user)/resources/page.tsx`: low-frequency resource index for prompts and cache.
- `web/src/app/(user)/resources/resources-page.test.mts`: locks resource destinations and prevents business duplication.
- `web/src/app/(user)/projects/[id]/project-production-entry.test.mts`: locks the single “制作本集” entry.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-navigation.test.mts`: locks the canonical route and return contract.
- `web/src/app/(user)/canvas/utils/canvas-navigation-entry.test.mts`: locks the single visible Canvas return action.
- `web/src/app/(user)/assets/asset-navigation.ts`: pure subject-detail return URL builder.
- `web/src/app/(user)/assets/asset-navigation.test.mts`: locks filtered asset-list return behavior.

### Modify

- `web/src/constant/navigation-tools.ts`: replace six current tools with workbench, production control, canvas, assets, and resources.
- `web/src/constant/navigation-tools.test.mts`: update the navigation contract.
- `web/src/components/layout/app-workspace-spine.tsx`: add collapse persistence, active-route grouping, resource navigation, and horizontal expanded footer.
- `web/src/components/layout/app-workspace-spine.test.mts`: cover persistence and accessibility.
- `web/src/components/layout/user-status-actions.tsx`: allow the spine to hide version text when collapsed.
- `web/src/app/globals.css`: add the 164px/52px spine states and immediate interaction feedback.
- `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`: remove the project-control tab and its callback.
- `web/src/app/(user)/projects/[id]/page.tsx`: remove the project-control callback while retaining the existing episode action.
- `web/src/app/(user)/original-workflow/video-workflow-routing.ts`: make the nested episode Workflow route canonical.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx`: render the existing `EpisodeWorkflowWorkbench` instead of redirecting to `/agent`.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/episode-workflow-workbench.tsx`: accept a single return target.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-header.tsx`: render the source-aware return target.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-delivery-check.test.mts`: update the canonical route assertion.
- `web/src/app/(user)/agent/agent-workspace-model.ts`: build task links to the nested Workflow with a return to production control.
- `web/src/app/(user)/agent/agent-workspace.tsx`: redirect old episode-selected `/agent` URLs and stop mounting the episode workbench inside production control.
- `web/src/app/(user)/agent/agent-workspace-model.test.mts`: update task-link expectations.
- `web/src/app/(user)/canvas/components/canvas-top-bar.tsx`: remove duplicate return and project-home menu items.
- `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`: remove the obsolete `onHome` wiring.
- `web/src/app/(user)/canvas/hooks/canvas-page-action-targets.ts`: make unbound canvases return to the Canvas list.
- `web/src/app/(user)/canvas/hooks/use-canvas-page-actions.test.mts`: cover the Canvas-list fallback.
- `web/src/app/(user)/assets/components/asset-subject-card.tsx`: preserve the current asset-list URL when opening a subject.
- `web/src/app/(user)/assets/page.tsx`: preserve the current asset-list URL after creating a subject.
- `docs/todo.md`: inspect for a matching navigation-flow item; leave unchanged if no exact item is completed by this plan.
- `docs/pending-test.md`: record the exact manual acceptance path for this change.

### Explicitly untouched

- `web/src/app/(user)/canvas/components/canvas-create-rail.tsx`
- `web/src/app/(user)/canvas/components/canvas-tool-button.tsx`
- `web/src/app/(user)/canvas/utils/canvas-node-overlay-layout.test.mts`
- all API clients, Workflow stage state, generation handlers, upscale/interpolation/subtitle-erase logic, business Zustand shapes, and localforage business data.

## Verification policy

The commands below are the focused acceptance commands with expected results. Project rules say routine implementation does not run tests unless the user explicitly requests verification; an executing agent must still write the regression tests, but only run the listed commands after such a request.

---

### Task 1: Establish the five-entry navigation contract and resource index

**Files:**
- Modify: `web/src/constant/navigation-tools.test.mts`
- Modify: `web/src/constant/navigation-tools.ts`
- Create: `web/src/app/(user)/resources/resources-page.test.mts`
- Create: `web/src/app/(user)/resources/page.tsx`

- [ ] **Step 1: Replace the old navigation assertions**

Use this exact contract in `navigation-tools.test.mts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { navigationTools } from "./navigation-tools.ts";

test("keeps five distinct workspace-level entries", () => {
    assert.deepEqual(navigationTools.map((tool) => tool.slug), ["projects", "agent", "canvas", "assets", "resources"]);
    assert.deepEqual(navigationTools.map((tool) => tool.label), ["工作台", "生产总控", "画布", "素材", "资源库"]);
});

test("keeps storyboard, prompts and cache out of the primary spine", () => {
    assert.equal(navigationTools.some((tool) => ["storyboard", "prompts", "cache"].includes(tool.slug)), false);
});
```

- [ ] **Step 2: Record the failing-test command**

Run when verification is authorized:

```bash
cd web
node --experimental-strip-types --test src/constant/navigation-tools.test.mts
```

Expected before implementation: FAIL because the current slugs are `projects, canvas, storyboard, assets, prompts, cache`.

- [ ] **Step 3: Replace `navigationTools` with the approved entries**

```ts
import { Boxes, BriefcaseBusiness, Images, PanelsTopLeft, RadioTower } from "lucide-react";

export const navigationTools = [
    { slug: "projects", label: "工作台", shortLabel: "工作台", icon: BriefcaseBusiness },
    { slug: "agent", label: "生产总控", shortLabel: "总控", icon: RadioTower },
    { slug: "canvas", label: "画布", shortLabel: "画布", icon: PanelsTopLeft },
    { slug: "assets", label: "素材", shortLabel: "素材", icon: Images },
    { slug: "resources", label: "资源库", shortLabel: "资源", icon: Boxes },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
```

Do not add storyboard, prompts, or cache compatibility entries to this array.

- [ ] **Step 4: Write the resource-page source test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("resource index links to existing tools without reimplementing them", () => {
    assert.match(source, /href="\/prompts"/);
    assert.match(source, /href="\/cache"/);
    assert.doesNotMatch(source, /usePrompt|useCache|fetch\(/);
});
```

- [ ] **Step 5: Add the presentation-only resource index**

Create `resources/page.tsx`:

```tsx
import Link from "next/link";
import { BookOpenText, Database, ArrowUpRight } from "lucide-react";

const resources = [
    { href: "/prompts", icon: BookOpenText, title: "提示词库", description: "管理创作提示词、模板和业务分类。" },
    { href: "/cache", icon: Database, title: "缓存管理", description: "查看项目文件、占用空间和待处理缓存。" },
];

export default function ResourcesPage() {
    return (
        <main className="studio-workspace studio-shell h-full overflow-y-auto text-[var(--studio-text-primary)]">
            <div className="mx-auto max-w-5xl px-6 py-10">
                <p className="text-xs font-medium tracking-[0.18em] text-[var(--studio-text-muted)]">RESOURCE LIBRARY</p>
                <h1 className="mt-3 text-3xl font-semibold">资源库</h1>
                <p className="mt-2 text-sm text-[var(--studio-text-secondary)]">低频内容资源与系统维护入口。</p>
                <div className="mt-8 divide-y divide-[var(--studio-border-subtle)] border-y border-[var(--studio-border-subtle)]">
                    {resources.map(({ href, icon: Icon, title, description }) => (
                        <Link key={href} href={href} className="group flex items-center gap-4 px-1 py-5 hover:bg-[var(--studio-hover-bg)]">
                            <Icon className="size-5 text-[var(--studio-accent)]" aria-hidden />
                            <span className="min-w-0 flex-1"><strong className="block text-sm">{title}</strong><span className="mt-1 block text-xs text-[var(--studio-text-muted)]">{description}</span></span>
                            <ArrowUpRight className="size-4 text-[var(--studio-text-muted)] group-hover:text-[var(--studio-text-primary)]" aria-hidden />
                        </Link>
                    ))}
                </div>
            </div>
        </main>
    );
}
```

- [ ] **Step 6: Record the passing-test command**

```bash
cd web
node --experimental-strip-types --test src/constant/navigation-tools.test.mts 'src/app/(user)/resources/resources-page.test.mts'
```

Expected after implementation: 3 passing tests.

- [ ] **Step 7: Commit the navigation contract**

```bash
git add web/src/constant/navigation-tools.ts web/src/constant/navigation-tools.test.mts 'web/src/app/(user)/resources/page.tsx' 'web/src/app/(user)/resources/resources-page.test.mts'
git commit -m "feat: simplify workspace navigation"
```

---

### Task 2: Add the 164px/52px persistent application spine

**Files:**
- Modify: `web/src/components/layout/app-workspace-spine.test.mts`
- Modify: `web/src/components/layout/app-workspace-spine.tsx`
- Modify: `web/src/components/layout/user-status-actions.tsx`
- Modify: `web/src/app/globals.css`

- [ ] **Step 1: Extend the spine source test**

Add these assertions to `app-workspace-spine.test.mts`:

```ts
test("application spine persists collapse state and remains accessible", () => {
    assert.match(spine, /workspace-spine-collapsed/);
    assert.match(spine, /localStorage\.getItem/);
    assert.match(spine, /localStorage\.setItem/);
    assert.match(spine, /aria-expanded=\{!collapsed\}/);
    assert.match(spine, /data-collapsed=\{collapsed\}/);
    assert.match(spine, /hideVersion=\{collapsed\}/);
});

test("resource child pages keep the resource entry active", () => {
    assert.match(spine, /slug === "resources"/);
    assert.match(spine, /pathname\.startsWith\("\/prompts"\)/);
    assert.match(spine, /pathname\.startsWith\("\/cache"\)/);
});
```

- [ ] **Step 2: Record the failing-test command**

```bash
cd web
node --experimental-strip-types --test src/components/layout/app-workspace-spine.test.mts
```

Expected before implementation: the new persistence assertions fail.

- [ ] **Step 3: Add local collapse state to `AppWorkspaceSpine`**

Import `useEffect`, `useState`, `PanelLeftClose`, and `PanelLeftOpen`, then add:

```tsx
const SPINE_COLLAPSED_KEY = "workspace-spine-collapsed";

const [collapsed, setCollapsed] = useState(false);
useEffect(() => setCollapsed(window.localStorage.getItem(SPINE_COLLAPSED_KEY) === "1"), []);

const toggleCollapsed = () => {
    setCollapsed((current) => {
        const next = !current;
        window.localStorage.setItem(SPINE_COLLAPSED_KEY, next ? "1" : "0");
        return next;
    });
};
```

Replace the current `<aside>` opening tag with:

```tsx
<aside aria-label="全局工作区" data-collapsed={collapsed} className="studio-app-spine flex shrink-0 flex-col border-r border-[var(--studio-border-subtle)] bg-[var(--studio-spine-bg)]">
```

Keep the current brand and navigation map in place. Insert this control after `</nav>` and replace the current footer with the shown footer:

```tsx
<button type="button" className="studio-spine-collapse" onClick={toggleCollapsed} aria-label={collapsed ? "展开全局工作区" : "收起全局工作区"} aria-expanded={!collapsed}>
    {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /><span className="studio-spine-label">收起侧栏</span></>}
</button>
<div className="studio-spine-footer mt-auto border-t border-[var(--studio-border-subtle)] px-2 py-2">
    <UserStatusActions hideVersion={collapsed} />
</div>
```

Keep asset `returnTo`, Canvas project filtering, and `workspaceProjectId()` logic unchanged. Replace `isToolActive` with:

```ts
function isToolActive(pathname: string, slug: NavigationToolSlug) {
    if (slug === "resources") return pathname.startsWith("/resources") || pathname.startsWith("/prompts") || pathname.startsWith("/cache");
    return pathname === `/${slug}` || pathname.startsWith(`/${slug}/`);
}
```

- [ ] **Step 4: Allow the footer to hide only the version action**

Extend `UserStatusActionsProps` and its function signature:

```tsx
type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas" | "text";
    onOpenShortcuts?: () => void;
    accountOpen?: boolean;
    onAccountOpenChange?: (open: boolean) => void;
    accountRef?: RefObject<HTMLDivElement | null>;
    getPopupContainer?: (node: HTMLElement) => HTMLElement;
    hideVersion?: boolean;
};

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts, accountOpen, onAccountOpenChange, accountRef, getPopupContainer, hideVersion = false }: UserStatusActionsProps) {
```

Replace the unconditional version control with:

```tsx
{hideVersion ? null : <VersionReleaseModal className={variant === "text" ? `${actionClass} hidden sm:inline-flex` : variant === "default" ? `${actionClass} studio-version-action` : undefined} style={versionStyle} />}
```

Keep configuration, theme, account, logout, and Canvas credit behavior unchanged.

- [ ] **Step 5: Add exact expanded and collapsed CSS states**

Add or replace these rules in `globals.css`:

```css
.studio-app-spine {
    position: relative;
    z-index: 80;
    width: 10.25rem;
    transition: width 120ms ease;
}

.studio-app-spine[data-collapsed="true"] { width: 3.25rem; }

.studio-spine-collapse {
    display: flex;
    height: 2.25rem;
    align-items: center;
    gap: 0.625rem;
    margin: 0 0.5rem 0.5rem;
    padding: 0 0.625rem;
    border-radius: 0.375rem;
    color: var(--studio-text-muted);
    transition: background-color 100ms ease, color 100ms ease;
}

.studio-spine-collapse:hover { background: var(--studio-hover-bg); color: var(--studio-text-primary); }
.studio-spine-footer > div { display: flex; flex-direction: row; justify-content: space-between; gap: 0.125rem; }
.studio-version-action { width: 2.75rem !important; }
.studio-app-spine[data-collapsed="true"] .studio-spine-label { display: none; }
.studio-app-spine[data-collapsed="true"] .studio-spine-action { width: 2.25rem; grid-template-columns: 1fr; justify-items: center; padding: 0; }
.studio-app-spine[data-collapsed="true"] .studio-spine-collapse { width: 2.25rem; justify-content: center; padding: 0; }
.studio-app-spine[data-collapsed="true"] .studio-spine-footer > div { flex-direction: column; align-items: center; }

@media (max-width: 899px) {
    .studio-app-spine { width: 3.25rem; }
    .studio-app-spine .studio-spine-label { display: none; }
    .studio-app-spine .studio-spine-action { width: 2.25rem; grid-template-columns: 1fr; justify-items: center; padding: 0; }
}
```

Do not add hover delays, overlay positioning, or resize observers.

- [ ] **Step 6: Record the passing-test command**

```bash
cd web
node --experimental-strip-types --test src/components/layout/app-workspace-spine.test.mts
```

Expected after implementation: all spine tests pass.

- [ ] **Step 7: Commit the spine behavior**

```bash
git add web/src/components/layout/app-workspace-spine.tsx web/src/components/layout/app-workspace-spine.test.mts web/src/components/layout/user-status-actions.tsx web/src/app/globals.css
git commit -m "feat: add collapsible workspace spine"
```

---

### Task 3: Make “制作本集” the only project production entry

**Files:**
- Create: `web/src/app/(user)/projects/[id]/project-production-entry.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`
- Modify: `web/src/app/(user)/projects/[id]/page.tsx`
- Modify: `web/src/app/(user)/original-workflow/video-workflow-routing.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-delivery-check.test.mts`

- [ ] **Step 1: Write the project-entry source test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const board = readFileSync(new URL("./components/project-episode-board.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("project detail exposes one episode production entry", () => {
    assert.match(board, /制作本集/);
    assert.doesNotMatch(board, /项目总控|进入生产总控/);
    assert.doesNotMatch(board, /onOpenAgentWorkspace/);
    assert.doesNotMatch(page, /agentWorkspaceHref|onOpenAgentWorkspace/);
});
```

- [ ] **Step 2: Update the canonical Workflow route assertion**

Replace the last test in `workflow-delivery-check.test.mts` with:

```ts
test("canonical workflow href uses the episode workflow route", () => {
    assert.equal(videoWorkflowHref(1, "p1", "e1"), "/projects/p1/episodes/e1/workflow?stage=script");
});
```

- [ ] **Step 3: Record the failing-test command**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/projects/[id]/project-production-entry.test.mts' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-delivery-check.test.mts'
```

Expected before implementation: project-control text is still present and the route still points to `/agent`.

- [ ] **Step 4: Remove the project-control presentation only**

In `project-episode-board.tsx`:

- remove `Bot` from the lucide import;
- remove `onOpenAgentWorkspace` from the prop type, destructuring, and JSX;
- delete only this button:

```tsx
<ProjectDetailNavButton active={false} icon={Bot} label="项目总控" onClick={onOpenAgentWorkspace} />
```

In project `page.tsx`:

- remove the `agentWorkspaceHref` import;
- remove the `onOpenAgentWorkspace` prop passed to `ProjectEpisodeBoard`.

Do not change `onOpenEpisode={openEpisodeWorkflow}`, episode selection, script actions, Canvas actions, or project cache.

- [ ] **Step 5: Make the nested Workflow path canonical**

Replace `videoWorkflowHref` completely:

```ts
export function videoWorkflowHref(order: number, sourceProjectId?: string, sourceEpisodeId?: string) {
    if (sourceProjectId && sourceEpisodeId) {
        const params = new URLSearchParams({ stage: "script" });
        return `/projects/${encodeURIComponent(sourceProjectId)}/episodes/${encodeURIComponent(sourceEpisodeId)}/workflow?${params.toString()}`;
    }
    const params = new URLSearchParams({
        episode: videoWorkflowEpisodeKey(order, sourceProjectId),
        projectSlug: videoWorkflowProjectSlug(sourceProjectId),
    });
    if (sourceProjectId) params.set("sourceProjectId", sourceProjectId);
    if (sourceEpisodeId) params.set("sourceEpisodeId", sourceEpisodeId);
    return `/original-workflow?${params.toString()}`;
}
```

Remove the now-unused `agentWorkspaceHref` import. Do not change the fallback for legacy records without both IDs.

- [ ] **Step 6: Render the existing workbench on the nested route**

Replace `workflow/page.tsx` with:

```tsx
import { EpisodeWorkflowWorkbench } from "./episode-workflow-workbench";

type WorkflowPageProps = { params: Promise<{ episodeId: string; id: string }> };

export default async function WorkflowPage({ params }: WorkflowPageProps) {
    const { episodeId, id: projectId } = await params;
    return <EpisodeWorkflowWorkbench episodeId={episodeId} projectId={projectId} />;
}
```

This changes only the page composition; it reuses the existing workbench and does not fork the Workflow logic.

- [ ] **Step 7: Record the passing-test command**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/projects/[id]/project-production-entry.test.mts' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-delivery-check.test.mts'
```

Expected after implementation: all tests pass.

- [ ] **Step 8: Commit the project production boundary**

```bash
git add 'web/src/app/(user)/projects/[id]/components/project-episode-board.tsx' 'web/src/app/(user)/projects/[id]/page.tsx' 'web/src/app/(user)/projects/[id]/project-production-entry.test.mts' 'web/src/app/(user)/original-workflow/video-workflow-routing.ts' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-delivery-check.test.mts'
git commit -m "feat: separate episode workflow from production control"
```

---

### Task 4: Make production-control tasks return to their source

**Files:**
- Modify: `web/src/app/(user)/agent/agent-workspace-model.test.mts`
- Modify: `web/src/app/(user)/agent/agent-workspace-model.ts`
- Modify: `web/src/app/(user)/agent/agent-workspace.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-navigation.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/episode-workflow-workbench.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-header.tsx`

- [ ] **Step 1: Lock the production-control task URL**

Extend the existing model import with `agentEpisodeHref` and `type AgentEpisodeView`, then add this test:

```ts
import { agentEpisodeHref, buildAgentEpisodeView, buildAgentProjectViews, filterAgentProjectViews, type AgentEpisodeView } from "./agent-workspace-model.ts";

test("production control task opens canonical workflow and returns to control", () => {
    const href = agentEpisodeHref({ id: "e1", projectId: "p1", currentStageKey: "storyboard" } as AgentEpisodeView);
    const url = new URL(href, "https://workspace.test");
    assert.equal(url.pathname, "/projects/p1/episodes/e1/workflow");
    assert.equal(url.searchParams.get("stage"), "storyboard");
    assert.equal(url.searchParams.get("returnTo"), "/agent?projectId=p1");
    assert.equal(url.searchParams.get("returnLabel"), "返回生产总控");
});
```

- [ ] **Step 2: Add a source-level Workflow navigation test**

Create `workflow-navigation.test.mts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const workbench = readFileSync(new URL("./episode-workflow-workbench.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("./components/workflow-header.tsx", import.meta.url), "utf8");

test("workflow renders one validated return target", () => {
    assert.match(page, /returnTo\.startsWith\("\/"\)/);
    assert.match(page, /!returnTo\.startsWith\("\/\/"\)/);
    assert.match(workbench, /returnHref/);
    assert.match(workbench, /returnLabel/);
    assert.match(header, /href=\{props\.returnHref\}/);
    assert.match(header, /aria-label=\{props\.returnLabel\}/);
});
```

- [ ] **Step 3: Record the failing-test command**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/agent/agent-workspace-model.test.mts' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-navigation.test.mts'
```

Expected before implementation: the task URL still points to `/agent` and Workflow has a fixed project return.

- [ ] **Step 4: Build canonical task URLs in `agentEpisodeHref`**

```ts
export function agentEpisodeHref(episode: AgentEpisodeView) {
    const returnTo = `/agent?projectId=${encodeURIComponent(episode.projectId)}`;
    const params = new URLSearchParams({ stage: episode.currentStageKey, returnTo, returnLabel: "返回生产总控" });
    return `/projects/${encodeURIComponent(episode.projectId)}/episodes/${encodeURIComponent(episode.id)}/workflow?${params.toString()}`;
}
```

- [ ] **Step 5: Redirect compatibility `/agent?...&episodeId=...` URLs**

In `agent-workspace.tsx`:

- import `agentEpisodeHref` from the model;
- remove the `EpisodeWorkflowWorkbench` import;
- after `selectedEpisode` is computed, add an unconditional effect:

```tsx
useEffect(() => {
    if (selectedEpisode) router.replace(agentEpisodeHref(selectedEpisode));
}, [router, selectedEpisode]);
```

Replace the old selected-episode workbench return with:

```tsx
if (selectedEpisode) return <main className="studio-shell grid h-full place-items-center"><Spin description="正在打开本集制作" /></main>;
```

This keeps old bookmarks working while ensuring `/agent` remains a cross-project surface.

- [ ] **Step 6: Validate and pass the Workflow return target at the route boundary**

Extend `workflow/page.tsx`:

```tsx
type WorkflowPageProps = {
    params: Promise<{ episodeId: string; id: string }>;
    searchParams: Promise<{ returnLabel?: string; returnTo?: string }>;
};

export default async function WorkflowPage({ params, searchParams }: WorkflowPageProps) {
    const [{ episodeId, id: projectId }, query] = await Promise.all([params, searchParams]);
    const returnTo = query.returnTo?.trim() || "";
    const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : `/projects/${encodeURIComponent(projectId)}`;
    const returnLabel = safeReturnTo.startsWith("/agent") ? "返回生产总控" : query.returnLabel?.trim() || "返回项目";
    return <EpisodeWorkflowWorkbench episodeId={episodeId} projectId={projectId} returnHref={safeReturnTo} returnLabel={returnLabel} />;
}
```

- [ ] **Step 7: Thread only the two return props into the header**

Change the workbench signature:

```tsx
export function EpisodeWorkflowWorkbench({ episodeId, projectId, returnHref, returnLabel }: { episodeId: string; projectId: string; returnHref: string; returnLabel: string }) {
```

Pass `returnHref` and `returnLabel` to `WorkflowHeader`. In `WorkflowHeader`, replace `projectId` with these props and render:

```tsx
<Link href={props.returnHref} aria-label={props.returnLabel} title={props.returnLabel} className="grid size-9 shrink-0 place-items-center rounded-md text-[var(--studio-text-muted)] transition hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]">
    <ArrowLeft className="size-4" />
</Link>
```

Do not add a second return button or use `router.back()`.

- [ ] **Step 8: Record the passing-test command**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/agent/agent-workspace-model.test.mts' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-navigation.test.mts'
```

Expected after implementation: all tests pass.

- [ ] **Step 9: Commit source-aware production navigation**

```bash
git add 'web/src/app/(user)/agent/agent-workspace-model.ts' 'web/src/app/(user)/agent/agent-workspace-model.test.mts' 'web/src/app/(user)/agent/agent-workspace.tsx' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/episode-workflow-workbench.tsx' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-header.tsx' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-navigation.test.mts'
git commit -m "feat: preserve production task return paths"
```

---

### Task 5: Remove duplicate Canvas exits and preserve asset-detail return paths

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-navigation-entry.test.mts`
- Modify: `web/src/app/(user)/canvas/components/canvas-top-bar.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/hooks/canvas-page-action-targets.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-page-actions.test.mts`
- Create: `web/src/app/(user)/assets/asset-navigation.ts`
- Create: `web/src/app/(user)/assets/asset-navigation.test.mts`
- Modify: `web/src/app/(user)/assets/components/asset-subject-card.tsx`
- Modify: `web/src/app/(user)/assets/page.tsx`

- [ ] **Step 1: Lock one Canvas return action**

Create `canvas-navigation-entry.test.mts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const topBar = readFileSync(new URL("../components/canvas-top-bar.tsx", import.meta.url), "utf8");

test("canvas top bar exposes one return action", () => {
    assert.match(topBar, /onClick=\{onReturnParent\}/);
    assert.doesNotMatch(topBar, /key: "parent"/);
    assert.doesNotMatch(topBar, /key: "projects"/);
    assert.doesNotMatch(topBar, /onHome/);
});
```

Add this fallback test to `use-canvas-page-actions.test.mts`:

```ts
test("unbound canvases return to the canvas list", () => {
    assert.deepEqual(canvasPageReturnTargetForProject(), { href: "/canvas", label: "返回画布列表" });
});
```

- [ ] **Step 2: Write the pure asset-navigation test**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { assetSubjectHref } from "./asset-navigation.ts";

test("asset subject returns to the exact filtered asset list", () => {
    const href = assetSubjectHref("subject 1", "/assets", "projectId=p1&kind=image");
    const url = new URL(href, "https://workspace.test");
    assert.equal(url.pathname, "/assets/subject%201");
    assert.equal(url.searchParams.get("returnTo"), "/assets?projectId=p1&kind=image");
    assert.equal(url.searchParams.get("returnLabel"), "返回素材");
});
```

- [ ] **Step 3: Record the failing-test command**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-navigation-entry.test.mts' 'src/app/(user)/canvas/hooks/use-canvas-page-actions.test.mts' 'src/app/(user)/assets/asset-navigation.test.mts'
```

Expected before implementation: Canvas contains duplicate menu exits and the asset helper does not exist.

- [ ] **Step 4: Remove only duplicate Canvas exits**

In `canvas-top-bar.tsx`:

- remove `Home` from the lucide import;
- remove `onHome` from the function arguments and prop type;
- remove the `parent` and `projects` menu items plus the divider immediately following them;
- keep the visible arrow button beside the Canvas title unchanged.

In `canvas-client-page.tsx`:

- remove `openProjectsHome` from the `useCanvasPageCallbacks` destructure if it has no remaining caller;
- remove `onHome={openProjectsHome}` from `CanvasTopBar`.

Do not touch create, clear, delete, undo, redo, import, assets, organize, save, or shortcuts.

- [ ] **Step 5: Make the no-context Canvas fallback explicit**

Change only the final return in `canvasPageReturnTargetForProject`:

```ts
return { href: "/canvas", label: "返回画布列表" };
```

Keep episode and project-specific branches unchanged.

- [ ] **Step 6: Add the asset subject URL builder**

Create `asset-navigation.ts`:

```ts
export function assetSubjectHref(subjectId: string, pathname: string, query = "") {
    const returnTo = query ? `${pathname}?${query}` : pathname;
    const params = new URLSearchParams({ returnTo, returnLabel: "返回素材" });
    return `/assets/${encodeURIComponent(subjectId)}?${params.toString()}`;
}
```

- [ ] **Step 7: Use the helper without adding prop chains**

In `asset-subject-card.tsx`, import `usePathname`, `useSearchParams`, and `assetSubjectHref`; compute once:

```tsx
const pathname = usePathname();
const searchParams = useSearchParams();
const subjectHref = assetSubjectHref(subject.id, pathname, searchParams.toString());
```

Replace all three literal `` `/assets/${subject.id}` `` links with `subjectHref`.

In asset `page.tsx`, import `usePathname` and `assetSubjectHref`, set `const pathname = usePathname();`, and change the new-subject navigation to:

```ts
router.push(assetSubjectHref(subjectId, pathname, searchParams.toString()));
```

Do not change asset filtering, upload, generation, subject data, or the existing safe-return validation in `[subjectId]/page.tsx`.

- [ ] **Step 8: Record the passing-test command**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-navigation-entry.test.mts' 'src/app/(user)/canvas/hooks/use-canvas-page-actions.test.mts' 'src/app/(user)/assets/asset-navigation.test.mts' 'src/app/(user)/assets/[subjectId]/asset-workbench-workflow-sync.test.mts'
```

Expected after implementation: all tests pass.

- [ ] **Step 9: Commit Canvas and asset returns**

```bash
git add 'web/src/app/(user)/canvas/components/canvas-top-bar.tsx' 'web/src/app/(user)/canvas/[id]/canvas-client-page.tsx' 'web/src/app/(user)/canvas/hooks/canvas-page-action-targets.ts' 'web/src/app/(user)/canvas/hooks/use-canvas-page-actions.test.mts' 'web/src/app/(user)/canvas/utils/canvas-navigation-entry.test.mts' 'web/src/app/(user)/assets/asset-navigation.ts' 'web/src/app/(user)/assets/asset-navigation.test.mts' 'web/src/app/(user)/assets/components/asset-subject-card.tsx' 'web/src/app/(user)/assets/page.tsx'
git commit -m "fix: keep workspace return paths unambiguous"
```

---

### Task 6: Record the user-facing acceptance surface

**Files:**
- Inspect: `docs/todo.md`
- Modify: `docs/pending-test.md`

- [ ] **Step 1: Check whether a todo item is fully completed**

Inspect the current top-level UI items. The line “下一阶段按已确认设计继续项目上下文树、生产总控注意力流和画布可折叠执行轨迹” remains open because this plan does not implement all three parts; leave `docs/todo.md` unchanged. Do not alter unrelated production, model, deployment, or Canvas todos.

- [ ] **Step 2: Add the exact pending-test section**

Add this section near the top of `docs/pending-test.md`:

```md
### 工作区入口与返回路径收口

- 全局左侧栏固定为“工作台 / 生产总控 / 画布 / 素材 / 资源库”，提示词与缓存进入资源库，分镜不再占全局一级入口。
- 左侧栏可在 164px 展开态和 52px 收起态间切换并记住选择；展开态底部操作横向排列，收起态隐藏版本文字。
- 项目详情移除“项目总控”，每个分集只保留“制作本集”；单集 Workflow 使用既有状态、动作与数据，不再嵌在 `/agent` 页面内。
- 生产总控任务可直达对应单集 Workflow，处理后返回生产总控；项目进入则返回项目。
- Canvas 顶部只保留一个来源返回按钮；素材主体详情返回进入前的筛选素材列表。
- 人工验收：展开和收起侧栏后跨页面刷新；分别从项目和生产总控进入同一分集；从项目画布和无归属画布检查返回文案；从带项目筛选的素材页打开主体并返回。确认 Workflow、画布操作、素材数据与生成逻辑没有变化。
```

- [ ] **Step 3: Inspect the final diff boundary**

```bash
git diff --name-only
```

Expected: only the files listed in this plan plus the user's pre-existing dirty Canvas files. Verify the implementation did not edit API, store, backend, generation, upscale, interpolation, or subtitle-erase files.

- [ ] **Step 4: Commit the acceptance notes**

Before committing, inspect `git diff -- docs/pending-test.md`. If it contains pre-existing changes outside the new section, do not stage the whole file; leave the documentation change uncommitted for the user to review. If the diff contains only the new section, run:

```bash
git add docs/pending-test.md
git commit -m "docs: record workspace navigation acceptance"
```

---

## Final verification checklist

Run only when the user explicitly requests verification:

```bash
cd web
node --experimental-strip-types --test \
  src/constant/navigation-tools.test.mts \
  src/components/layout/app-workspace-spine.test.mts \
  'src/app/(user)/resources/resources-page.test.mts' \
  'src/app/(user)/projects/[id]/project-production-entry.test.mts' \
  'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-delivery-check.test.mts' \
  'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-navigation.test.mts' \
  'src/app/(user)/agent/agent-workspace-model.test.mts' \
  'src/app/(user)/canvas/utils/canvas-navigation-entry.test.mts' \
  'src/app/(user)/canvas/hooks/use-canvas-page-actions.test.mts' \
  'src/app/(user)/assets/asset-navigation.test.mts' \
  'src/app/(user)/assets/[subjectId]/asset-workbench-workflow-sync.test.mts'
```

Expected: all focused tests pass. Do not run real generation, upscale, interpolation, subtitle erase, or any paid API call as part of navigation verification.

Manual acceptance order:

1. `/projects`: expand and collapse the sidebar; refresh and confirm persistence.
2. `/resources`: open prompts and cache; confirm the resource entry remains active.
3. `/projects/[id]`: confirm there is no project-control button and open “制作本集”.
4. `/agent`: open a concrete episode task; confirm Workflow opens on its canonical route and returns to production control.
5. `/canvas/[id]`: confirm only one parent return action is visible and the menu no longer duplicates it.
6. `/assets?projectId=...`: open a subject and return; confirm the project and filters remain intact.
