# 火山人像加白配置入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Volcengine face asset whitelisting settings to the existing front app configuration modal while saving them through server-side Admin Settings.

**Architecture:** `AppConfigModal` remains the single UI entry for front-side testing configuration. The modal reads the logged-in user from `useUserStore`, loads full Admin Settings for admins, edits only `private.volcengineAsset`, then saves the full merged settings and refreshes public settings.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Zustand, existing admin settings API.

---

### Task 1: Add Admin Settings Loading To Config Modal

**Files:**
- Modify: `web/src/components/layout/app-config-modal.tsx`

- [ ] **Step 1: Import dependencies**

Add `useEffect`, Ant Design `Switch`, admin settings API/types, and `useUserStore`.

- [ ] **Step 2: Add local state**

Track loaded admin settings, draft `volcengineAsset`, loading state, and saving state.

- [ ] **Step 3: Load settings on modal open**

When `isConfigOpen`, `token`, and admin role are present, call `fetchAdminSettings(token)`, then copy `private.volcengineAsset` into draft state.

### Task 2: Add Volcengine Asset UI Section

**Files:**
- Modify: `web/src/components/layout/app-config-modal.tsx`

- [ ] **Step 1: Render the section**

Place a “火山人像加白” bordered section inside the existing form, near other provider credentials.

- [ ] **Step 2: Add controls**

Add Switch and inputs for enabled, Access Key, Secret Key, ProjectName, Region, and Public Asset Base URL.

- [ ] **Step 3: Handle non-admin state**

If the current user is not an admin, show a short disabled-state message instead of sensitive fields.

### Task 3: Save Settings With Existing Complete Button

**Files:**
- Modify: `web/src/components/layout/app-config-modal.tsx`

- [ ] **Step 1: Make finish handler async**

Keep existing model validation behavior, but await Volcengine settings save before closing the modal.

- [ ] **Step 2: Submit merged Admin Settings**

If admin settings are loaded, merge `private.volcengineAsset` from draft state into the loaded settings and call `saveAdminSettings(token, nextSettings)`.

- [ ] **Step 3: Refresh public settings**

After saving Admin Settings, call `loadPublicSettings()` so `/assets` immediately sees the enabled state.

### Task 4: Update Test Notes And Verify

**Files:**
- Modify: `docs/pending-test.md`

- [ ] **Step 1: Add pending test note**

Document that the front “配置” modal now includes the Volcengine asset whitelisting settings.

- [ ] **Step 2: Run verification commands**

Run:

```bash
cd web && ./node_modules/.bin/tsc --noEmit --pretty false
cd web && npx prettier --check src/components/layout/app-config-modal.tsx
```

Expected: both commands pass. If the project lacks unrelated lint scripts, do not add new lint configuration.

