package service

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
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
	detail := ensureVideoWorkflowTestRun(t)
	batch, err := CreateUserWorkflowMediaBatch("user-1", detail.Run.ID, CreateWorkflowMediaBatchInput{StageID: WorkflowStageArtDesign, IdempotencyKey: "media-claim"})
	if err != nil {
		t.Fatal(err)
	}
	jpeg := []byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0xff, 0xd9}
	for _, item := range []WorkflowMediaItemInput{
		{AssetID: "prop-1", Label: "雨伞", Kind: "prop", Version: "v1", Order: 1},
		{AssetID: "scene-1", Label: "街道", Kind: "scene", Version: "v2", Order: 1},
		{AssetID: "character-1", Label: "阿宁", Kind: "character", Version: "v3", Order: 1},
	} {
		if _, err := UploadUserWorkflowMedia("user-1", batch.Batch.ID, newWorkflowTestFile(jpeg), &multipart.FileHeader{Filename: item.AssetID + ".jpg", Size: int64(len(jpeg))}, item); err != nil {
			t.Fatal(err)
		}
	}
	stage, err := StartWorkflowStageWithMedia("user-1", detail.Run.ID, WorkflowStageArtDesign, "media-claim", batch.Batch.ID)
	if err != nil {
		t.Fatal(err)
	}
	run, _, _ := repository.GetAgentRun(stage.AgentRunID)
	var manifest struct {
		Items []struct {
			Kind       string `json:"kind"`
			Version    string `json:"version"`
			SHA256     string `json:"sha256"`
			ServerPath string `json:"serverPath"`
		} `json:"items"`
	}
	if err := json.Unmarshal([]byte(run.ImageManifestJSON), &manifest); err != nil {
		t.Fatal(err)
	}
	if len(manifest.Items) != 3 || manifest.Items[0].Kind != "character" || manifest.Items[1].Kind != "scene" || manifest.Items[2].Kind != "prop" {
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
