package service

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestWorkflowRunListIsUserScopedFilteredAndLightweight(t *testing.T) {
	setupVideoWorkflowTest(t)
	database, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	runs := []model.WorkflowRun{
		{ID: "workflow-owner-1", UserID: "owner", ProjectID: "project-1", EpisodeID: "episode-1", WorkflowID: VideoWorkflowID, WorkflowVersion: VideoWorkflowVersion, ScriptHash: "hash-1", ScriptSnapshot: "不得出现在列表响应中的剧本", CurrentStageID: WorkflowStageAssetExtraction, Status: model.WorkflowRunStatusActive, CreatedAt: "2026-08-08T08:00:00Z", UpdatedAt: "2026-08-08T10:00:00Z"},
		{ID: "workflow-owner-2", UserID: "owner", ProjectID: "project-2", EpisodeID: "episode-2", WorkflowID: VideoWorkflowID, WorkflowVersion: VideoWorkflowVersion, ScriptHash: "hash-2", Status: model.WorkflowRunStatusCompleted, CreatedAt: "2026-08-08T08:00:00Z", UpdatedAt: "2026-08-08T09:00:00Z"},
		{ID: "workflow-foreign", UserID: "other", ProjectID: "project-1", EpisodeID: "episode-foreign", WorkflowID: VideoWorkflowID, WorkflowVersion: VideoWorkflowVersion, ScriptHash: "hash-3", Status: model.WorkflowRunStatusActive, CreatedAt: "2026-08-08T08:00:00Z", UpdatedAt: "2026-08-08T11:00:00Z"},
	}
	if err := database.Create(&runs).Error; err != nil {
		t.Fatal(err)
	}
	stages := []model.WorkflowStageRun{
		{ID: "stage-old", UserID: "owner", WorkflowRunID: runs[0].ID, StageID: WorkflowStageAssetExtraction, InvocationID: "invocation-old", Attempt: 1, Status: model.WorkflowStageRunStatusFailed, CreatedAt: "2026-08-08T08:10:00Z", UpdatedAt: "2026-08-08T08:10:00Z"},
		{ID: "stage-latest", UserID: "owner", WorkflowRunID: runs[0].ID, StageID: WorkflowStageAssetExtraction, InvocationID: "invocation-latest", Attempt: 2, Status: model.WorkflowStageRunStatusNeedsReview, CreatedAt: "2026-08-08T09:10:00Z", UpdatedAt: "2026-08-08T09:10:00Z"},
	}
	if err := database.Create(&stages).Error; err != nil {
		t.Fatal(err)
	}
	gate := model.InvocationGateResult{ID: "gate-warning", UserID: "owner", InvocationID: stages[1].InvocationID, ArtifactHash: "hash", Layer: "business", ValidatorID: "placeholder", Attempt: 2, Passed: true, IssuesJSON: `[{"code":"placeholder","message":"仍有文字占位","blocking":false}]`, CreatedAt: "2026-08-08T09:20:00Z"}
	if err := database.Create(&gate).Error; err != nil {
		t.Fatal(err)
	}

	result, err := ListWorkflowRuns("owner", WorkflowRunListQuery{ProjectID: "project-1", Status: model.WorkflowRunStatusActive, Page: 1, PageSize: 20})
	if err != nil {
		t.Fatalf("ListWorkflowRuns returned error: %v", err)
	}
	if result.Total != 1 || len(result.Items) != 1 {
		t.Fatalf("result=%#v", result)
	}
	item := result.Items[0]
	if item.ID != runs[0].ID || item.ProjectID != "project-1" || item.EpisodeID != "episode-1" {
		t.Fatalf("item=%#v", item)
	}
	if len(item.Stages) != 1 || item.Stages[0].Attempt != 2 || item.Stages[0].Status != model.WorkflowStageRunStatusNeedsReview {
		t.Fatalf("stages=%#v", item.Stages)
	}
	if item.ReviewCount != 1 || item.WarningCount != 1 {
		t.Fatalf("review=%d warning=%d", item.ReviewCount, item.WarningCount)
	}
}

func TestWorkflowRunListPaginatesNewestFirst(t *testing.T) {
	setupVideoWorkflowTest(t)
	database, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	runs := []model.WorkflowRun{
		{ID: "workflow-page-old", UserID: "owner", ProjectID: "project-1", EpisodeID: "episode-old", WorkflowID: VideoWorkflowID, WorkflowVersion: VideoWorkflowVersion, ScriptHash: "page-old", Status: model.WorkflowRunStatusActive, CreatedAt: "2026-08-08T08:00:00Z", UpdatedAt: "2026-08-08T08:00:00Z"},
		{ID: "workflow-page-new", UserID: "owner", ProjectID: "project-1", EpisodeID: "episode-new", WorkflowID: VideoWorkflowID, WorkflowVersion: VideoWorkflowVersion, ScriptHash: "page-new", Status: model.WorkflowRunStatusActive, CreatedAt: "2026-08-08T09:00:00Z", UpdatedAt: "2026-08-08T09:00:00Z"},
	}
	if err := database.Create(&runs).Error; err != nil {
		t.Fatal(err)
	}

	result, err := ListWorkflowRuns("owner", WorkflowRunListQuery{ProjectID: "project-1", Page: 2, PageSize: 1})
	if err != nil {
		t.Fatal(err)
	}
	if result.Total != 2 || result.Page != 2 || result.PageSize != 1 || len(result.Items) != 1 || result.Items[0].ID != "workflow-page-old" {
		t.Fatalf("result=%#v", result)
	}
}
