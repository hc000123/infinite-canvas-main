# Model Channel Provider Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add idempotent provider bundle presets so an administrator enters each provider credential once and the app creates or updates all required channels and public model mappings.

**Architecture:** Put provider definitions and settings transformations in a pure TypeScript module, render a page-private Ant Design preset modal, and keep persistence in the existing admin settings page. Extend backend secret preservation only for masked preset channels that share one unambiguous protocol/Base URL credential source.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Node test runner, Go, Gin service settings.

---

## File Map

- Create `web/src/app/(admin)/admin/settings/model-channel-presets.ts`: preset catalog, credential validation, idempotent channel upsert, public model reconciliation and preview summary.
- Create `web/src/app/(admin)/admin/settings/model-channel-presets.test.mts`: pure preset engine regression tests.
- Create `web/src/app/(admin)/admin/settings/components/provider-preset-modal.tsx`: provider cards, provider-specific fields and change preview.
- Modify `web/src/app/(admin)/admin/settings/page.tsx`: open modal, apply preset result through `saveAdminSettings`, refresh form state.
- Modify `service/settings.go`: safely inherit a saved masked API Key when a preset splits one provider into multiple stable channels.
- Modify `service/settings_test.go`: secret-inheritance regression tests.
- Modify `docs/system-settings.md`: administrator usage documentation.
- Modify `docs/pending-test.md`: current-version acceptance steps.

## Task 1: Safe Provider Credential Inheritance

**Files:**
- Modify: `service/settings_test.go`
- Modify: `service/settings.go`

- [ ] **Step 1: Write the failing backend test**

Add a test that saves one legacy `comfly` channel with a real Key, then saves masked `comfly-text`, `comfly-image`, and `comfly-video` channels using the same protocol and Base URL. Assert all three persisted channels retain the original Key. Add a second test with two different saved Keys on the same protocol/Base URL and assert a new masked channel does not inherit an ambiguous credential.

```go
func TestKeepPrivateAPIKeysSharesOneUnambiguousProviderCredential(t *testing.T) {
    input := model.Settings{Private: model.PrivateSetting{Channels: []model.ModelChannel{
        {ID: "comfly-text", Protocol: "openai", BaseURL: "https://ai.comfly.org", APIKey: maskedAPIKey},
        {ID: "comfly-image", Protocol: "openai", BaseURL: "https://ai.comfly.org", APIKey: maskedAPIKey},
    }}}
    saved := model.Settings{Private: model.PrivateSetting{Channels: []model.ModelChannel{
        {ID: "comfly", Protocol: "openai", BaseURL: "https://ai.comfly.org", APIKey: "provider-key"},
    }}}
    keepPrivateAPIKeys(&input, saved)
    if input.Private.Channels[0].APIKey != "provider-key" || input.Private.Channels[1].APIKey != "provider-key" {
        t.Fatalf("channels did not inherit one provider credential")
    }
}
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
go test ./service -run 'TestKeepPrivateAPIKeysSharesOneUnambiguousProviderCredential|TestKeepPrivateAPIKeysRejectsAmbiguousProviderCredentials' -count=1
```

Expected: the inheritance test fails because `findSavedChannel` cannot match new preset IDs.

- [ ] **Step 3: Implement the minimal safe fallback**

Add a helper that compares normalized protocol and trimmed Base URL, collects non-empty saved Keys, and returns a Key only when every matching channel uses the same value. Call it after the existing exact/name/index preservation path fails.

```go
func providerAPIKey(channel model.ModelChannel, saved []model.ModelChannel) string {
    key := ""
    for _, item := range saved {
        if normalizeModelProtocol(item.Protocol) != normalizeModelProtocol(channel.Protocol) || strings.TrimRight(strings.TrimSpace(item.BaseURL), "/") != strings.TrimRight(strings.TrimSpace(channel.BaseURL), "/") {
            continue
        }
        candidate := strings.TrimSpace(item.APIKey)
        if candidate == "" {
            continue
        }
        if key != "" && key != candidate {
            return ""
        }
        key = candidate
    }
    return key
}
```

- [ ] **Step 4: Run focused and full service tests**

Run:

```bash
go test ./service -run 'KeepPrivateAPIKeys' -count=1
go test ./service -count=1
```

Expected: both commands pass.

## Task 2: Pure Provider Preset Engine

**Files:**
- Create: `web/src/app/(admin)/admin/settings/model-channel-presets.test.mts`
- Create: `web/src/app/(admin)/admin/settings/model-channel-presets.ts`

- [ ] **Step 1: Write failing preset tests**

Cover these observable behaviors with `node:test` and `node:assert/strict`:

```ts
test("applies all Xinglian models idempotently", () => {
    const first = applyModelChannelPreset(emptySettings(), "xinglian", { apiKey: "key" });
    const second = applyModelChannelPreset(first.settings, "xinglian", { apiKey: "" });
    assert.equal(second.settings.private.channels.filter((item) => item.id === "xinglian-cloud").length, 1);
    assert.deepEqual(second.settings.private.channels.find((item) => item.id === "xinglian-cloud")?.models, XINGLIAN_MODELS);
});

test("splits Comfly models by capability", () => {
    const result = applyModelChannelPreset(settingsWithLegacyComfly(), "comfly", { apiKey: "" });
    assert.deepEqual(result.settings.private.channels.find((item) => item.id === "comfly-text")?.capabilities, ["text"]);
    assert.deepEqual(result.settings.private.channels.find((item) => item.id === "comfly-image")?.capabilities, ["image"]);
    assert.deepEqual(result.settings.private.channels.find((item) => item.id === "comfly-video")?.capabilities, ["video", "video_query"]);
    assert.equal(result.settings.private.channels.find((item) => item.id === "comfly")?.enabled, false);
});
```

Also test Ark EP preservation, Jimeng advanced-setting preservation, secret replacement, public model reconciliation, default-model preservation, cost preservation, required-input errors and generic OpenAI channel creation.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-channel-presets.test.mts'
```

Expected: FAIL because the preset module does not exist.

- [ ] **Step 3: Implement catalog and transformation types**

Export:

```ts
export type ModelChannelPresetId = "volcengine" | "xinglian" | "jimeng" | "comfly" | "openai-compatible";
export type ModelChannelPresetInput = {
    apiKey?: string;
    endpointId?: string;
    name?: string;
    baseUrl?: string;
    capability?: "text" | "image" | "video";
    models?: string[];
};
export type ModelChannelPresetResult = {
    settings: AdminSettings;
    summary: { added: string[]; updated: string[]; disabled: string[]; publishedModels: string[] };
};
export const MODEL_CHANNEL_PRESETS: readonly ModelChannelPresetDefinition[];
export const XINGLIAN_MODELS: readonly string[];
export function applyModelChannelPreset(settings: AdminSettings, presetId: ModelChannelPresetId, input: ModelChannelPresetInput): ModelChannelPresetResult;
```

Use stable channel IDs, clone settings before mutation, preserve existing advanced Jimeng fields, preserve masked/blank Key values, and reconcile `availableModels` from enabled channel models without modifying defaults or `modelCosts`.

- [ ] **Step 4: Run preset tests and verify GREEN**

Run the focused command from Step 2. Expected: all preset tests pass.

## Task 3: Provider Preset Modal

**Files:**
- Create: `web/src/app/(admin)/admin/settings/components/provider-preset-modal.tsx`

- [ ] **Step 1: Implement the page-private modal against the tested engine**

The component receives current settings and returns a tested preset result; it does not persist data itself.

```ts
type ProviderPresetModalProps = {
    open: boolean;
    settings: AdminSettings;
    saving: boolean;
    onCancel: () => void;
    onApply: (result: ModelChannelPresetResult) => Promise<void>;
};
```

Use Ant Design `Modal`, `Card`, `Form`, `Input.Password`, `Select`, `Alert`, `Tag` and `Flex`. Provider selection shows only required fields. Disable submission when required fields are missing. Show added/updated/disabled channel names and published-model count before applying.

- [ ] **Step 2: Run TypeScript validation**

Run:

```bash
cd web && npm run typecheck
```

Expected: no TypeScript errors in the new component.

## Task 4: Settings Page Integration

**Files:**
- Modify: `web/src/app/(admin)/admin/settings/page.tsx`

- [ ] **Step 1: Add modal state and save callback**

Add `isProviderPresetOpen` and `isApplyingProviderPreset`. Build current settings with the existing `normalizeSettings(form.getFieldsValue(true))`. On apply, call `saveAdminSettings(token, result.settings)`, merge masked secrets with `mergePrivateSecrets`, refresh form/channel/model-cost/JSON state, close on success, and retain the modal on failure.

- [ ] **Step 2: Add the entry point without changing existing channel editing**

Place an “一键配置厂商” primary button beside the existing “新增渠道” action. Render `ProviderPresetModal` near the current channel drawer. Existing add/edit/test/delete buttons remain unchanged.

- [ ] **Step 3: Run focused frontend tests and typecheck**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-channel-presets.test.mts'
cd web && npm run typecheck
```

Expected: preset tests and TypeScript pass.

## Task 5: Documentation and Acceptance Record

**Files:**
- Modify: `docs/system-settings.md`
- Modify: `docs/pending-test.md`
- Confirm: `docs/todo.md`

- [ ] **Step 1: Document preset usage and safety rules**

Add the five presets, required inputs, idempotent update semantics, secret preservation, model publication behavior and the rule that presets never guess model costs or change defaults.

- [ ] **Step 2: Add current-version acceptance steps**

Record page checks for Xinglian one-Key setup, Ark Key+EP setup, Jimeng setup+web authorization, Comfly three-channel split, repeated application and public-secret absence. Confirm no roadmap item changed, so `docs/todo.md` requires no edit.

## Task 6: Full Verification and Docker Deployment

**Files:**
- Verify all files above.

- [ ] **Step 1: Run complete automated checks**

```bash
cd web && npm test
cd web && npm run typecheck
go test ./... -count=1
git diff --check
```

Expected: every command exits zero.

- [ ] **Step 2: Build and restart Docker**

```bash
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:3000/api/health
```

Expected: container is healthy and health body is `ok`.

- [ ] **Step 3: Verify runtime preset results and secret boundary**

Use the admin page to apply a preset with an already saved credential, confirm no duplicate channel is created, and inspect `/api/settings` to ensure only model, channel ID, channel name and protocol are public. Do not submit another paid generation task during this feature verification.

## Commit Policy for This Workspace

The shared worktree already contains current-release changes. Do not create task-level commits that would accidentally include unrelated hunks from modified files. Keep edits scoped, verify with `git diff --check`, and stage or commit only when the user starts the release commit flow.
