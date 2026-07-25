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
	options, err := ListWorkflowStageSkillOptions("user-1", WorkflowStageAssetExtraction, "project-1")
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
	assetSkill, err := ResolveWorkflowStageSkill("user-1", WorkflowSkillStageArt, "project-1", "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = ResolveWorkflowStageSkillForRun("user-1", WorkflowStageShotBreakdown, "project-1", assetSkill.Version.ID)
	if err == nil || !strings.Contains(err.Error(), "不支持") {
		t.Fatalf("err=%v", err)
	}
}

func TestWorkflowStageUsesExplicitPublishedSkillVersion(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	draft := publishCompatibleSkillTestVersion(t, "workflow.stage.art", "7.0.0")
	setSkillTestScope(t, draft, "user-1", detail.Run.ProjectID)
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

func TestListWorkflowStageSkillOptionsRequiresProjectOwnerUser(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	version := publishCompatibleSkillTestVersion(t, "workflow.stage.art", "8.0.0")
	setSkillTestScope(t, version, "user-1", "project-1")
	ownerItems, err := ListWorkflowStageSkillOptions("user-1", WorkflowStageAssetExtraction, "project-1")
	if err != nil {
		t.Fatal(err)
	}
	foreignItems, err := ListWorkflowStageSkillOptions("user-2", WorkflowStageAssetExtraction, "project-1")
	if err != nil {
		t.Fatal(err)
	}
	contains := func(items []WorkflowSkillOption) bool {
		for _, item := range items {
			if item.SkillVersionID == version.ID {
				return true
			}
		}
		return false
	}
	if !contains(ownerItems) || contains(foreignItems) {
		t.Fatalf("owner=%+v foreign=%+v", ownerItems, foreignItems)
	}
}
