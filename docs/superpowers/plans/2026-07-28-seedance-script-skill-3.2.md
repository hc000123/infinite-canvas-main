# Seedance Script Skill 3.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the user's Seedance 2.0 director-execution rewrite rules as the recommended script Skill `3.2.0`, with a quality gate that rejects formatting-only outputs.

**Architecture:** Preserve the immutable `3.1.0` package and add a script-only invocation overlay for `3.2.0`. Select the extra business validator from the frozen Skill quality-gate profile, then publish a new recommended system script Agent package that freezes the new Skill version.

**Tech Stack:** Go, embedded Skill packages, GORM/SQLite registry seeds, Go tests.

---

### Task 1: Lock the new seed behavior with tests

**Files:**
- Modify: `service/skill_seed_test.go`
- Modify: `service/agent_seed_test.go`
- Modify: `service/invocation_gate_registry_test.go`

- [ ] Add assertions that script `3.1.0` remains available while script `3.2.0` is published and recommended.
- [ ] Add an assertion that the recommended system script Agent freezes script Skill `3.2.0`.
- [ ] Add validator tests proving a formatting-only result fails and a structured director-execution result passes.
- [ ] Run `go test ./service -run 'TestEnsureSkillSeeds|TestEnsureAgentSeeds|TestSeedanceProductionScript'` and confirm the new assertions fail before implementation.

### Task 2: Add the Seedance 2.0 script Skill package

**Files:**
- Create: `service/skill_invocation_seed_overlays/script/SKILL.md`
- Create: `service/skill_invocation_seed_overlays/script/rules/domain-rules.md`
- Create: `service/skill_invocation_seed_overlays/script/templates/output-template.md`
- Create: `service/skill_invocation_seed_overlays/script/examples/good-output.json`
- Modify: `service/skill_seed.go`

- [ ] Store the user's rules in the Skill package using progressive disclosure without weakening any prohibition or output requirement.
- [ ] Build script `3.2.0` from the overlay while preserving script `3.1.0` from its current files.
- [ ] Recommend script `3.2.0`; keep all non-script invocation seed versions at `3.1.0`.
- [ ] Attach `seedance.production_script@1` to the new package quality-gate profile.

### Task 3: Enforce the frozen Skill-specific quality gate

**Files:**
- Modify: `service/invocation_gate_registry.go`

- [ ] Register `seedance.production_script@1`.
- [ ] When the frozen Skill profile contains the validator, require all output sections and enough incremental execution detail compared with the frozen `source_text`.
- [ ] Require short source-dialogue lines to remain present verbatim.
- [ ] Leave `core.production_script@1` unchanged for old and alternate Skill versions.

### Task 4: Point the system Agent and Workflow at the new default

**Files:**
- Modify: `service/agent_seed.go`
- Modify: `service/workflow_seed.go`
- Modify exact-version tests that describe the seed graph.

- [ ] Publish a new system script Agent version whose default ref is script Skill `3.2.0`; keep unrelated Agent versions unchanged.
- [ ] Publish the next standard Workflow version so its script Agent node resolves the new recommended Agent package.
- [ ] Preserve manual per-episode Skill version selection and runtime override behavior.

### Task 5: Verify and document the testable change

**Files:**
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md` only if an existing item changes state.

- [ ] Run the focused Go tests for seed publication, Agent binding, validator behavior and Workflow graph.
- [ ] Run `go test ./service ./handler` because the version IDs are shared by registry and invocation handlers.
- [ ] Record the new Skill version, quality behavior and manual test path in `docs/pending-test.md`.
- [ ] Confirm `docs/todo.md` needs no change unless a listed item is completed by this work.
