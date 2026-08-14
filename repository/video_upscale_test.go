package repository

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestVideoUpscaleJobOwnershipAndActiveRecovery(t *testing.T) {
	setupRepositoryTestDB(t)
	jobs := []model.VideoUpscaleJob{
		{ID: "video-queued", UserID: "user-a", Status: model.VideoUpscaleJobStatusQueued, CreatedAt: "1", UpdatedAt: "1"},
		{ID: "video-uploading", UserID: "user-a", Status: model.VideoUpscaleJobStatusUploading, InputTOSURL: "tos://bucket/input.mp4", CreatedAt: "2", UpdatedAt: "2"},
		{ID: "video-processing", UserID: "user-b", Status: model.VideoUpscaleJobStatusProcessing, RunID: "run-1", CreatedAt: "3", UpdatedAt: "3"},
		{ID: "video-done", UserID: "user-b", Status: model.VideoUpscaleJobStatusSucceeded, CreatedAt: "4", UpdatedAt: "4"},
	}
	for _, job := range jobs {
		if _, err := SaveVideoUpscaleJob(job); err != nil {
			t.Fatalf("SaveVideoUpscaleJob(%s): %v", job.ID, err)
		}
	}
	owned, ok, err := GetUserVideoUpscaleJob("user-a", "video-queued")
	if err != nil || !ok || owned.ID != "video-queued" {
		t.Fatalf("owned job = %#v ok=%v err=%v", owned, ok, err)
	}
	if _, ok, err := GetUserVideoUpscaleJob("user-b", "video-queued"); err != nil || ok {
		t.Fatalf("foreign job visible: ok=%v err=%v", ok, err)
	}
	active, err := ListActiveVideoUpscaleJobs()
	if err != nil || len(active) != 3 {
		t.Fatalf("active jobs = %#v err=%v", active, err)
	}
}

func TestSaveVideoUpscaleJobPreservesLASIdentifiers(t *testing.T) {
	setupRepositoryTestDB(t)
	job := model.VideoUpscaleJob{ID: "video-update", UserID: "user-a", Status: model.VideoUpscaleJobStatusUploading, InputTOSURL: "tos://bucket/input.mp4", RunID: "task-1", Progress: 30}
	if _, err := SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	job.Status, job.Progress, job.ErrorCode = model.VideoUpscaleJobStatusFailed, 60, "poll_failed"
	if _, err := SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	stored, ok, err := GetVideoUpscaleJob(job.ID)
	if err != nil || !ok || stored.InputTOSURL != "tos://bucket/input.mp4" || stored.RunID != "task-1" || stored.ErrorCode != "poll_failed" {
		t.Fatalf("stored job = %#v ok=%v err=%v", stored, ok, err)
	}
}
