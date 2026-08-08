package service

import (
	"encoding/json"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestGetWorkflowAssetSlotsBuildsPlaceholdersFromApprovedCatalog(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	detail = seedApprovedAssetCatalogForSlotsTest(t, detail, `{"items":[{"assetId":"character-001","kind":"character","name":"阿宁","sourceEvidence":["阿宁进入房间"],"coreFacts":["年轻女性","黑色短发"]},{"assetId":"costume-001","kind":"costume","name":"黄色雨衣","sourceEvidence":["她穿着黄色雨衣"],"coreFacts":["旧雨衣"]}]}`)
	stage := workflowTestStage(detail, WorkflowStageAssetExtraction)

	loaded, err := GetWorkflowAssetSlots("user-1", stage.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Version != 0 || loaded.Artifact.Artifact.ID != stage.OutputArtifactID || len(loaded.Slots) != 2 {
		t.Fatalf("loaded=%#v", loaded)
	}
	if loaded.Slots[0].SlotID != "slot-character-001" || loaded.Slots[0].Status != AgentAssetSlotPlaceholder || loaded.Slots[0].Description != "年轻女性；黑色短发" {
		t.Fatalf("character=%#v", loaded.Slots[0])
	}
	if loaded.Slots[1].Category != AgentAssetCategoryProp {
		t.Fatalf("costume=%#v", loaded.Slots[1])
	}
}

func TestWorkflowAssetSlotsCreateImmutableCatalogVersions(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	detail = seedApprovedAssetCatalogForSlotsTest(t, detail, `{"items":[{"assetId":"character-001","kind":"character","name":"阿宁","sourceEvidence":["阿宁进入房间"],"coreFacts":["年轻女性"]}]}`)
	stage := workflowTestStage(detail, WorkflowStageAssetExtraction)
	base, err := GetArtifact("user-1", stage.OutputArtifactID)
	if err != nil {
		t.Fatal(err)
	}

	first, err := SaveWorkflowAssetSlots("user-1", stage.ID, SaveWorkflowAssetSlotsInput{
		BaseArtifactHash: base.Artifact.ContentHash,
		Slots: []AgentAssetSlot{
			{SlotID: "slot-character-1", Category: AgentAssetCategoryCharacter, Name: "阿宁", Description: "年轻女性，黑色短发", Status: AgentAssetSlotPlaceholder, SourceSceneIDs: []string{"scene-1"}, SourceEvidence: []string{"阿宁进入房间"}},
			{SlotID: "slot-blocking-1", Category: AgentAssetCategoryBlocking, Name: "门口站位", Description: "人物站在门框右侧", Status: AgentAssetSlotIgnored},
		},
	})
	if err != nil {
		t.Fatalf("SaveWorkflowAssetSlots returned error: %v", err)
	}
	if first.Version != 1 || first.Artifact.Artifact.ArtifactType != "asset_catalog" || first.Artifact.Artifact.ProducerInvocationID != nil || len(first.Artifact.ParentArtifactIds) != 1 {
		t.Fatalf("first=%#v", first)
	}

	second, err := SaveWorkflowAssetSlots("user-1", stage.ID, SaveWorkflowAssetSlotsInput{
		BaseArtifactHash: first.Artifact.Artifact.ContentHash,
		Slots:            []AgentAssetSlot{{SlotID: "slot-character-1", Category: AgentAssetCategoryCharacter, Name: "阿宁（雨夜）", Description: "年轻女性，黑色短发", Status: AgentAssetSlotBound, AssetID: "asset-1"}},
	})
	if err != nil || second.Version != 2 || second.Slots[0].SlotID != first.Slots[0].SlotID {
		t.Fatalf("second=%#v err=%v", second, err)
	}
	loaded, err := GetWorkflowAssetSlots("user-1", stage.ID)
	if err != nil || loaded.Version != 2 || loaded.Artifact.Artifact.ID != second.Artifact.Artifact.ID || loaded.Slots[0].Name != "阿宁（雨夜）" {
		t.Fatalf("loaded=%#v err=%v", loaded, err)
	}
	latest, err := workflowApprovedStandardArtifact("user-1", detail, WorkflowStageAssetExtraction, "asset_catalog")
	if err != nil || latest.Artifact.ID != second.Artifact.Artifact.ID {
		t.Fatalf("latest=%#v err=%v", latest, err)
	}
	if _, err := SaveWorkflowAssetSlots("user-1", stage.ID, SaveWorkflowAssetSlotsInput{BaseArtifactHash: base.Artifact.ContentHash, Slots: second.Slots}); err == nil {
		t.Fatal("stale correction hash must be rejected")
	}
}

func TestWorkflowAssetSlotsCanBeCorrectedBeforeStageApproval(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	detail = seedAssetCatalogForSlotsTest(t, detail, model.WorkflowStageRunStatusNeedsReview, `{"items":[{"assetId":"scene-001","kind":"scene","name":"雨夜街道","sourceEvidence":["雨夜街道"],"coreFacts":["积水反光"]}]}`)
	stage := workflowTestStage(detail, WorkflowStageAssetExtraction)
	base, err := GetArtifact("user-1", stage.OutputArtifactID)
	if err != nil {
		t.Fatal(err)
	}
	result, err := SaveWorkflowAssetSlots("user-1", stage.ID, SaveWorkflowAssetSlotsInput{BaseArtifactHash: base.Artifact.ContentHash, Slots: []AgentAssetSlot{{SlotID: "slot-scene-001", Category: AgentAssetCategoryScene, Name: "旧城雨夜街道", Description: "积水反光", Status: AgentAssetSlotPlaceholder}}})
	if err != nil || result.Version != 1 {
		t.Fatalf("result=%#v err=%v", result, err)
	}
}

func seedApprovedAssetCatalogForSlotsTest(t *testing.T, detail WorkflowRunDetail, payload string) WorkflowRunDetail {
	return seedAssetCatalogForSlotsTest(t, detail, model.WorkflowStageRunStatusApproved, payload)
}

func seedAssetCatalogForSlotsTest(t *testing.T, detail WorkflowRunDetail, status model.WorkflowStageRunStatus, payload string) WorkflowRunDetail {
	t.Helper()
	items, _, err := buildArtifacts("user-1", []CreateArtifactInput{{
		ArtifactType: "asset_catalog", SchemaVersion: coreArtifactSchemaVersion,
		ProjectID: detail.Run.ProjectID, EpisodeID: detail.Run.EpisodeID, Payload: json.RawMessage(payload),
	}}, false)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.CreateArtifact(items[0]); err != nil {
		t.Fatal(err)
	}
	stage := workflowTestStage(detail, WorkflowStageAssetExtraction)
	stage.Status = status
	stage.OutputArtifactID = items[0].ID
	stage.ReviewedArtifactHash = items[0].ContentHash
	if _, err := repository.SaveWorkflowStageRun(stage); err != nil {
		t.Fatal(err)
	}
	return mustWorkflowDetailForTest(t, detail.Run.ID)
}

func TestWorkflowAssetSlotsValidateIdentityAndBindings(t *testing.T) {
	tests := []struct {
		name  string
		slots []AgentAssetSlot
	}{
		{"duplicate id", []AgentAssetSlot{{SlotID: "slot-1", Category: AgentAssetCategoryCharacter, Name: "甲", Status: AgentAssetSlotPlaceholder}, {SlotID: "slot-1", Category: AgentAssetCategoryProp, Name: "乙", Status: AgentAssetSlotPlaceholder}}},
		{"bound without asset", []AgentAssetSlot{{SlotID: "slot-1", Category: AgentAssetCategoryCharacter, Name: "甲", Status: AgentAssetSlotBound}}},
		{"candidate without id", []AgentAssetSlot{{SlotID: "slot-1", Category: AgentAssetCategoryScene, Name: "雨夜街道", Status: AgentAssetSlotCandidate}}},
	}
	for _, item := range tests {
		t.Run(item.name, func(t *testing.T) {
			if err := ValidateAgentAssetSlots(item.slots); err == nil {
				t.Fatalf("slots accepted: %#v", item.slots)
			}
		})
	}
	if err := ValidateAgentAssetSlots([]AgentAssetSlot{{SlotID: "slot-1", Category: AgentAssetCategoryBlocking, Name: "站位", Status: AgentAssetSlotIgnored}}); err != nil {
		t.Fatal(err)
	}
}
