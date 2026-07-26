# Capability Consumer Runtime + Image Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the image workbench invoke any contract-compatible published Skill through the same Artifact / Invocation Runtime, approve its immutable output, write that output into the image prompt, and record a traceable local Apply receipt.

**Architecture:** Add a narrowly-scoped client Invocation surface for `image` and `canvas_chat` without weakening internal `workflow` / `agent_plan` delegation. Build one reusable capability runner that creates an immutable `source_text` when needed, combines it with approved project Artifacts, filters Skill versions by exact binding compatibility, runs the existing Preflight → Confirm → Worker → Review → Apply lifecycle, and returns approved Artifact envelopes to the consumer. The image page only supplies current text/project context and maps `asset_brief` or other text-bearing Artifact payloads into its prompt; it does not copy Skill content or create another execution engine.

**Tech Stack:** Go, Gin, GORM, Next.js App Router, React, TypeScript, Ant Design, TanStack Query, localforage, Node test runner.

---

## Locked file structure

Backend:

- `service/invocation_query.go`: public client-source admission only.
- `service/invocation_query_test.go`: source admission and source-preserving repreflight tests.
- `service/invocation_apply.go`: registered `client_local_receipt` adapter.
- `service/invocation_apply_test.go`: receipt validation and idempotency tests.
- `handler/invocation_test.go`: authenticated HTTP safety tests for image / canvas sources.

Shared frontend runtime:

- `web/src/services/api/invocations-contract.ts`: public source and Apply payload DTOs.
- `web/src/services/api/invocations-contract.test.mts`: exact request serialization tests.
- `web/src/components/capability-runtime/capability-run-model.ts`: pure compatibility, binding and output-to-text rules.
- `web/src/components/capability-runtime/capability-run-model.test.mts`: pure model tests.
- `web/src/components/capability-runtime/use-capability-run.ts`: lifecycle calls and polling; no page UI.
- `web/src/components/capability-runtime/capability-run-drawer.tsx`: shared selector, preflight, confirmation, review and Apply UI.

Image consumer:

- `web/src/app/(user)/image/image-capability-context.ts`: source context and Artifact-to-prompt mapping.
- `web/src/app/(user)/image/image-capability-context.test.mts`: deterministic prompt selection tests.
- `web/src/app/(user)/image/page.tsx`: opens the shared runner and records approved Invocation / Artifact coordinates in generated asset metadata.

## Task 1: Admit only user-facing Invocation sources

**Files:**

- Modify: `service/invocation_query.go`
- Modify: `service/invocation_query_test.go`
- Modify: `handler/invocation_test.go`

- [ ] **Step 1: Write the failing service test**

Add a table test proving `PreflightClientInvocation` accepts `direct`, `image`, and `canvas_chat`, rejects `workflow` and `agent_plan`, and `RepreflightClientInvocation` rejects changing an existing run from `image` to `canvas_chat`.

```go
func TestPreflightClientInvocationAdmitsOnlyUserSurfaces(t *testing.T) {
    for _, source := range []string{"direct", "image", "canvas_chat"} {
        if _, err := PreflightClientInvocation("user-1", InvocationRequest{Source: source, Capability: "missing.capability"}); err != nil {
            t.Fatalf("source=%s err=%v", source, err)
        }
    }
    for _, source := range []string{"workflow", "agent_plan"} {
        if _, err := PreflightClientInvocation("user-1", InvocationRequest{Source: source, Capability: "missing.capability"}); err == nil {
            t.Fatalf("source=%s should be rejected", source)
        }
    }
}
```

- [ ] **Step 2: Verify RED**

Run: `go test ./service -run 'TestPreflightClientInvocation' -count=1`

Expected: FAIL because `PreflightClientInvocation` does not exist.

- [ ] **Step 3: Implement the minimal admission boundary**

Replace the direct-only wrapper with `PreflightClientInvocation` / `RepreflightClientInvocation`. The allowed set is exactly `direct`, `image`, `canvas_chat`. Repreflight must load the existing user Invocation and require the normalized request source to equal `run.Source`; internal service calls continue using `PreflightInvocation` directly.

- [ ] **Step 4: Update handlers and HTTP tests**

Make POST `/api/v1/invocations` and repreflight call the new wrappers. Prove strict decoding, user isolation, and rejection of `workflow` / `agent_plan` remain unchanged.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
go test ./service ./handler -run 'Test(PreflightClientInvocation|InvocationHTTP|InvocationHandler)' -count=1
```

Expected: PASS.

Commit: `feat: expose capability runtime to client surfaces`

## Task 2: Register a safe local-consumer Apply receipt

**Files:**

- Modify: `service/invocation_apply.go`
- Modify: `service/invocation_apply_test.go`

- [ ] **Step 1: Write the failing adapter tests**

Create an approved Invocation fixture and prove `client_local_receipt` accepts only:

```json
{
  "surface": "image",
  "targetKind": "prompt",
  "targetId": "image-workbench",
  "artifactIds": ["artifact-1"]
}
```

Allowed surfaces are `image` and `canvas`; allowed target kinds are `prompt`, `node`, `message`, and `asset`. The adapter must require the payload target ID to equal the Apply `targetId`, require every payload Artifact ID to belong to the approved set, cap IDs at 100, and return a sanitized receipt. Same key/same request is idempotent; same key/different payload conflicts.

- [ ] **Step 2: Verify RED**

Run: `go test ./service -run 'TestApplyInvocationClientLocalReceipt' -count=1`

Expected: FAIL because the adapter is not registered.

- [ ] **Step 3: Implement the adapter**

Add `clientLocalReceiptAdapter` to `invocationApplyAdapters`. It writes no second business table; the canonical request and sanitized receipt remain in `invocation_apply_attempts`, which is already transactional and idempotent.

- [ ] **Step 4: Verify GREEN and commit**

Run: `go test ./service -run 'TestApplyInvocation(ClientLocalReceipt|IsIdempotent|Rejects)' -count=1`

Expected: PASS.

Commit: `feat: record client artifact apply receipts`

## Task 3: Extend the typed Invocation client

**Files:**

- Modify: `web/src/services/api/invocations-contract.ts`
- Modify: `web/src/services/api/invocations-contract.test.mts`

- [ ] **Step 1: Write the failing contract test**

Assert that `createInvocation` forwards `source: "image"` without rewriting it, and `applyInvocation` forwards a canonical `payload` object while zero-byte lifecycle calls remain zero-byte.

- [ ] **Step 2: Verify RED**

Run: `cd web && node --experimental-strip-types --test src/services/api/invocations-contract.test.mts`

Expected: TypeScript/test failure because the source union and Apply payload do not permit the new fields.

- [ ] **Step 3: Implement DTO changes**

Use:

```ts
export type ClientInvocationSource = "direct" | "image" | "canvas_chat";

export type InvocationRequest = {
    source: ClientInvocationSource;
    // existing fields unchanged
};

export type InvocationApplyInput = {
    idempotencyKey: string;
    attempt: number;
    artifactSetHash: string;
    target: string;
    targetId: string;
    payload?: Record<string, unknown>;
};
```

- [ ] **Step 4: Verify GREEN and commit**

Run the focused contract test. Expected: PASS.

Commit: `feat: type client capability invocations`

## Task 4: Build the pure capability-run model

**Files:**

- Create: `web/src/components/capability-runtime/capability-run-model.ts`
- Create: `web/src/components/capability-runtime/capability-run-model.test.mts`

- [ ] **Step 1: Write failing model tests**

Cover:

- a Skill is compatible only when every required binding can be filled by one approved Artifact of the exact type or by the pending `source_text`;
- optional bindings do not block selection;
- the same Artifact is not silently reused for two bindings unless the caller explicitly supplies both refs;
- selected refs use the Skill binding names, immutable Artifact ID and content hash;
- output text preference is `asset_brief.brief`, `production_script.productionScript`, the first `video_prompt_package.items[].prompt`, then formatted JSON;
- route rejection codes keep the stable raw code and add a Chinese label.

- [ ] **Step 2: Verify RED**

Run: `cd web && node --experimental-strip-types --test src/components/capability-runtime/capability-run-model.test.mts`

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement pure functions**

Export `capabilitySkillCompatibility`, `buildCapabilityInputRefs`, `preferredCapabilityOutputText`, and `capabilityRouteIssueLabel`. Keep the model free of React, localforage and API calls.

- [ ] **Step 4: Verify GREEN and commit**

Run the focused model test. Expected: PASS.

Commit: `feat: model reusable capability runs`

## Task 5: Build the shared capability runner

**Files:**

- Create: `web/src/components/capability-runtime/use-capability-run.ts`
- Create: `web/src/components/capability-runtime/capability-run-drawer.tsx`
- Test: `web/src/components/capability-runtime/capability-run-model.test.mts`

- [ ] **Step 1: Add failing lifecycle transition tests**

Extend the pure model with a small `capabilityRunActions(status)` projection. Prove:

- draft can create Artifact and preflight;
- awaiting confirmation can confirm only against the current local fingerprint;
- queued/running can refresh or cancel;
- needs review can approve or reject;
- approved can Apply exactly once;
- failed/rejected/cancelled expose retry where the Invocation contract permits it.

- [ ] **Step 2: Verify RED**

Run the focused model test. Expected: FAIL on the absent transition projection.

- [ ] **Step 3: Implement the hook**

The hook must:

1. fetch visible Skill options and approved project Artifacts;
2. create a `source_text` Artifact only when the selected Skill needs it;
3. call `createInvocation` with an explicit Skill Version ID and consumer source;
4. preserve the preflight fingerprint and block confirmation if local inputs changed;
5. poll `getInvocation` only while queued/running/cancel_requested;
6. review the exact current Artifact-set hash;
7. call the consumer callback with approved output envelopes;
8. after the callback succeeds, call `applyInvocation` with `client_local_receipt`.

No automatic review or Apply is allowed.

- [ ] **Step 4: Implement the drawer**

Use the existing canvas theme tokens and compact studio panel styling. Show Skill name/version, input/output contract, missing bindings, candidate/rejection explanation, frozen model/credits/hash, lifecycle status, output preview and explicit buttons for preflight, confirm, refresh, review, retry, cancel and Apply.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
cd web
node --experimental-strip-types --test src/components/capability-runtime/capability-run-model.test.mts
npm run typecheck
```

Expected: PASS.

Commit: `feat: add shared capability run drawer`

## Task 6: Connect the image workbench

**Files:**

- Create: `web/src/app/(user)/image/image-capability-context.ts`
- Create: `web/src/app/(user)/image/image-capability-context.test.mts`
- Modify: `web/src/app/(user)/image/page.tsx`

- [ ] **Step 1: Write failing image mapping tests**

Prove the image consumer:

- prefers an `asset_brief` whose `assetId` matches the URL source context;
- otherwise uses the first `asset_brief` in stable order;
- accepts `production_script` and `video_prompt_package` through the shared text projection;
- never replaces the prompt from an unapproved or empty Artifact set;
- produces trace metadata containing `invocationId`, `artifactIds`, `skillVersionId`, and `appliedAt` without embedding Artifact payloads.

- [ ] **Step 2: Verify RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/image/image-capability-context.test.mts'`

Expected: FAIL because the mapping module is absent.

- [ ] **Step 3: Implement the mapping module**

Export `selectImagePromptArtifact`, `imagePromptFromArtifacts`, and `buildImageCapabilityTrace`. Keep URL parsing in the existing page helper and do not move unrelated generation code.

- [ ] **Step 4: Add the page entry**

Add one compact `Skill 能力` button beside `提示词库`. The drawer receives `source="image"`, project/episode IDs, current prompt as source text, and the current asset ID. After approval, show the generated prompt as a preview; only `使用此产物` replaces the editor text and records Apply. Saved generation logs and saved asset metadata include the compact trace IDs.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/image/image-capability-context.test.mts'
npm run typecheck
npm run build
```

Expected: PASS and `/image` builds.

Commit: `feat: invoke published skills from image workbench`

## Task 7: Deterministic E2E, browser acceptance and docs

**Files:**

- Modify: `handler/invocation_e2e_test.go`
- Modify: `docs/api-response.md`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add fixed-text E2E**

Use a published source-text → asset-brief fixture Skill with a deterministic executor. Through the authenticated HTTP surface, create an image-source Invocation, confirm, finish, approve, and Apply to `client_local_receipt`. Assert exact source, Skill version/hash, parent Artifact, output payload, review hash, Apply target/receipt, replay idempotency and second-user isolation.

- [ ] **Step 2: Run full deterministic verification**

```bash
go test ./... -count=1
cd web && npm test
cd web && npm run typecheck
cd web && npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 3: Browser acceptance**

On `/image`, open `Skill 能力`, verify incompatible Skills show missing inputs, run the deterministic compatible fixture or a configured real text Skill, inspect frozen version/cost, approve the output, explicitly use it, refresh, and confirm the prompt plus Invocation / Artifact coordinates restore without another run. Cancel one run and verify no prompt write or Apply receipt occurs.

- [ ] **Step 4: Update docs and commit**

Document client sources, `client_local_receipt`, the image capability selector, current model-channel limitation and remaining canvas / chat work. Move only this Phase 6 slice to pending test.

Commit: `test: verify image capability consumer`

## Self-review

- Spec coverage: this plan covers the approved Phase 6 requirement that the image page uses the shared Skill Registry and Invocation / Artifact Runtime, freezes exact versions, requires confirmation/review, and writes only by Artifact reference with an Apply receipt.
- Boundary check: direct image generation remains the existing image model path; this slice prepares its prompt through a selected Skill and does not introduce image execution into the text-only Skill executor.
- Scope check: canvas node invocation, canvas Agent Temporary Plan, and removal of hardcoded prompt-agent packs are intentionally separate follow-up plans because they touch independent interaction and persistence boundaries.
- Placeholder scan: no deferred code placeholders or undefined route names remain.
- Type consistency: `image` and `canvas_chat` match the backend source constants; `client_local_receipt` matches the registered adapter; output mapping uses existing core Artifact schemas.
