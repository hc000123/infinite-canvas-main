package repository

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestVideoSubtitleEraseJobOwnershipAndActiveRecovery(t *testing.T) {
	setupRepositoryTestDB(t)
	jobs := []model.VideoSubtitleEraseJob{
		{ID: "erase-queued", UserID: "user-a", Status: model.VideoSubtitleEraseJobStatusQueued, CreatedAt: "1", UpdatedAt: "1"},
		{ID: "erase-uploading", UserID: "user-a", Status: model.VideoSubtitleEraseJobStatusUploading, InputTOSURL: "tos://bucket/input.mp4", CreatedAt: "2", UpdatedAt: "2"},
		{ID: "erase-processing", UserID: "user-b", Status: model.VideoSubtitleEraseJobStatusProcessing, RunID: "task-1", CreatedAt: "3", UpdatedAt: "3"},
		{ID: "erase-done", UserID: "user-b", Status: model.VideoSubtitleEraseJobStatusSucceeded, CreatedAt: "4", UpdatedAt: "4"},
	}
	for _, job := range jobs {
		if _, err := SaveVideoSubtitleEraseJob(job); err != nil {
			t.Fatalf("SaveVideoSubtitleEraseJob(%s): %v", job.ID, err)
		}
	}
	owned, ok, err := GetUserVideoSubtitleEraseJob("user-a", "erase-queued")
	if err != nil || !ok || owned.ID != "erase-queued" {
		t.Fatalf("owned job = %#v ok=%v err=%v", owned, ok, err)
	}
	if _, ok, err := GetUserVideoSubtitleEraseJob("user-b", "erase-queued"); err != nil || ok {
		t.Fatalf("foreign job visible: ok=%v err=%v", ok, err)
	}
	active, err := ListActiveVideoSubtitleEraseJobs()
	if err != nil || len(active) != 3 {
		t.Fatalf("active jobs = %#v err=%v", active, err)
	}
}

func TestSaveVideoSubtitleEraseJobPreservesLASIdentifiers(t *testing.T) {
	setupRepositoryTestDB(t)
	job := model.VideoSubtitleEraseJob{ID: "erase-update", UserID: "user-a", Status: model.VideoSubtitleEraseJobStatusUploading, InputTOSURL: "tos://bucket/input.mp4", RunID: "task-1", ClientToken: "erase-update", Progress: 30}
	if _, err := SaveVideoSubtitleEraseJob(job); err != nil {
		t.Fatal(err)
	}
	job.Status, job.Progress, job.ErrorCode = model.VideoSubtitleEraseJobStatusFailed, 60, "poll_failed"
	if _, err := SaveVideoSubtitleEraseJob(job); err != nil {
		t.Fatal(err)
	}
	stored, ok, err := GetVideoSubtitleEraseJob(job.ID)
	if err != nil || !ok || stored.InputTOSURL != "tos://bucket/input.mp4" || stored.RunID != "task-1" || stored.ClientToken != "erase-update" || stored.ErrorCode != "poll_failed" {
		t.Fatalf("stored job = %#v ok=%v err=%v", stored, ok, err)
	}
}
