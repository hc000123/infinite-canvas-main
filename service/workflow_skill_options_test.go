package service

import (
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/repository"
)

func TestListWorkflowSkillOptionsReturnsPublishedVersionsForStage(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	options, err := ListWorkflowStageSkillOptions(WorkflowStageAssetExtraction, "project-1")
	if err != nil || len(options) == 0 {
		t.Fatalf("options=%+v err=%v", options, err)
	}
	if options[0].StageID != WorkflowStageAssetExtraction || options[0].SkillVersionID == "" || !options[0].IsDefault {
		t.Fatalf("option=%+v", options[0])
	}
}

func TestResolveWorkflowSkillOverrideRejectsWrongStage(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	assetSkill, err := ResolveWorkflowStageSkill(WorkflowSkillStageArt, "project-1", "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = ResolveWorkflowStageSkillForRun(WorkflowStageShotBreakdown, "project-1", assetSkill.Version.ID)
	if err == nil || !strings.Contains(err.Error(), "不支持") {
		t.Fatalf("err=%v", err)
	}
}

func TestWorkflowStageUsesExplicitPublishedSkillVersion(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	draft := publishCompatibleSkillTestVersion(t, "workflow.stage.art", "7.0.0")
	stage, err := StartWorkflowStageWithInput("user-1", detail.Run.ID, WorkflowStageAssetExtraction, WorkflowStageStartInput{
		IdempotencyKey: "explicit-skill-version",
		SkillVersionID: draft.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	run, ok, err := repository.GetAgentRun(stage.AgentRunID)
	if err != nil || !ok || run.SkillVersionID != draft.ID {
		t.Fatalf("run=%+v ok=%v err=%v", run, ok, err)
	}
}
