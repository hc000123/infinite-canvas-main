package repository

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestImageUpscaleJobOwnershipAndActiveRecovery(t *testing.T) {
	setupRepositoryTestDB(t)
	jobs := []model.ImageUpscaleJob{
		{ID: "upscale-queued", UserID: "user-a", Status: model.ImageUpscaleJobStatusQueued, CreatedAt: "2026-08-09T00:00:00Z", UpdatedAt: "2026-08-09T00:00:00Z"},
		{ID: "upscale-running", UserID: "user-a", Status: model.ImageUpscaleJobStatusProcessing, CreatedAt: "2026-08-09T00:00:01Z", UpdatedAt: "2026-08-09T00:00:01Z"},
		{ID: "upscale-done", UserID: "user-b", Status: model.ImageUpscaleJobStatusSucceeded, CreatedAt: "2026-08-09T00:00:02Z", UpdatedAt: "2026-08-09T00:00:02Z"},
	}
	for _, job := range jobs {
		if _, err := SaveImageUpscaleJob(job); err != nil {
			t.Fatalf("SaveImageUpscaleJob(%s): %v", job.ID, err)
		}
	}

	owned, ok, err := GetUserImageUpscaleJob("user-a", "upscale-queued")
	if err != nil || !ok || owned.ID != "upscale-queued" {
		t.Fatalf("owned job = %#v ok=%v err=%v", owned, ok, err)
	}
	if _, ok, err := GetUserImageUpscaleJob("user-b", "upscale-queued"); err != nil || ok {
		t.Fatalf("foreign job visible: ok=%v err=%v", ok, err)
	}

	active, err := ListActiveImageUpscaleJobs()
	if err != nil || len(active) != 2 {
		t.Fatalf("active jobs = %#v err=%v", active, err)
	}
}

func TestSaveImageUpscaleJobUpdatesLifecycleFields(t *testing.T) {
	setupRepositoryTestDB(t)
	job := model.ImageUpscaleJob{ID: "upscale-update", UserID: "user-a", Status: model.ImageUpscaleJobStatusQueued, Progress: 5}
	if _, err := SaveImageUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	job.Status = model.ImageUpscaleJobStatusFailed
	job.Progress = 25
	job.ErrorCode = "provider_failed"
	job.ErrorMessage = "图片超分服务处理失败"
	job.Attempt = 2
	if _, err := SaveImageUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	stored, ok, err := GetUserImageUpscaleJob("user-a", job.ID)
	if err != nil || !ok || stored.Status != model.ImageUpscaleJobStatusFailed || stored.Progress != 25 || stored.Attempt != 2 || stored.ErrorCode != "provider_failed" {
		t.Fatalf("stored job = %#v ok=%v err=%v", stored, ok, err)
	}
}
