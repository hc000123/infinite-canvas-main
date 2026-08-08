# Local Image Upscale Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure macOS Apple Silicon helper that lets Chrome-based canvas pages run local Real-ESRGAN 2×/4× upscaling, create a derived image node, and archive the result to Assets.

**Architecture:** A standalone Go helper listens only on `127.0.0.1:47821`, pairs exact browser origins, downloads and verifies a pinned Real-ESRGAN model package, and runs a single native ARM64/universal `realesrgan-ncnn-vulkan` worker queue. The Next.js canvas talks to the versioned localhost protocol directly, persists only the origin-bound token and job coordinates, stores returned image Blobs through the existing `image-storage` service, and reuses the existing canvas-to-asset archive path.

**Tech Stack:** Go 1.25 standard library HTTP/crypto/archive packages, Real-ESRGAN ncnn Vulkan v0.2.0/v0.2.5.0 release artifacts, Next.js 16, React 19, TypeScript, Ant Design 6, Tailwind 4, localforage, existing canvas hooks/stores.

---

## Execution constraints

- Implement in a dedicated `codex/local-image-upscale` worktree based on the current committed `HEAD`; do not carry the unrelated dirty working-tree files into it.
- The repository `AGENTS.md` says checks are not run by default. Every verification command below is exact and should be run only after the user chooses an execution option that explicitly includes the plan's test steps.
- Never invoke a real paid image/video generation command. Local Real-ESRGAN inference is non-paid and only runs in the final manual acceptance task.
- Commit only the files listed by the current task. Do not stage unrelated user changes.

## File map

### Local helper

- Create `cmd/upscale-assistant/main.go`: resolve macOS paths, construct services, run HTTP server, handle shutdown.
- Create `localupscale/types.go`: protocol DTOs, stable status/error constants, request validation.
- Create `localupscale/pairing.go`: one-time codes, hashed grants, exact-Origin authorization, persistence.
- Create `localupscale/models.go`: manifest parsing, resumable archive download, SHA-256 verification, extraction.
- Create `localupscale/engine.go`: inference interface and `realesrgan-ncnn-vulkan` command adapter.
- Create `localupscale/jobs.go`: idempotent single-worker queue, snapshots, cancellation, restart recovery, result acknowledgement.
- Create `localupscale/server.go`: localhost API, Host/Origin/CORS/PNA enforcement, multipart limits and fetch-stream SSE.
- Create `localupscale/status_page.go`: minimal local status/pairing/grant page.
- Create matching `localupscale/*_test.go` files plus `cmd/upscale-assistant/main_test.go`.
- Create `packaging/upscale-assistant/sources.json`: pinned upstream artifact coordinates.
- Create `packaging/upscale-assistant/Info.plist`: macOS helper bundle metadata.
- Create `packaging/upscale-assistant/THIRD_PARTY_LICENSES.md`: Real-ESRGAN/ncnn/MoltenVK notices.
- Create `web/scripts/build-upscale-assistant.mjs`: download pinned engine, verify ARM64 slice, generate model manifest, build `.app` and optional `.dmg`.
- Modify `web/package.json`: helper prepare/package scripts.

### Web and canvas

- Create `web/src/services/local-upscale/types.ts`: protocol types shared by the client.
- Create `web/src/services/local-upscale/storage.ts`: user-scoped token persistence.
- Create `web/src/services/local-upscale/client.ts`: health/pair/model/job/result/ack calls and SSE parser.
- Create `web/src/services/local-upscale/*.test.mts`: deterministic client/storage tests.
- Modify `web/src/app/(user)/canvas/types.ts`: `CanvasLocalUpscaleMetadata` and `metadata.localUpscale`.
- Create `web/src/app/(user)/canvas/utils/canvas-local-upscale.ts`: pure derived-node/status/result helpers.
- Create `web/src/app/(user)/canvas/utils/canvas-local-upscale.test.mts`.
- Create `web/src/app/(user)/canvas/hooks/use-canvas-local-upscale-actions.ts`: source Blob, submit/resume/cancel/result/archive orchestration.
- Create `web/src/app/(user)/canvas/hooks/canvas-local-upscale-runner.ts`: dependency-injected async runner for deterministic tests.
- Create `web/src/app/(user)/canvas/hooks/canvas-local-upscale-runner.test.mts`.
- Create `web/src/app/(user)/canvas/components/canvas-local-upscale-modal.tsx`: connection, pairing, model, scale and progress UI.
- Create `web/src/app/(user)/canvas/components/canvas-local-upscale-modal.test.mts`.
- Modify canvas toolbar/controller/overlay/page files only to wire the new action and Modal.
- Modify `web/next.config.ts`: expose configurable helper/download URLs; do not add a new restrictive CSP.

### Documentation

- Modify `docs/todo.md`: add Safari, Windows, extra models and batch upscale follow-ups without replacing concurrent user edits.
- Modify `docs/pending-test.md`: append the actual local-helper acceptance surface.
- Modify `CHANGELOG.md`: add one concise Unreleased summary only if the current Unreleased section exists.

### Task 1: Create the isolated implementation worktree

**Files:** None.

- [ ] **Step 1: Confirm the current design commit and target worktree do not already conflict**

Run:

```bash
git rev-parse --short HEAD
git worktree list
git branch --list 'codex/local-image-upscale'
```

Expected: `HEAD` includes design commit `559fa76`; no existing worktree or branch named `codex/local-image-upscale`.

- [ ] **Step 2: Create the dedicated worktree from committed HEAD**

Run:

```bash
git worktree add .worktrees/local-image-upscale -b codex/local-image-upscale HEAD
```

Expected: Git reports a new worktree on `codex/local-image-upscale`.

- [ ] **Step 3: Confirm the implementation worktree is clean**

Run:

```bash
git -C .worktrees/local-image-upscale status --short
```

Expected: no output.

### Task 2: Define the local protocol and validation rules

**Files:**
- Create: `localupscale/types.go`
- Test: `localupscale/types_test.go`

- [ ] **Step 1: Write failing validation tests**

```go
package localupscale

import "testing"

func TestValidateCreateJob(t *testing.T) {
	valid := CreateJobInput{ClientTaskID: "image-node-1", ModelID: ModelRealESRGANX4Plus, Scale: 2, InputWidth: 1024, InputHeight: 768}
	if err := ValidateCreateJob(valid); err != nil { t.Fatalf("valid request: %v", err) }
	for _, input := range []CreateJobInput{
		{ClientTaskID: "", ModelID: ModelRealESRGANX4Plus, Scale: 2, InputWidth: 10, InputHeight: 10},
		{ClientTaskID: "x", ModelID: ModelRealESRGANX4Plus, Scale: 3, InputWidth: 10, InputHeight: 10},
		{ClientTaskID: "x", ModelID: ModelRealESRGANX4Plus, Scale: 4, InputWidth: 10000, InputHeight: 10000},
	} {
		if ValidateCreateJob(input) == nil { t.Fatalf("expected rejection: %#v", input) }
	}
}
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `go test ./localupscale -run TestValidateCreateJob -count=1`

Expected: FAIL because `CreateJobInput` and `ValidateCreateJob` do not exist.

- [ ] **Step 3: Add exact protocol constants, DTOs and validation**

```go
package localupscale

import (
	"errors"
	"fmt"
)

const (
	ProtocolVersion = "1"
	DefaultAddress = "127.0.0.1:47821"
	ModelRealESRGANX4Plus = "realesrgan-x4plus"
	MaxRequestBytes int64 = 64 << 20
	MaxInputPixels int64 = 40_000_000
	MaxOutputPixels int64 = 160_000_000
)

type JobStatus string

const (
	JobQueued JobStatus = "queued"
	JobPreparing JobStatus = "preparing"
	JobDownloadingModel JobStatus = "downloading_model"
	JobProcessing JobStatus = "processing"
	JobSaving JobStatus = "saving"
	JobSucceeded JobStatus = "succeeded"
	JobFailed JobStatus = "failed"
	JobCancelled JobStatus = "cancelled"
)

type CreateJobInput struct {
	ClientTaskID string `json:"clientTaskId"`
	ModelID string `json:"modelId"`
	Scale int `json:"scale"`
	InputWidth int `json:"inputWidth"`
	InputHeight int `json:"inputHeight"`
}

type JobSnapshot struct {
	ID string `json:"id"`
	ClientTaskID string `json:"clientTaskId"`
	Status JobStatus `json:"status"`
	Progress *float64 `json:"progress,omitempty"`
	QueuePosition int `json:"queuePosition,omitempty"`
	ModelID string `json:"modelId"`
	ModelVersion string `json:"modelVersion,omitempty"`
	Scale int `json:"scale"`
	InputWidth int `json:"inputWidth"`
	InputHeight int `json:"inputHeight"`
	OutputWidth int `json:"outputWidth,omitempty"`
	OutputHeight int `json:"outputHeight,omitempty"`
	Engine string `json:"engine"`
	EngineVersion string `json:"engineVersion,omitempty"`
	StartedAt string `json:"startedAt"`
	CompletedAt string `json:"completedAt,omitempty"`
	DurationMS int64 `json:"durationMs,omitempty"`
	ErrorCode string `json:"errorCode,omitempty"`
	ErrorMessage string `json:"errorMessage,omitempty"`
}

type APIError struct { Code string `json:"code"`; Message string `json:"message"` }

func ValidateCreateJob(input CreateJobInput) error {
	if input.ClientTaskID == "" { return errors.New("缺少客户端任务 ID") }
	if input.ModelID != ModelRealESRGANX4Plus { return fmt.Errorf("不支持的模型：%s", input.ModelID) }
	if input.Scale != 2 && input.Scale != 4 { return errors.New("倍率只能为 2× 或 4×") }
	if input.InputWidth <= 0 || input.InputHeight <= 0 { return errors.New("图片尺寸无效") }
	inputPixels := int64(input.InputWidth) * int64(input.InputHeight)
	outputPixels := inputPixels * int64(input.Scale*input.Scale)
	if inputPixels > MaxInputPixels || outputPixels > MaxOutputPixels { return errors.New("图片尺寸超过本地超分限制") }
	return nil
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `go test ./localupscale -run TestValidateCreateJob -count=1`

Expected: PASS.

- [ ] **Step 5: Commit the protocol foundation**

```bash
git add localupscale/types.go localupscale/types_test.go
git commit -m "feat: define local upscale protocol"
```

### Task 3: Implement origin-bound pairing and authorization

**Files:**
- Create: `localupscale/pairing.go`
- Test: `localupscale/pairing_test.go`

- [ ] **Step 1: Write failing pairing lifecycle tests**

```go
package localupscale

import (
	"path/filepath"
	"testing"
	"time"
)

func TestPairingCodeIsSingleUseAndGrantIsOriginBound(t *testing.T) {
	now := time.Date(2026, 8, 8, 12, 0, 0, 0, time.UTC)
	store, err := NewPairingStore(filepath.Join(t.TempDir(), "grants.json"), func() time.Time { return now })
	if err != nil { t.Fatal(err) }
	code, err := store.IssueCode()
	if err != nil { t.Fatal(err) }
	token, err := store.Pair(code, "https://canvas.example.com")
	if err != nil { t.Fatal(err) }
	if _, err := store.Pair(code, "https://canvas.example.com"); err == nil { t.Fatal("code reused") }
	if !store.Authorize(token, "https://canvas.example.com") { t.Fatal("valid origin rejected") }
	if store.Authorize(token, "https://evil.example.com") { t.Fatal("cross-origin token accepted") }
}
```

- [ ] **Step 2: Run the pairing test and verify it fails**

Run: `go test ./localupscale -run TestPairingCodeIsSingleUseAndGrantIsOriginBound -count=1`

Expected: FAIL because `PairingStore` does not exist.

- [ ] **Step 3: Implement codes, hashed grants, persistence and revoke**

Implement `PairingStore` with this public surface:

```go
type PairingStore struct {
	mu sync.Mutex
	path string
	now func() time.Time
	codes map[string]pairingCode
	grants map[string]Grant
}

type Grant struct {
	ID string `json:"id"`
	Origin string `json:"origin"`
	TokenHash string `json:"tokenHash"`
	CreatedAt string `json:"createdAt"`
}

func NewPairingStore(path string, now func() time.Time) (*PairingStore, error)
func (s *PairingStore) IssueCode() (string, error)
func (s *PairingStore) Pair(code, origin string) (string, error)
func (s *PairingStore) Authorize(token, origin string) bool
func (s *PairingStore) Revoke(token, origin string) error
func (s *PairingStore) Grants() []Grant
```

Use `crypto/rand` for a six-digit code and 32-byte token, expire codes after five minutes, reject a code after five failed attempts, persist only `sha256(token)` with file mode `0600`, and compare hashes with `subtle.ConstantTimeCompare`.

- [ ] **Step 4: Add expiry, failure-limit, persistence and revoke tests**

Add table tests that advance the injected clock by six minutes, submit five wrong codes, reload `NewPairingStore` from disk, and verify `Revoke` invalidates the exact Origin/token pair.

- [ ] **Step 5: Run all pairing tests**

Run: `go test ./localupscale -run Pair -count=1`

Expected: PASS.

- [ ] **Step 6: Commit pairing**

```bash
git add localupscale/pairing.go localupscale/pairing_test.go
git commit -m "feat: secure local upscale pairing"
```

### Task 4: Implement verified on-demand model installation

**Files:**
- Create: `localupscale/models.go`
- Test: `localupscale/models_test.go`
- Test support: `localupscale/test_helpers_test.go`

- [ ] **Step 1: Write a failing model download test using an in-memory zip server**

```go
func TestModelManagerDownloadsVerifiesAndExtracts(t *testing.T) {
	archive := testModelArchive(t, map[string][]byte{
		"bundle/models/realesrgan-x4plus.param": []byte("param"),
		"bundle/models/realesrgan-x4plus.bin": []byte("weights"),
	})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write(archive) }))
	defer server.Close()
	manager := NewModelManager(t.TempDir(), ModelManifest{ID: ModelRealESRGANX4Plus, Version: "v0.2.5.0", URL: server.URL, SHA256: sha256Hex(archive)})
	if err := manager.Ensure(context.Background(), nil); err != nil { t.Fatal(err) }
	if status := manager.Status(); !status.Installed || status.Progress != 1 { t.Fatalf("unexpected status: %#v", status) }
}
```

Create the referenced helpers in `test_helpers_test.go`:

```go
package localupscale

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func testModelArchive(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for name, content := range files {
		file, err := writer.Create(name)
		if err != nil { t.Fatal(err) }
		if _, err := file.Write(content); err != nil { t.Fatal(err) }
	}
	if err := writer.Close(); err != nil { t.Fatal(err) }
	return buffer.Bytes()
}

func testPNG(t *testing.T) []byte {
	t.Helper()
	var buffer bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.White)
	if err := png.Encode(&buffer, img); err != nil { t.Fatal(err) }
	return buffer.Bytes()
}
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `go test ./localupscale -run TestModelManagerDownloadsVerifiesAndExtracts -count=1`

Expected: FAIL because `ModelManager` does not exist.

- [ ] **Step 3: Implement the model manager**

Add:

```go
type ModelManifest struct {
	ID string `json:"id"`
	Version string `json:"version"`
	URL string `json:"url"`
	SHA256 string `json:"sha256"`
	ArchiveBytes int64 `json:"archiveBytes"`
}

type ModelStatus struct {
	ID string `json:"id"`
	Version string `json:"version"`
	Installed bool `json:"installed"`
	Downloading bool `json:"downloading"`
	Progress float64 `json:"progress"`
	BytesDownloaded int64 `json:"bytesDownloaded"`
	BytesTotal int64 `json:"bytesTotal"`
	ErrorCode string `json:"errorCode,omitempty"`
}

func NewModelManager(root string, manifest ModelManifest) *ModelManager
func (m *ModelManager) Ensure(ctx context.Context, onProgress func(ModelStatus)) error
func (m *ModelManager) Status() ModelStatus
func (m *ModelManager) ModelDir() string
```

Download to `<root>/<version>.zip.part`, send `Range` when a partial file exists, restart if the server does not return `206`, hash the complete archive, and extract only files whose base names are `realesrgan-x4plus.param` and `realesrgan-x4plus.bin`. Write into a temporary directory and rename it to `<root>/<version>` only after both files exist. Guard `Ensure` with one shared in-flight download so a button-triggered download and a job-triggered download subscribe to the same progress instead of writing the archive concurrently.

- [ ] **Step 4: Add checksum, resume, cancellation and zip-slip rejection tests**

Use `httptest.Server` to assert the `Range` header, cancel the context during a streamed response, return a wrong manifest hash, include `../escape.bin` in a test archive, and call `Ensure` concurrently twice. Each error case must leave `Installed=false` and must not write outside the model root; the concurrent case must make one HTTP download and notify both callers.

- [ ] **Step 5: Run model manager tests**

Run: `go test ./localupscale -run Model -count=1`

Expected: PASS.

- [ ] **Step 6: Commit model installation**

```bash
git add localupscale/models.go localupscale/models_test.go localupscale/test_helpers_test.go
git commit -m "feat: download verified upscale models"
```

### Task 5: Implement the native engine adapter and persistent single-worker queue

**Files:**
- Create: `localupscale/engine.go`
- Create: `localupscale/jobs.go`
- Test: `localupscale/engine_test.go`
- Test: `localupscale/jobs_test.go`

- [ ] **Step 1: Write failing command argument and queue idempotency tests**

```go
func TestCommandEngineArguments(t *testing.T) {
	engine := CommandEngine{Binary: "/app/realesrgan-ncnn-vulkan", ModelDir: "/models"}
	got := engine.arguments("/tmp/input.png", "/tmp/output.png", 4)
	want := []string{"-i", "/tmp/input.png", "-o", "/tmp/output.png", "-n", ModelRealESRGANX4Plus, "-s", "4", "-t", "0", "-m", "/models", "-f", "png"}
	if !reflect.DeepEqual(got, want) { t.Fatalf("got %#v want %#v", got, want) }
}

func TestJobManagerIsIdempotentPerOriginAndClientTask(t *testing.T) {
	manager := newTestJobManager(t, &blockingEngine{started: make(chan struct{}, 1)})
	first, _ := manager.Submit(context.Background(), "https://canvas.example.com", CreateJobInput{ClientTaskID: "node-1", ModelID: ModelRealESRGANX4Plus, Scale: 2, InputWidth: 32, InputHeight: 32}, bytes.NewReader(testPNG(t)))
	second, _ := manager.Submit(context.Background(), "https://canvas.example.com", CreateJobInput{ClientTaskID: "node-1", ModelID: ModelRealESRGANX4Plus, Scale: 2, InputWidth: 32, InputHeight: 32}, bytes.NewReader(testPNG(t)))
	if first.ID != second.ID { t.Fatalf("duplicate jobs: %s %s", first.ID, second.ID) }
}
```

Define the referenced queue helpers in `jobs_test.go`:

```go
type blockingEngine struct { started chan struct{} }

func (e *blockingEngine) Upscale(ctx context.Context, _, _ string, _ int, _ func(string)) (EngineResult, error) {
	select { case e.started <- struct{}{}: default: }
	<-ctx.Done()
	return EngineResult{}, ctx.Err()
}

func newTestJobManager(t *testing.T, engine Engine) *JobManager {
	t.Helper()
	root := t.TempDir()
	models := NewModelManager(filepath.Join(root, "models"), ModelManifest{ID: ModelRealESRGANX4Plus, Version: "test"})
	if err := os.MkdirAll(models.ModelDir(), 0o700); err != nil { t.Fatal(err) }
	for _, name := range []string{"realesrgan-x4plus.param", "realesrgan-x4plus.bin"} {
		if err := os.WriteFile(filepath.Join(models.ModelDir(), name), []byte("test"), 0o600); err != nil { t.Fatal(err) }
	}
	manager, err := NewJobManager(filepath.Join(root, "jobs"), models, engine, time.Now)
	if err != nil { t.Fatal(err) }
	t.Cleanup(func() { _ = manager.Close() })
	return manager
}
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `go test ./localupscale -run 'Test(CommandEngineArguments|JobManagerIsIdempotent)' -count=1`

Expected: FAIL because engine and manager types do not exist.

- [ ] **Step 3: Implement the engine contract and command adapter**

```go
type EngineResult struct { Width int; Height int; Version string }

type Engine interface {
	Upscale(ctx context.Context, inputPath, outputPath string, scale int, onProgress func(string)) (EngineResult, error)
}

type CommandEngine struct { Binary string; ModelDir string; Version string }

func (e CommandEngine) Upscale(ctx context.Context, inputPath, outputPath string, scale int, onProgress func(string)) (EngineResult, error) {
	cmd := exec.CommandContext(ctx, e.Binary, e.arguments(inputPath, outputPath, scale)...)
	stderr, err := cmd.StderrPipe()
	if err != nil { return EngineResult{}, err }
	if err := cmd.Start(); err != nil { return EngineResult{}, err }
	scanner := bufio.NewScanner(stderr)
	for scanner.Scan() { if onProgress != nil { onProgress(scanner.Text()) } }
	if err := cmd.Wait(); err != nil { return EngineResult{}, fmt.Errorf("本地超分引擎失败：%w", err) }
	width, height, err := readImageSize(outputPath)
	return EngineResult{Width: width, Height: height, Version: e.Version}, err
}
```

The private `arguments` method must return the exact tested argument list; `readImageSize` uses `image.DecodeConfig` from the Go standard library.

- [ ] **Step 4: Implement the queue and snapshot persistence**

Expose:

```go
func NewJobManager(root string, models *ModelManager, engine Engine, now func() time.Time) (*JobManager, error)
func (m *JobManager) Submit(ctx context.Context, origin string, input CreateJobInput, image io.Reader) (JobSnapshot, error)
func (m *JobManager) Snapshot(origin, jobID string) (JobSnapshot, error)
func (m *JobManager) Subscribe(origin, jobID string) (<-chan JobSnapshot, func(), error)
func (m *JobManager) Cancel(origin, jobID string) error
func (m *JobManager) Result(origin, jobID string) (io.ReadCloser, error)
func (m *JobManager) AcknowledgeResult(origin, jobID string) error
func (m *JobManager) Close() error
```

Use one worker goroutine and FIFO channel. Key idempotency by `origin + "\n" + clientTaskId`. Use the submit context only while receiving and persisting the upload; once queued, give the job its own cancellable background context so returning the HTTP response does not cancel inference. Persist every transition to `<jobs>/<jobID>/snapshot.json` with a temporary file plus rename. Decode the saved source with Go image decoders for PNG/JPEG and `golang.org/x/image/webp`, compare its real dimensions with the submitted dimensions, and validate limits from the decoded values. While `ModelManager.Ensure` runs, publish `downloading_model` snapshots with the manager's numeric download progress. On startup, mark non-terminal snapshots `failed` with `assistant_restarted`. Delete input after terminal state, retain successful output until acknowledgement or 24-hour cleanup.

- [ ] **Step 5: Add queue order, cancel, restart, subscriber and result-retention tests**

Use a fake Engine controlled by channels. Assert only one call runs at once, queued order is stable, cancellation terminates the running context, restart maps unfinished jobs to `assistant_restarted`, a slow subscriber cannot block the worker, `Result` is repeatable, and `AcknowledgeResult` removes the output.

- [ ] **Step 6: Run engine and queue tests**

Run: `go test ./localupscale -run 'Engine|Job' -count=1`

Expected: PASS.

- [ ] **Step 7: Commit the engine and queue**

```bash
git add localupscale/engine.go localupscale/engine_test.go localupscale/jobs.go localupscale/jobs_test.go
git commit -m "feat: run queued local upscale jobs"
```

### Task 6: Expose the secure localhost API and status page

**Files:**
- Create: `localupscale/server.go`
- Create: `localupscale/status_page.go`
- Test: `localupscale/server_test.go`

- [ ] **Step 1: Write failing Host, Origin, pairing and idempotency API tests**

Create an `httptest.Server` around `NewHandler` and assert:

```go
func TestAPIRejectsUntrustedHostAndOrigin(t *testing.T) {
	handler := newTestHandler(t)
	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:47821/v1/health", nil)
	request.Host = "evil.example.com"
	request.Header.Set("Origin", "https://canvas.example.com")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden { t.Fatalf("status=%d", response.Code) }
}
```

Build the referenced handler with the shared fake services:

```go
func newTestHandler(t *testing.T) http.Handler {
	t.Helper()
	root := t.TempDir()
	pairing, err := NewPairingStore(filepath.Join(root, "grants.json"), time.Now)
	if err != nil { t.Fatal(err) }
	jobs := newTestJobManager(t, &blockingEngine{started: make(chan struct{}, 1)})
	return NewHandler(ServerOptions{Version: "test", Address: DefaultAddress, Pairing: pairing, Models: jobs.models, Jobs: jobs})
}
```

Store the model manager on `JobManager` as an unexported `models *ModelManager` field so the queue and handler use the same concrete instance.

Also cover valid pairing, Bearer authorization, PNA preflight, multipart size rejection, duplicate `clientTaskId`, SSE content type, result retrieval and result acknowledgement.

- [ ] **Step 2: Run server tests and verify they fail**

Run: `go test ./localupscale -run API -count=1`

Expected: FAIL because `NewHandler` does not exist.

- [ ] **Step 3: Implement the route table and security middleware**

```go
type ServerOptions struct {
	Version string
	Address string
	Pairing *PairingStore
	Models *ModelManager
	Jobs *JobManager
}

func NewHandler(options ServerOptions) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/health", options.handleHealth)
	mux.HandleFunc("POST /v1/pair", options.handlePair)
	mux.HandleFunc("DELETE /v1/pairing", options.authorized(options.handleRevoke))
	mux.HandleFunc("GET /v1/models", options.authorized(options.handleModels))
	mux.HandleFunc("POST /v1/models/{modelId}/download", options.authorized(options.handleModelDownload))
	mux.HandleFunc("POST /v1/jobs", options.authorized(options.handleCreateJob))
	mux.HandleFunc("GET /v1/jobs/{jobId}", options.authorized(options.handleJob))
	mux.HandleFunc("GET /v1/jobs/{jobId}/events", options.authorized(options.handleEvents))
	mux.HandleFunc("DELETE /v1/jobs/{jobId}", options.authorized(options.handleCancel))
	mux.HandleFunc("GET /v1/jobs/{jobId}/result", options.authorized(options.handleResult))
	mux.HandleFunc("POST /v1/jobs/{jobId}/result/ack", options.authorized(options.handleResultAck))
	mux.HandleFunc("POST /local/code", options.handleIssueLocalCode)
	mux.HandleFunc("POST /local/grants/{grantId}/revoke", options.handleLocalRevoke)
	mux.HandleFunc("GET /", options.handleStatusPage)
	return options.secure(mux)
}
```

The `secure` wrapper accepts only Host `127.0.0.1:47821` or `localhost:47821`, rejects missing/`null`/non-HTTP Origin on `/v1`, echoes only the exact request Origin, and returns `Access-Control-Allow-Private-Network: true` only when the preflight requests it. Local status-page POST routes require an Origin equal to `http://127.0.0.1:47821` or `http://localhost:47821`; they issue a fresh pairing code and revoke a selected grant. Escape all dynamic text with `html/template`.

- [ ] **Step 4: Implement fetch-stream SSE without URL tokens**

Write each event as:

```go
fmt.Fprintf(w, "event: snapshot\ndata: %s\n\n", encodedSnapshot)
flusher.Flush()
```

Send the current snapshot immediately, unsubscribe on request cancellation, and finish the stream after a terminal snapshot. Never accept a token query parameter.

- [ ] **Step 5: Run server tests**

Run: `go test ./localupscale -run 'API|SSE|CORS|Host|Origin' -count=1`

Expected: PASS.

- [ ] **Step 6: Commit the local API**

```bash
git add localupscale/server.go localupscale/server_test.go localupscale/status_page.go
git commit -m "feat: expose secure local upscale api"
```

### Task 7: Add the macOS helper command and packaging pipeline

**Files:**
- Create: `cmd/upscale-assistant/main.go`
- Test: `cmd/upscale-assistant/main_test.go`
- Create: `packaging/upscale-assistant/sources.json`
- Create: `packaging/upscale-assistant/Info.plist`
- Create: `packaging/upscale-assistant/THIRD_PARTY_LICENSES.md`
- Create: `web/scripts/build-upscale-assistant.mjs`
- Modify: `web/package.json`

- [ ] **Step 1: Write failing path-resolution tests**

```go
func TestResolvePathsUsesMacApplicationSupport(t *testing.T) {
	paths := resolvePaths("/Users/test", "/Applications/眨眼之间超分助手.app/Contents/Resources")
	if paths.ConfigDir != "/Users/test/Library/Application Support/眨眼之间超分助手/config" { t.Fatal(paths.ConfigDir) }
	if paths.EnginePath != "/Applications/眨眼之间超分助手.app/Contents/Resources/bin/realesrgan-ncnn-vulkan" { t.Fatal(paths.EnginePath) }
}
```

- [ ] **Step 2: Run the command test and verify it fails**

Run: `go test ./cmd/upscale-assistant -run TestResolvePathsUsesMacApplicationSupport -count=1`

Expected: FAIL because `resolvePaths` does not exist.

- [ ] **Step 3: Implement command startup and graceful shutdown**

`main.go` must parse `--address`, `--resource-dir`, and `--open-status`; default address is `localupscale.DefaultAddress`. Construct `PairingStore`, load the packaged model manifest, construct `ModelManager`, `CommandEngine`, and `JobManager`, listen with `net.Listen("tcp4", address)`, print the exact status URL, optionally run `/usr/bin/open http://127.0.0.1:47821/`, and call `http.Server.Shutdown` plus `JobManager.Close` on SIGINT/SIGTERM. If the fixed port is occupied, format one Chinese diagnostic and invoke `/usr/bin/osascript` with an argument-array script that displays the message before exiting; add a unit test for the pure diagnostic formatter.

- [ ] **Step 4: Pin upstream artifacts**

Create `sources.json` with immutable coordinates:

```json
{
  "engine": {
    "version": "v0.2.0",
    "url": "https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases/download/v0.2.0/realesrgan-ncnn-vulkan-v0.2.0-macos.zip",
    "assetId": 63486055
  },
  "modelArchive": {
    "id": "realesrgan-x4plus",
    "version": "v0.2.5.0",
    "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-macos.zip",
    "archiveBytes": 51817124
  }
}
```

- [ ] **Step 5: Implement the packaging script**

The Node script must:

1. Download both pinned archives to a `mkdtemp` directory.
2. Compute SHA-256 with `createHash("sha256")`.
3. Extract the engine and run `lipo -verify_arch arm64 <binary>`; fail if no ARM64 slice exists.
4. Inspect the model archive and fail unless both `realesrgan-x4plus.param` and `.bin` exist.
5. Generate `Contents/Resources/model-manifest.json` using the computed model archive SHA-256.
6. Run `CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -o Contents/MacOS/upscale-assistant ./cmd/upscale-assistant`.
7. Copy engine, Info.plist and third-party notices into `web/build/upscale-assistant/眨眼之间超分助手.app`.
8. With `--dmg`, create `web/release/眨眼之间超分助手-<VERSION>-arm64.dmg` via `hdiutil`.

Use `execFileSync`, `fs.mkdtemp`, `fs.rm` and argument arrays; do not construct shell commands with interpolated paths.

- [ ] **Step 6: Add package scripts**

```json
"upscale-assistant:prepare:mac": "node scripts/build-upscale-assistant.mjs",
"upscale-assistant:dist:mac": "node scripts/build-upscale-assistant.mjs --dmg"
```

- [ ] **Step 7: Run command tests and prepare the app bundle**

Run:

```bash
go test ./cmd/upscale-assistant -count=1
cd web && npm run upscale-assistant:prepare:mac
file build/upscale-assistant/眨眼之间超分助手.app/Contents/MacOS/upscale-assistant
lipo -info build/upscale-assistant/眨眼之间超分助手.app/Contents/Resources/bin/realesrgan-ncnn-vulkan
```

Expected: Go tests PASS; helper binary is `Mach-O 64-bit executable arm64`; engine output includes `arm64`.

- [ ] **Step 8: Commit command and packaging**

```bash
git add cmd/upscale-assistant packaging/upscale-assistant web/scripts/build-upscale-assistant.mjs web/package.json
git commit -m "feat: package mac upscale assistant"
```

### Task 8: Build the browser client and token storage

**Files:**
- Create: `web/src/services/local-upscale/types.ts`
- Create: `web/src/services/local-upscale/storage.ts`
- Create: `web/src/services/local-upscale/client.ts`
- Test: `web/src/services/local-upscale/client.test.mts`

- [ ] **Step 1: Write failing client tests with injected fetch**

```ts
test("never places the pairing token in the SSE URL", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createLocalUpscaleClient({
    baseUrl: "http://127.0.0.1:47821",
    getToken: async () => "secret-token",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response('event: snapshot\ndata: {"id":"job-1","status":"succeeded"}\n\n');
    },
  });
  await Array.fromAsync(client.events("job-1"));
  assert.equal(calls[0].url, "http://127.0.0.1:47821/v1/jobs/job-1/events");
  assert.equal(new Headers(calls[0].init?.headers).get("Authorization"), "Bearer secret-token");
});
```

Also test health without a token, pair/save token, multipart job submission, stable error mapping, result Blob and acknowledgement.

- [ ] **Step 2: Run the client test and verify it fails**

Run: `cd web && node --experimental-strip-types --test src/services/local-upscale/client.test.mts`

Expected: FAIL because the local-upscale client does not exist.

- [ ] **Step 3: Define matching TypeScript DTOs**

```ts
export type LocalUpscaleJobStatus = "queued" | "preparing" | "downloading_model" | "processing" | "saving" | "succeeded" | "failed" | "cancelled";
export type LocalUpscaleScale = 2 | 4;
export type LocalUpscaleHealth = { protocolVersion: string; assistantVersion: string; platform: string; engine: string; engineVersion?: string };
export type LocalUpscaleModel = { id: "realesrgan-x4plus"; version: string; installed: boolean; downloading: boolean; progress: number; bytesDownloaded: number; bytesTotal: number; errorCode?: string };
export type LocalUpscaleJob = {
  id: string;
  clientTaskId: string;
  status: LocalUpscaleJobStatus;
  progress?: number;
  queuePosition?: number;
  modelId: "realesrgan-x4plus";
  modelVersion?: string;
  scale: LocalUpscaleScale;
  inputWidth: number;
  inputHeight: number;
  outputWidth?: number;
  outputHeight?: number;
  engine: string;
  engineVersion?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
};
```

- [ ] **Step 4: Implement user-scoped token storage**

Use `createUserScopedLocalForage("local_upscale")` with key `pairing:<origin>` and export `getLocalUpscaleToken`, `setLocalUpscaleToken`, and `removeLocalUpscaleToken`. Never fall back to `localStorage`.

- [ ] **Step 5: Implement the client and fetch-stream SSE parser**

Expose `health`, `pair`, `revoke`, `models`, `downloadModel`, `createJob`, `job`, `events`, `cancel`, `result`, and `ackResult`. The `events` async generator must parse chunks separated by blank lines, decode only `event: snapshot`, and abort when the provided `AbortSignal` fires.

- [ ] **Step 6: Run the client tests**

Run: `cd web && node --experimental-strip-types --test src/services/local-upscale/client.test.mts`

Expected: PASS.

- [ ] **Step 7: Commit the browser client**

```bash
git add web/src/services/local-upscale
git commit -m "feat: add local upscale browser client"
```

### Task 9: Add pure canvas derived-node transformations

**Files:**
- Modify: `web/src/app/(user)/canvas/types.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-local-upscale.ts`
- Test: `web/src/app/(user)/canvas/utils/canvas-local-upscale.test.mts`

- [ ] **Step 1: Write failing derived-node tests**

```ts
test("creates a loading child without changing the source", () => {
  const source = imageNode("source", { naturalWidth: 1024, naturalHeight: 768, sourceAssetId: "asset-1" });
  const result = buildLocalUpscaleStart({ source, childId: "child", connectionId: "edge", scale: 2, startedAt: "2026-08-08T00:00:00.000Z" });
  assert.equal(result.child.metadata?.localUpscale?.sourceNodeId, "source");
  assert.equal(result.child.metadata?.localUpscale?.sourceAssetId, "asset-1");
  assert.deepEqual([result.child.metadata?.localUpscale?.inputWidth, result.child.metadata?.localUpscale?.inputHeight], [1024, 768]);
  assert.deepEqual(result.connection, { id: "edge", fromNodeId: "source", toNodeId: "child" });
  assert.deepEqual(source.position, { x: 10, y: 20 });
});

function imageNode(id: string, metadata: CanvasNodeData["metadata"]): CanvasNodeData {
  return { id, type: CanvasNodeType.Image, title: "源图", position: { x: 10, y: 20 }, width: 320, height: 240, metadata: { content: "blob:source", status: "success", ...metadata } };
}
```

Add tests for 4× predicted size, progress update, terminal error, successful image metadata, and fixed aspect ratio display size.

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-local-upscale.test.mts'`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Add `CanvasLocalUpscaleMetadata` to canvas types**

```ts
export type CanvasLocalUpscaleMetadata = {
  sourceNodeId: string;
  sourceAssetId?: string;
  clientTaskId: string;
  jobId?: string;
  status: "queued" | "preparing" | "downloading_model" | "processing" | "saving" | "succeeded" | "failed" | "cancelled";
  progress?: number;
  modelId: "realesrgan-x4plus";
  modelVersion?: string;
  engine: string;
  engineVersion?: string;
  assistantVersion?: string;
  scale: 2 | 4;
  inputWidth: number;
  inputHeight: number;
  outputWidth?: number;
  outputHeight?: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  errorCode?: string;
};
```

Add `localUpscale?: CanvasLocalUpscaleMetadata` to `CanvasNodeMetadata`.

- [ ] **Step 4: Implement pure transformations**

Export:

```ts
export function buildLocalUpscaleStart(input: { source: CanvasNodeData; childId: string; connectionId: string; scale: 2 | 4; startedAt: string }): { child: CanvasNodeData; connection: CanvasConnection }
export function applyLocalUpscaleJob(node: CanvasNodeData, job: LocalUpscaleJob): CanvasNodeData
export function completeLocalUpscaleNode(node: CanvasNodeData, image: UploadedImage, job: LocalUpscaleJob): CanvasNodeData
export function failLocalUpscaleNode(node: CanvasNodeData, code: string, message: string): CanvasNodeData
export function resumableLocalUpscaleNodes(nodes: CanvasNodeData[]): CanvasNodeData[]
```

Place the child at `source.position.x + source.width + 96`, use title `本地超分 2×` or `本地超分 4×`, preserve `prompt`, set `sourceType: "manual"`, and put the full local snapshot under both `metadata.localUpscale` and `canvasSource.generationParams.localUpscale` on completion.

- [ ] **Step 5: Run pure canvas tests**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-local-upscale.test.mts'`

Expected: PASS.

- [ ] **Step 6: Commit canvas transformations**

```bash
git add 'web/src/app/(user)/canvas/types.ts' 'web/src/app/(user)/canvas/utils/canvas-local-upscale.ts' 'web/src/app/(user)/canvas/utils/canvas-local-upscale.test.mts'
git commit -m "feat: model local upscale canvas nodes"
```

### Task 10: Implement the dependency-injected canvas task runner

**Files:**
- Create: `web/src/app/(user)/canvas/hooks/canvas-local-upscale-runner.ts`
- Test: `web/src/app/(user)/canvas/hooks/canvas-local-upscale-runner.test.mts`

- [ ] **Step 1: Write failing success and archive-failure tests**

```ts
test("persists and archives a successful local result before acknowledging it", async () => {
  const order: string[] = [];
  const final = await runLocalUpscaleResult({
    node: loadingNode(),
    job: succeededJob(),
    result: async () => new Blob(["png"], { type: "image/png" }),
    uploadImage: async () => { order.push("upload"); return uploadedImage(); },
    archive: async () => { order.push("archive"); return "asset-result"; },
    acknowledge: async () => { order.push("ack"); },
  });
  assert.deepEqual(order, ["upload", "archive", "ack"]);
  assert.equal(final.node.metadata?.sourceAssetId, "asset-result");
});

function loadingNode(): CanvasNodeData {
  return buildLocalUpscaleStart({ source: { id: "source", type: CanvasNodeType.Image, title: "源图", position: { x: 0, y: 0 }, width: 320, height: 240, metadata: { content: "blob:source", naturalWidth: 32, naturalHeight: 24 } }, childId: "child", connectionId: "edge", scale: 2, startedAt: "2026-08-08T00:00:00.000Z" }).child;
}

function succeededJob(): LocalUpscaleJob {
  return { id: "job-1", clientTaskId: "child", status: "succeeded", modelId: "realesrgan-x4plus", modelVersion: "v0.2.5.0", scale: 2, inputWidth: 32, inputHeight: 24, outputWidth: 64, outputHeight: 48, engine: "realesrgan-ncnn-vulkan", startedAt: "2026-08-08T00:00:00.000Z", completedAt: "2026-08-08T00:00:01.000Z", durationMs: 1000 };
}

function uploadedImage(): UploadedImage {
  return { url: "blob:result", storageKey: "image:result", width: 64, height: 48, bytes: 3, mimeType: "image/png" };
}
```

The archive-failure test must assert the returned node remains `status="success"`, `acknowledge` still runs after local persistence, and the result includes a separate archive warning.

- [ ] **Step 2: Run runner tests and verify they fail**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/hooks/canvas-local-upscale-runner.test.mts'`

Expected: FAIL because `runLocalUpscaleResult` does not exist.

- [ ] **Step 3: Implement submit, event and result runner functions**

Export three small functions:

```ts
export async function resolveCanvasImageBlob(node: CanvasNodeData, getImageBlob: (key: string) => Promise<Blob | null>, fetcher: typeof fetch): Promise<Blob>
export async function submitLocalUpscaleTask(input: SubmitLocalUpscaleInput, deps: SubmitLocalUpscaleDependencies): Promise<LocalUpscaleJob>
export async function runLocalUpscaleResult(input: RunLocalUpscaleResultInput): Promise<{ node: CanvasNodeData; archiveWarning?: string }>
```

Define the inputs in the same file:

```ts
export type SubmitLocalUpscaleInput = { node: CanvasNodeData; childId: string; scale: 2 | 4; image: Blob };
export type SubmitLocalUpscaleDependencies = { createJob: (input: { clientTaskId: string; modelId: "realesrgan-x4plus"; scale: 2 | 4; inputWidth: number; inputHeight: number; image: Blob }) => Promise<LocalUpscaleJob> };
export type RunLocalUpscaleResultInput = {
  node: CanvasNodeData;
  job: LocalUpscaleJob;
  result: () => Promise<Blob>;
  uploadImage: (blob: Blob) => Promise<UploadedImage>;
  archive: (node: CanvasNodeData) => Promise<string | false>;
  acknowledge: () => Promise<void>;
};
```

`resolveCanvasImageBlob` prefers `storageKey`, falls back to `fetch(content)`, and throws `无法读取源图片` for a missing/non-OK source. `runLocalUpscaleResult` must persist the Blob before acknowledgement and must not rerun inference when archive alone fails.

- [ ] **Step 4: Add source-read, token-expired, result-retry and cancellation tests**

Inject all I/O. Verify local Blob preference, remote fetch failure, `401` mapping to re-pair, repeated result retrieval after upload failure, and cancellation leaving a `cancelled` node.

- [ ] **Step 5: Run task runner tests**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/hooks/canvas-local-upscale-runner.test.mts'`

Expected: PASS.

- [ ] **Step 6: Commit the runner**

```bash
git add 'web/src/app/(user)/canvas/hooks/canvas-local-upscale-runner.ts' 'web/src/app/(user)/canvas/hooks/canvas-local-upscale-runner.test.mts'
git commit -m "feat: orchestrate local upscale results"
```

### Task 11: Build the connection, pairing and progress Modal

**Files:**
- Create: `web/src/app/(user)/canvas/components/canvas-local-upscale-modal.tsx`
- Test: `web/src/app/(user)/canvas/components/canvas-local-upscale-modal.test.mts`

- [ ] **Step 1: Write a failing source-level UI contract test**

Use the repository's existing source-contract test style to read the component and assert it contains `本地超分`, `连接本地助手`, `输入配对码`, `下载模型`, `2×`, `4×`, `预计输出`, `取消任务`, and CSS/theme tokens rather than hard-coded slate/stone colors.

- [ ] **Step 2: Run the UI contract test and verify it fails**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/components/canvas-local-upscale-modal.test.mts'`

Expected: FAIL because the Modal does not exist.

- [ ] **Step 3: Implement the controlled Modal**

Use this boundary:

```ts
type CanvasLocalUpscaleModalProps = {
  node: CanvasNodeData | null;
  open: boolean;
  connection: "checking" | "offline" | "unpaired" | "connected" | "incompatible";
  model: LocalUpscaleModel | null;
  job?: LocalUpscaleJob;
  scale: 2 | 4;
  downloadUrl: string;
  onScaleChange: (scale: 2 | 4) => void;
  onDetect: () => void;
  onPair: (code: string) => Promise<void>;
  onDownloadModel: () => Promise<void>;
  onStart: () => Promise<void>;
  onCancelJob: () => Promise<void>;
  onClose: () => void;
};
```

Use Ant Design `Modal`, `Alert`, `Input.OTP`, `Radio.Group`, `Progress`, and `Button`. Use `canvasThemes`/Ant tokens already supplied by the page; do not add global CSS. Show exact input and predicted output dimensions, indeterminate processing text when no numeric progress exists, and a macOS ARM64 download link only in `offline` state.

- [ ] **Step 4: Run the UI contract test**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/components/canvas-local-upscale-modal.test.mts'`

Expected: PASS.

- [ ] **Step 5: Commit the Modal**

```bash
git add 'web/src/app/(user)/canvas/components/canvas-local-upscale-modal.tsx' 'web/src/app/(user)/canvas/components/canvas-local-upscale-modal.test.mts'
git commit -m "feat: add local upscale canvas dialog"
```

### Task 12: Wire local upscale into canvas actions, persistence and Assets

**Files:**
- Create: `web/src/app/(user)/canvas/hooks/use-canvas-local-upscale-actions.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-node-tool-actions.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-node-action-controller.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-node-execution-actions.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-inspector.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-context-inspector.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-page-overlays.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/next.config.ts`
- Test: `web/src/app/(user)/canvas/local-upscale-wiring.test.mts`

- [ ] **Step 1: Write a failing wiring contract test**

Assert the relevant source files expose and connect `onLocalUpscale`, render the action only for `CanvasNodeType.Image && hasMedia`, pass `upscaleNode` into `CanvasPageOverlays`, render `CanvasLocalUpscaleModal`, and configure defaults for `NEXT_PUBLIC_LOCAL_UPSCALE_URL` and `NEXT_PUBLIC_UPSCALE_ASSISTANT_DOWNLOAD_URL`.

- [ ] **Step 2: Run the wiring test and verify it fails**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/local-upscale-wiring.test.mts'`

Expected: FAIL because the action is not wired.

- [ ] **Step 3: Implement the page-private hook**

The hook owns `connection`, `model`, `scale`, active subscriptions and these actions:

```ts
export type CanvasLocalUpscaleActions = {
  open(node: CanvasNodeData): Promise<void>;
  close(): void;
  detect(): Promise<void>;
  pair(code: string): Promise<void>;
  downloadModel(): Promise<void>;
  start(): Promise<void>;
  cancel(): Promise<void>;
  retry(node: CanvasNodeData): Promise<void>;
};
```

Inject `nodesRef`, `connectionsRef`, setters, `addCanvasNodeToAssets`, existing `getImageBlob`, `uploadImage`, `imageMetadata`, `nanoid`, project/canvas context and Ant message API. On `start`, synchronously add the child and connection before network submission; after submission write `jobId`; consume SSE until terminal; on success call the runner; on failure update only the child. Always keep `nodesRef`/`connectionsRef` synchronized with state, matching existing canvas action patterns.

When `downloadModel` starts, poll `client.models()` every 500 ms and update numeric download progress until installed or failed. Stop polling on Modal close and unmount. `start` may also submit with a missing model; the helper then reports the same `downloading_model` job phase, so both first-use paths converge on one model manager.

- [ ] **Step 4: Resume unfinished jobs after canvas hydrate**

In one effect, call `resumableLocalUpscaleNodes(nodesRef.current)` only after `projectLoaded`. Detect the helper once, query every saved `jobId`, and subscribe without creating nodes or jobs. If the helper is offline keep the node unchanged; if the helper returns `404`, mark it failed with `job_not_found`. Abort every subscription on unmount.

- [ ] **Step 5: Wire the action without expanding unrelated hooks**

Add `onLocalUpscale` to `CanvasNodeHoverToolbarActions`, node tool actions and inspector actions. Keep the business hook separate from `useCanvasNodeDerivativeActions`; `canvas-client-page.tsx` only creates the hook, supplies `onLocalUpscale: localUpscale.open`, and passes controlled Modal props through `CanvasPageOverlays`.

- [ ] **Step 6: Expose configurable URLs**

In `next.config.ts` add:

```ts
NEXT_PUBLIC_LOCAL_UPSCALE_URL: process.env.NEXT_PUBLIC_LOCAL_UPSCALE_URL || "http://127.0.0.1:47821",
NEXT_PUBLIC_UPSCALE_ASSISTANT_DOWNLOAD_URL: process.env.NEXT_PUBLIC_UPSCALE_ASSISTANT_DOWNLOAD_URL || "",
```

Do not introduce a new CSP because the project currently has none; document the required `connect-src` addition for deployments that add one later.

- [ ] **Step 7: Run wiring plus focused canvas tests**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/local-upscale-wiring.test.mts' 'src/app/(user)/canvas/utils/canvas-local-upscale.test.mts' 'src/app/(user)/canvas/hooks/canvas-local-upscale-runner.test.mts'
```

Expected: all tests PASS.

- [ ] **Step 8: Commit canvas integration**

```bash
git add 'web/src/app/(user)/canvas' web/next.config.ts
git commit -m "feat: connect canvas to local upscaling"
```

### Task 13: Complete documentation and operator instructions

**Files:**
- Create: `docs/local-upscale-assistant.md`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write the operator guide**

Document:

- macOS 14+ Apple Silicon and Chrome requirement.
- `npm run upscale-assistant:dist:mac` packaging command.
- installing/opening the DMG, Gatekeeper behavior for the unsigned test build, starting the helper and opening `http://127.0.0.1:47821`.
- pairing, model download, storage paths, logs without image content, revocation and uninstall paths.
- `NEXT_PUBLIC_LOCAL_UPSCALE_URL` and `NEXT_PUBLIC_UPSCALE_ASSISTANT_DOWNLOAD_URL` deployment configuration.
- required CSP `connect-src http://127.0.0.1:47821` only for deployments that already enforce CSP.
- engine/model licenses and formal signing/notarization gate before public release.

- [ ] **Step 2: Update project tracking docs without overwriting existing edits**

Append one self-contained pending-test section titled `网页版画布本地图片超分助手`. Add Safari, Windows, extra models and batch upscale to `docs/todo.md`. Add one Unreleased bullet to `CHANGELOG.md` only if that section exists. Do not move the feature to `docs/features.md` before user acceptance.

- [ ] **Step 3: Review the documentation diff**

Run:

```bash
git diff -- docs/local-upscale-assistant.md docs/todo.md docs/pending-test.md CHANGELOG.md
git diff --check
```

Expected: only scoped documentation additions, no whitespace errors, no “我的素材” wording for the new feature.

- [ ] **Step 4: Commit docs**

```bash
git add docs/local-upscale-assistant.md docs/todo.md docs/pending-test.md CHANGELOG.md
git commit -m "docs: explain local upscale assistant"
```

### Task 14: Run the authorized acceptance pass

**Files:** No new files unless fixes are required.

- [ ] **Step 1: Run all focused Go tests**

Run:

```bash
go test ./localupscale ./cmd/upscale-assistant -count=1
```

Expected: PASS.

- [ ] **Step 2: Run all focused web tests**

Run:

```bash
cd web && node --experimental-strip-types --test \
  src/services/local-upscale/client.test.mts \
  'src/app/(user)/canvas/utils/canvas-local-upscale.test.mts' \
  'src/app/(user)/canvas/hooks/canvas-local-upscale-runner.test.mts' \
  'src/app/(user)/canvas/components/canvas-local-upscale-modal.test.mts' \
  'src/app/(user)/canvas/local-upscale-wiring.test.mts'
```

Expected: PASS.

- [ ] **Step 3: Build the macOS test app and inspect architectures**

Run:

```bash
cd web && npm run upscale-assistant:dist:mac
file 'build/upscale-assistant/眨眼之间超分助手.app/Contents/MacOS/upscale-assistant'
lipo -info 'build/upscale-assistant/眨眼之间超分助手.app/Contents/Resources/bin/realesrgan-ncnn-vulkan'
```

Expected: DMG exists under `web/release`; helper is ARM64; engine includes ARM64.

- [ ] **Step 4: Perform the real local inference acceptance**

On the Apple Silicon test Mac:

1. Install and open the generated helper.
2. Open the status page and pair the Chrome origin.
3. Run 2× on a small uploaded PNG and verify exact output dimensions.
4. Run 4× on an existing generated canvas image and verify exact output dimensions.
5. Confirm each run creates one right-side child plus one connection and leaves the source unchanged.
6. Reload the page while a job is queued/processing and verify status resumes.
7. Confirm the completed child persists and appears in Assets with source/model/scale/size/duration metadata.
8. Use Chrome DevTools Network to confirm image bytes go only to `127.0.0.1:47821`, never the project backend.
9. Exercise cancel, assistant restart, revoked token and archive failure; verify each prescribed error state.

- [ ] **Step 5: Audit completion against the approved spec**

For every bullet in `docs/superpowers/specs/2026-08-08-local-image-upscale-assistant-design.md`, point to a test, built artifact, inspected file or manual observation. Treat any unsupported requirement as incomplete and fix it before reporting completion.

## Final completion evidence

The feature is complete only when all of the following are true:

- The helper DMG contains an ARM64 Go service and an ARM64-capable Real-ESRGAN engine.
- Chrome can pair securely with an exact Origin and cannot reuse a token from another Origin.
- First use downloads and verifies the model package; subsequent runs reuse it.
- Both 2× and 4× produce exact pixel dimensions on the Apple Silicon test Mac.
- Source nodes never change; derived nodes, connections, persisted Blobs and Asset records all survive refresh.
- Progress, cancel, retry, restart recovery, result re-download and asset-archive failure are evidenced.
- Network inspection proves image bytes do not traverse the cloud backend.
- Documentation accurately uses “资产” for the new feature and leaves `docs/features.md` unchanged until user acceptance.
