package service

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestWorkflowMediaBatchRejectsAnotherUserAndInvalidImage(t *testing.T) {
	setupVideoWorkflowTest(t)
	setupWorkflowMediaTestDir(t)
	detail := ensureVideoWorkflowTestRun(t)
	batch, err := CreateUserWorkflowMediaBatch("user-1", detail.Run.ID, CreateWorkflowMediaBatchInput{StageID: WorkflowStageArtDesign, IdempotencyKey: "media-owner"})
	if err != nil {
		t.Fatal(err)
	}
	invalid := []byte("not an image")
	if _, err := UploadUserWorkflowMedia("user-2", batch.Batch.ID, newWorkflowTestFile(invalid), &multipart.FileHeader{Filename: "x.png", Size: int64(len(invalid))}, WorkflowMediaItemInput{Kind: "character"}); err == nil {
		t.Fatal("expected ownership error")
	}
	if _, err := UploadUserWorkflowMedia("user-1", batch.Batch.ID, newWorkflowTestFile(invalid), &multipart.FileHeader{Filename: "x.png", Size: int64(len(invalid))}, WorkflowMediaItemInput{Kind: "character"}); err == nil || !strings.Contains(err.Error(), "PNG") {
		t.Fatalf("err=%v", err)
	}
}

func TestWorkflowMediaClaimFreezesOrderedManifest(t *testing.T) {
	setupVideoWorkflowTest(t)
	setupWorkflowMediaTestDir(t)
	detail, err := EnsureWorkflowRun("user-1", EnsureWorkflowRunInput{
		ProjectID: "project-1", EpisodeID: "episode-media", ScriptConfirmed: true,
		ScriptSnapshot: "第一场：阿宁撑着雨伞走上街道。",
	})
	if err != nil {
		t.Fatal(err)
	}
	detail = approveWorkflowStageForTest(t, detail, WorkflowStageAssetExtraction, `{"items":[{"assetId":"character-001","kind":"character","name":"阿宁","sourceEvidence":["阿宁撑着雨伞走上街道。"],"coreFacts":["主要角色"]},{"assetId":"scene-001","kind":"scene","name":"街道","sourceEvidence":["第一场：阿宁撑着雨伞走上街道。"],"coreFacts":["室外街道"]},{"assetId":"prop-001","kind":"prop","name":"雨伞","sourceEvidence":["阿宁撑着雨伞走上街道。"],"coreFacts":["阿宁持有"]}]}`)
	detail = approveWorkflowStageForTest(t, detail, WorkflowStageShotBreakdown, `{"shots":[{"shotId":"shot-001","sceneKey":"scene-001","sourceScript":"阿宁撑着雨伞走上街道。","shotDraft":{"shotSize":"中景","camera":"固定机位","movement":"缓慢推近","action":"阿宁撑着雨伞走上街道","performance":"克制","dialogue":"","durationSeconds":6,"continuityMode":"continuous"}}]}`)
	batch, err := CreateUserWorkflowMediaBatch("user-1", detail.Run.ID, CreateWorkflowMediaBatchInput{StageID: WorkflowStageShotPrompt, IdempotencyKey: "media-claim"})
	if err != nil {
		t.Fatal(err)
	}
	jpeg := []byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0xff, 0xd9}
	for _, item := range []WorkflowMediaItemInput{
		{AssetID: "library-character-1", Label: "阿宁", Kind: "character", Version: "v3", Order: 0},
		{AssetID: "library-scene-1", Label: "街道", Kind: "scene", Version: "v2", Order: 1},
		{AssetID: "library-prop-1", Label: "雨伞", Kind: "prop", Version: "v1", Order: 2},
		{AssetID: "library-tail-1", Label: "上一镜尾帧", Kind: "scene", Version: "tail-v1", Order: 3},
	} {
		if _, err := UploadUserWorkflowMedia("user-1", batch.Batch.ID, newWorkflowTestFile(jpeg), &multipart.FileHeader{Filename: item.AssetID + ".jpg", Size: int64(len(jpeg))}, item); err != nil {
			t.Fatal(err)
		}
	}
	context := json.RawMessage(`{"shotId":"shot-001","sourceScript":"阿宁撑着雨伞走上街道。","shotDraft":{"shotSize":"中景","camera":"固定机位","movement":"缓慢推近","action":"阿宁撑着雨伞走上街道","performance":"克制","dialogue":"","durationSeconds":6,"continuityMode":"continuous"},"promptInputHash":"media-claim","references":[{"ref":"@图1","role":"character","label":"阿宁","kind":"character","logicalAssetId":"character-001","libraryAssetId":"library-character-1","version":"v3","usage":"角色一致性"},{"ref":"@图2","role":"scene","label":"街道","kind":"scene","logicalAssetId":"scene-001","libraryAssetId":"library-scene-1","version":"v2","usage":"场景一致性"},{"ref":"@图3","role":"prop","label":"雨伞","kind":"prop","logicalAssetId":"prop-001","libraryAssetId":"library-prop-1","version":"v1","usage":"道具一致性"},{"ref":"@图4","role":"continuity_reference","label":"上一镜尾帧","kind":"scene","logicalAssetId":"","libraryAssetId":"library-tail-1","version":"tail-v1","usage":"只理解上一画面之后的延续","sourceShotId":"shot-000"}]}`)
	stage, err := StartWorkflowStageWithInput("user-1", detail.Run.ID, WorkflowStageShotPrompt, WorkflowStageStartInput{IdempotencyKey: "media-claim", MediaBatchID: batch.Batch.ID, Context: context})
	if err != nil {
		t.Fatal(err)
	}
	run, _, _ := repository.GetAgentRun(stage.AgentRunID)
	invocation, err := GetInvocationDetail("user-1", stage.InvocationID)
	if err != nil {
		t.Fatal(err)
	}
	renditionRefs := []model.InvocationArtifactRef{}
	for _, ref := range invocation.AuthoritativeArtifactRefs {
		if ref.Direction == "input" && ref.ArtifactType == "asset_rendition" {
			renditionRefs = append(renditionRefs, ref)
		}
	}
	if len(renditionRefs) != 4 {
		t.Fatalf("rendition refs=%+v", renditionRefs)
	}
	continuityCount := 0
	for _, ref := range renditionRefs {
		artifact, err := GetArtifact("user-1", ref.ArtifactID)
		if err != nil || !strings.Contains(artifact.Payload["mediaRef"].(string), "sha256=") || strings.Contains(artifact.Payload["mediaRef"].(string), config.Cfg.WorkflowLocalMediaDir) {
			t.Fatalf("artifact=%+v err=%v", artifact, err)
		}
		metadata, _ := artifact.Extensions["workflow_media_import"].(map[string]any)
		if metadata["role"] == "continuity_reference" {
			continuityCount++
		}
	}
	if continuityCount != 1 {
		t.Fatalf("continuity count=%d refs=%+v", continuityCount, renditionRefs)
	}
	var manifest struct {
		Items []struct {
			AssetID    string `json:"assetId"`
			Kind       string `json:"kind"`
			Version    string `json:"version"`
			SHA256     string `json:"sha256"`
			ServerPath string `json:"serverPath"`
		} `json:"items"`
	}
	if err := json.Unmarshal([]byte(run.ImageManifestJSON), &manifest); err != nil {
		t.Fatal(err)
	}
	if len(manifest.Items) != 4 || manifest.Items[0].AssetID != "library-character-1" || manifest.Items[1].AssetID != "library-scene-1" || manifest.Items[2].AssetID != "library-prop-1" || manifest.Items[3].AssetID != "library-tail-1" {
		t.Fatalf("manifest=%+v", manifest)
	}
	for _, item := range manifest.Items {
		if item.Version == "" || item.SHA256 == "" || item.ServerPath == "" {
			t.Fatalf("item=%+v", item)
		}
	}
	publicJSON, _ := json.Marshal(run)
	if strings.Contains(string(publicJSON), "serverPath") || strings.Contains(string(publicJSON), "imageManifest") {
		t.Fatalf("public run leaked internal image path: %s", publicJSON)
	}
	if _, err := CancelWorkflowStage("user-1", stage.ID); err != nil {
		t.Fatal(err)
	}
	retried, err := RetryWorkflowStage("user-1", stage.ID, "media-claim-retry")
	if err != nil {
		t.Fatal(err)
	}
	retryRun, ok, err := repository.GetAgentRun(retried.AgentRunID)
	if err != nil || !ok || retryRun.ImageManifestJSON != run.ImageManifestJSON {
		t.Fatalf("retry run=%+v ok=%v err=%v", retryRun, ok, err)
	}
}

func setupWorkflowMediaTestDir(t *testing.T) {
	t.Helper()
	previous := config.Cfg.WorkflowLocalMediaDir
	config.Cfg.WorkflowLocalMediaDir = t.TempDir()
	t.Cleanup(func() { config.Cfg.WorkflowLocalMediaDir = previous })
}

type workflowTestMultipartFile struct{ *bytes.Reader }

func (workflowTestMultipartFile) Close() error { return nil }

func newWorkflowTestFile(data []byte) multipart.File {
	return workflowTestMultipartFile{Reader: bytes.NewReader(data)}
}
