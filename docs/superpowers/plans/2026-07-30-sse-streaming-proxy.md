# SSE Streaming Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forward successful AI event streams to the browser immediately without buffering the complete raw stream, while retaining compact AI task audit data.

**Architecture:** Add a bounded incremental SSE collector in the service layer and a dedicated streaming branch in the HTTP proxy. The collector keeps only an incomplete event buffer and compact summary state; non-SSE and image-transform responses retain the current buffered path.

**Tech Stack:** Go `net/http`, `io`, existing AI task service and handler tests.

---

### Task 1: Incremental SSE archive collector

**Files:**
- Create: `service/ai_event_stream.go`
- Create: `service/ai_event_stream_test.go`
- Modify: `service/ai_task.go`
- Modify: `service/ai_task_test.go`

- [ ] Write a failing test that writes one SSE event split across multiple `Write` calls, then writes repeated deltas, a completion event with usage, and `[DONE]`. Assert `ArchiveJSON()` contains merged output, usage, counts, raw bytes and completion, but not every delta payload.
- [ ] Run `go test ./service -run TestAIEventStreamCollectorHandlesChunkBoundaries -count=1`; expect undefined collector failure.
- [ ] Implement `AIEventStreamCollector` with `pending []byte`, output builder, last/final event, usage, event counts, raw byte count and done flag. `Write` processes complete `\n\n` blocks and retains only the incomplete tail. `ArchiveJSON` processes the final tail and returns compact sanitized JSON.
- [ ] Make existing `summarizeAIEventStream` instantiate the collector, write the full test body, and return `ArchiveJSON`, removing duplicate parsing logic.
- [ ] Re-run collector and existing AI task compaction tests; expect PASS.
- [ ] Commit Task 1 files with `refactor: collect SSE audit data incrementally`.

### Task 2: Stream successful SSE responses

**Files:**
- Modify: `handler/ai.go`
- Modify: `handler/ai_test.go`

- [ ] Add a failing test with a blocking upstream body and an observing `http.ResponseWriter`: release the first SSE event, assert it is written and flushed before upstream EOF, then release completion and assert the success callback receives compact JSON rather than raw SSE.
- [ ] Add a failing interruption test asserting that after headers/body begin, a read error records stream failure but does not append the normal `{code,data,msg}` error envelope to the streamed body.
- [ ] Run `go test ./handler -run 'TestCopyAIResponseStreamsSSEBeforeEOF|TestCopyAIResponseDoesNotAppendJSONAfterStreamFailure' -count=1`; expect failures because the current implementation calls `io.ReadAll`.
- [ ] Extend the proxy callback boundary with `onResponseStart(status, contentType)` so task headers can be written before `WriteHeader`, while task success remains recorded only after clean EOF.
- [ ] In `copyAIResponseWithTransform`, detect SSE only when `transform == nil`; copy response headers except Content-Length, call start callback, write status, and `io.Copy` through a writer that flushes browser output and feeds `service.AIEventStreamCollector` without retaining the raw stream.
- [ ] On clean EOF, call success with `collector.ArchiveJSON()` and `application/json`. On stream error, log and invoke a bookkeeping-only failure callback; do not call `Fail` after headers are committed. Keep existing buffered behavior for non-SSE and transformed images.
- [ ] Re-run both new tests and existing AI handler tests; expect PASS.
- [ ] Commit Task 2 files with `perf: stream AI SSE responses without full buffering`.

### Task 3: Documentation and verification

**Files:**
- Modify: `docs/backend-database.md`
- Modify: `docs/pending-test.md`
- Modify: `CHANGELOG.md`

- [ ] Document that SSE is forwarded immediately and only compact summary state is held in memory / persisted.
- [ ] Add manual checks for first-token latency, final AI task usage, interruption behavior and non-SSE image regression.
- [ ] Run `go test ./service ./handler -run 'AIEventStream|AITask|AIResponse|AIProxy' -count=1` and `git diff --check`.
- [ ] Review the final diff for unrelated files and preserve all pre-existing workspace changes.
- [ ] Commit documentation with `docs: record streaming AI proxy behavior`.
