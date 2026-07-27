# Canvas Agent Temporary Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the existing canvas conversation select a published Agent, turn user text and selected-node context into an editable Temporary Plan, execute it through the existing Agent Plan / Invocation / Artifact Runtime, and explicitly write approved final Artifacts back to the conversation or canvas.

**Architecture:** Keep `CanvasAssistantPanel` as the conversation shell and ordinary-chat fallback. Add a canvas-specific Agent Plan model, lifecycle hook and compact message card; they call the existing Agent Registry and Agent Plan APIs and never call a model directly. Final approved Artifacts use the existing `client_local_receipt` adapter and a pure canvas output planner, so browser-local node writes remain explicit, traceable and idempotent.

**Tech Stack:** Next.js App Router, React, TypeScript, TanStack Query, Ant Design, localforage-backed canvas sessions, existing Go Agent Plan / Invocation APIs, Node test runner.

---

### Task 1: Pure Temporary Plan model

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-agent-plan-model.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-agent-plan-model.test.mts`

- [ ] **Step 1: Write the failing model tests**

Cover three public behaviors with real DTOs:

```ts
test("builds one source_text from the user goal and semantic selected-node context", () => {
    assert.equal(buildCanvasAgentSourceText("整理成生产稿", refs), "用户目标：整理成生产稿\n\n画布引用：\n[原始剧本]\n公交站剧本");
});

test("exposes only published Agents with a recommended package", () => {
    assert.deepEqual(canvasAgentCandidates(items).map((item) => item.agent.id), ["agent-ready"]);
});

test("builds a revision-safe Agent Plan request without sharing mutable Skill refs", () => {
    const request = buildCanvasAgentPlanRequest(input);
    input.skillRefs[0].parameters.temperature = 9;
    assert.notEqual(request.skillOverrides?.[0].parameters.temperature, 9);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-agent-plan-model.test.mts'
```

Expected: FAIL because `canvas-agent-plan-model.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure model**

Export:

```ts
export function buildCanvasAgentSourceText(goal: string, references: CanvasAssistantReference[]): string;
export function canvasAgentCandidates(items: AgentRegistryItem[]): AgentRegistryItem[];
export function cloneCanvasAgentSkillRefs(refs: AgentSkillRef[]): AgentSkillRef[];
export function buildCanvasAgentPlanRequest(input: CanvasAgentPlanRequestInput): AgentPlanCreateInput;
export function activeAgentPlanInvocationId(detail?: AgentPlanDetail): string;
export function finalAgentPlanOutputRefs(detail?: AgentPlanDetail): ArtifactRefInput[];
```

Only include non-empty semantic `reference.text`; never serialize image/video URLs or base64 into `source_text`. `finalAgentPlanOutputRefs` returns the last completed step's ordered refs.

- [ ] **Step 4: Run the model tests and verify GREEN**

Run the Step 2 command. Expected: all model tests PASS.

- [ ] **Step 5: Commit**

```bash
git add 'web/src/app/(user)/canvas/utils/canvas-agent-plan-model.ts' 'web/src/app/(user)/canvas/utils/canvas-agent-plan-model.test.mts'
git commit -m "feat: model canvas agent temporary plans"
```

### Task 2: Persist minimal Agent Plan coordinates in conversation messages

**Files:**
- Modify: `web/src/app/(user)/canvas/types.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-agent-plan-message.test.mts`

- [ ] **Step 1: Write the failing message-contract test**

Assert that `CanvasAssistantMessage` admits one `agentPlanRun` coordinate object containing `planId`, Agent IDs, source Artifact ref, source node IDs, editable Skill refs, preflight requirement codes and apply state, without an Artifact payload field.

- [ ] **Step 2: Run the contract test and verify RED**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-agent-plan-message.test.mts'
```

Expected: FAIL because `agentPlanRun` is absent.

- [ ] **Step 3: Add the message coordinate type**

```ts
export type CanvasAgentPlanRun = {
    planId: string;
    agentId: string;
    agentVersionId: string;
    agentName: string;
    sourceArtifactRef: ArtifactRefInput;
    sourceNodeIds: string[];
    skillRefs: AgentSkillRef[];
    confirmationRequirementCodes?: string[];
    appliedAt?: string;
};
```

Add `agentPlanRun?: CanvasAgentPlanRun` to `CanvasAssistantMessage`. Store only IDs, hashes and small plan coordinates; the source and output bodies remain in Artifact storage.

- [ ] **Step 4: Run the contract test and typecheck**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-agent-plan-message.test.mts'
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'web/src/app/(user)/canvas/types.ts' 'web/src/app/(user)/canvas/utils/canvas-agent-plan-message.test.mts'
git commit -m "feat: persist canvas agent plan coordinates"
```

### Task 3: Select a published Agent and create an editable draft from chat

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-composer.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx`
- Create: `web/src/app/(user)/canvas/components/canvas-agent-plan-wiring.test.mts`

- [ ] **Step 1: Write the failing wiring test**

Assert that the composer exposes a published-Agent selector with a `普通对话` option; the panel uses `fetchAgents`, `createArtifact`, `createAgentPlan`, `buildCanvasAgentSourceText`, and appends `agentPlanRun` to the assistant message. Also assert that no Agent selection falls through to existing ordinary chat and image mode remains unchanged.

- [ ] **Step 2: Run the wiring test and verify RED**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/components/canvas-agent-plan-wiring.test.mts'
```

Expected: FAIL because the Agent selector and creation path are missing.

- [ ] **Step 3: Implement the selector and draft creation path**

Use one query keyed by `['canvas-agent-options', projectId]`. Options are only `canvasAgentCandidates(fetchAgents(projectId))`. When an Agent is selected and ask-mode is submitted:

1. append the user's message with current references;
2. create one immutable `source_text` from goal + semantic reference text;
3. create an Agent Plan draft with the Agent's cloned default Skill refs;
4. append/update one assistant message with `agentPlanRun` and no copied Artifact payload;
5. on failure, leave the canvas untouched and show the error in that message.

Do not require browser-local AI configuration for this path; model availability is checked by the backend preflight/runtime.

- [ ] **Step 4: Run wiring test and typecheck**

Run the Step 2 command and `npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'web/src/app/(user)/canvas/components/canvas-assistant-composer.tsx' 'web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx' 'web/src/app/(user)/canvas/components/canvas-agent-plan-wiring.test.mts'
git commit -m "feat: create agent plans from canvas chat"
```

### Task 4: Compact lifecycle card with editable revision

**Files:**
- Create: `web/src/app/(user)/canvas/hooks/use-canvas-agent-plan.ts`
- Create: `web/src/app/(user)/canvas/components/canvas-agent-plan-card.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-messages.tsx`
- Create: `web/src/app/(user)/canvas/components/canvas-agent-plan-card.test.mts`

- [ ] **Step 1: Write failing lifecycle tests**

Test the state/action table and source wiring for:

- draft: replace/reorder/remove authorized Skill refs and save `createAgentPlanRevision`;
- awaiting confirmation: confirm only with the exact stored requirement codes and server fingerprint;
- running: `continueAgentPlan` / refresh, without browser-side model calls;
- needs review: fetch the active Invocation, review its exact Artifact-set hash, then continue;
- terminal failure/cancel: no confirm, review or apply action;
- completed: expose final ordered Artifact refs.

- [ ] **Step 2: Run the card tests and verify RED**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/components/canvas-agent-plan-card.test.mts'
```

Expected: FAIL because hook/card files are missing.

- [ ] **Step 3: Implement the lifecycle hook**

The hook owns TanStack queries/mutations for `fetchAgentPlan`, `createAgentPlanRevision`, `preflightAgentPlan`, `confirmAgentPlan`, `continueAgentPlan`, `cancelAgentPlan`, `getInvocation`, `reviewInvocation` and `getArtifact`. It updates the cached plan and calls `onRunPatch` whenever editable refs, requirement codes or apply coordinates change. Poll only while the current Invocation is queued/running; never keep a terminal plan on an interval.

- [ ] **Step 4: Implement the compact message card**

Render Agent name, Plan status, ordered frozen steps, exact Skill versions, estimated Credits, blocking/error text, Artifact previews, and only currently valid buttons. Before preflight, allow Skill replacement plus up/down/remove when Agent policy allows runtime override. Require explicit buttons for preflight, confirm, advance, approve, cancel and final use.

- [ ] **Step 5: Run tests and typecheck**

Run the Step 2 command and `npm run typecheck`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 'web/src/app/(user)/canvas/hooks/use-canvas-agent-plan.ts' 'web/src/app/(user)/canvas/components/canvas-agent-plan-card.tsx' 'web/src/app/(user)/canvas/components/canvas-assistant-messages.tsx' 'web/src/app/(user)/canvas/components/canvas-agent-plan-card.test.mts'
git commit -m "feat: run agent plans inside canvas chat"
```

### Task 5: Idempotent final Artifact insertion into the canvas

**Files:**
- Modify: `web/src/app/(user)/canvas/types.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-capability-actions.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-capability-output.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-capability-output.test.mts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-side-inspector.tsx`

- [ ] **Step 1: Write failing output-planner tests**

Add tests proving an Agent Plan result:

- creates one downstream text node per Artifact;
- connects to the first still-existing source node, or creates unconnected nodes after the current rightmost node when there is no source;
- stores `agentPlanId / sourceMessageId / sourceNodeIds / invocationId / artifactId / artifactHash / skillVersionId / appliedAt`;
- replays the same Agent Plan Invocation Artifact set without new nodes or connections.

- [ ] **Step 2: Run output tests and verify RED**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-capability-output.test.mts'
```

Expected: FAIL because Agent Plan output planning is absent.

- [ ] **Step 3: Implement Agent Artifact metadata and planner**

Add a separate `agentArtifact` metadata object; do not overload direct-node `capabilityArtifact`. Extend the existing canvas capability hook with `consumeAgentOutput(...)` so the page still owns state/ref synchronization and persistence.

- [ ] **Step 4: Wire explicit final use**

Pass `onConsumeAgentOutput` from `canvas-client-page.tsx` through `CanvasSideInspector` to `CanvasAssistantPanel` and the Plan card. The card fetches final Artifact envelopes, calls the canvas consumer, then calls `applyInvocation` on the last step's approved Invocation with:

```ts
{
  target: "client_local_receipt",
  targetId: message.id,
  payload: { surface: "canvas", targetKind: "message", targetId: message.id, artifactIds }
}
```

Use a stable idempotency key derived from Invocation ID and attempt. Only mark the message `appliedAt` after both local write and receipt succeed.

- [ ] **Step 5: Run tests and typecheck**

Run the Step 2 command and `npm run typecheck`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 'web/src/app/(user)/canvas/types.ts' 'web/src/app/(user)/canvas/hooks/use-canvas-capability-actions.ts' 'web/src/app/(user)/canvas/utils/canvas-capability-output.ts' 'web/src/app/(user)/canvas/utils/canvas-capability-output.test.mts' 'web/src/app/(user)/canvas/[id]/canvas-client-page.tsx' 'web/src/app/(user)/canvas/components/canvas-side-inspector.tsx'
git commit -m "feat: apply agent artifacts from canvas chat"
```

### Task 6: Retire the hardcoded production path and verify the whole surface

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-composer.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-messages.tsx`
- Delete after dependency search is clean: `web/src/app/(user)/canvas/utils/canvas-prompt-agent-skills.ts`
- Delete after dependency search is clean: `web/src/app/(user)/canvas/utils/canvas-prompt-agent-tools.ts`
- Update tests referencing the removed hardcoded Skill Pack path.
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md`
- Modify: `docs/api-response.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write a failing boundary test**

Assert that the composer has no hardcoded Prompt Agent Skill Pack selector, production requests use the Agent selector, ordinary chat and direct image generation remain available, and old historical message fields are display-only rather than executable.

- [ ] **Step 2: Run the boundary test and verify RED**

Expected: FAIL while the hardcoded pack remains active.

- [ ] **Step 3: Remove only the superseded execution path**

Remove active imports/calls to hardcoded `promptAgentSkillPacks` and local tool execution. Preserve ordinary chat, direct image generation, controlled canvas read/write suggestions and rendering of already persisted legacy messages until the final dependency search shows no active production path.

- [ ] **Step 4: Run automated gates**

```bash
go test ./...
cd web
npm test
npm run typecheck
npm run lint:fast
npm run build
git diff --check
```

Expected: all commands exit 0; lint may contain only existing warnings.

- [ ] **Step 5: Run fixed-script browser E2E**

Using a bounded deterministic OpenAI-compatible text executor:

1. open the canvas assistant and select a published multi-step Agent;
2. submit the fixed bus-stop script with its text node selected;
3. edit/reorder one draft step and save a new revision;
4. preflight and verify exact Agent / Skill versions, inputs, cost and confirmation requirements;
5. confirm, execute, inspect and approve every step;
6. verify final content retains 林秋、旧公交站、折起的车票 and “这次不等了”;
7. use final Artifacts, verify trace metadata and one receipt, then refresh;
8. verify plan/message/node/connection recovery and zero new console errors;
9. stop all test services and remove temporary settings/files.

- [ ] **Step 6: Update docs and commit**

Record the implemented boundary and actual evidence in the four documentation files. Commit with:

```bash
git add CHANGELOG.md docs/api-response.md docs/pending-test.md docs/todo.md web/src
git commit -m "feat: compose agents from canvas chat"
```

## Plan self-review

- Spec coverage: Agent selection, selected-node context, editable Temporary Plan, explicit confirmation, per-step Invocation review, final chat/canvas Artifact use, idempotency, refresh recovery and hardcoded-path retirement all map to Tasks 1-6.
- Placeholder scan: no unresolved placeholders remain; every task has exact files, RED/GREEN commands and concrete behavior.
- Type consistency: `CanvasAgentPlanRun`, `AgentSkillRef`, `ArtifactRefInput`, `AgentPlanDetail` and `client_local_receipt` names match existing public DTOs and runtime services.
- Scope: backend Agent Plan and Invocation semantics are already implemented and are reused unchanged; this plan is limited to the canvas conversation consumer and its local writeback boundary.
