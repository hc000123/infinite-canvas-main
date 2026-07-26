package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestInvocationAssetCatalogValidatorRejectsDuplicateStableIDs(t *testing.T) {
	validator, err := invocationBusinessValidatorFor("asset_catalog")
	if err != nil {
		t.Fatal(err)
	}
	payload := map[string]any{"items": []any{
		map[string]any{"assetId": "character-001", "kind": "character", "name": "林秋", "sourceEvidence": []any{"林秋站在站牌下。"}, "coreFacts": []any{"主要角色"}},
		map[string]any{"assetId": "character-001", "kind": "character", "name": "另一个人", "sourceEvidence": []any{"另一个人走来。"}, "coreFacts": []any{"路人"}},
	}}
	if err := validator.Check(payload); err == nil || !strings.Contains(err.Error(), "重复") {
		t.Fatalf("err=%v", err)
	}
}

func TestInvocationAssetCatalogValidatorRequiresExactScriptEvidence(t *testing.T) {
	validator, _ := invocationBusinessValidatorFor("asset_catalog")
	payload := map[string]any{"items": []any{map[string]any{
		"assetId": "character-001", "kind": "character", "name": "林秋",
		"sourceEvidence": []any{"林秋在公交站等车。"}, "coreFacts": []any{"主要角色"},
	}}}
	bindings := []ResolvedArtifactBinding{{BindingName: "production_script", Artifact: ArtifactEnvelope{Artifact: model.Artifact{ID: "script-1", ArtifactType: "production_script", ContentHash: "sha256:script"}, Payload: map[string]any{"productionScript": "林秋站在站牌下，手里捏着一张折起的车票。"}}}}
	raw, _ := json.Marshal(bindings)
	err := validateInvocationBusinessPayload(validator, payload, model.InvocationPreflightRevision{InputSnapshotJSON: string(raw)})
	if err == nil || !strings.Contains(err.Error(), "原文") {
		t.Fatalf("err=%v", err)
	}
}

func TestInvocationStoryboardValidatorEnforcesDurationDialogueAndSource(t *testing.T) {
	validator, _ := invocationBusinessValidatorFor("storyboard_package")
	payload := map[string]any{"shots": []any{map[string]any{
		"shotId": "shot-001", "sceneKey": "scene-001", "sourceScript": "不存在的改写文本",
		"shotDraft": map[string]any{"shotSize": "中景", "camera": "平视", "movement": "推近", "action": "林秋上车", "performance": "克制", "dialogue": "这是一段远远超过镜头时长可承载范围的台词", "durationSeconds": float64(2), "continuityMode": "continuous"},
	}}}
	bindings := []ResolvedArtifactBinding{{BindingName: "production_script", Artifact: ArtifactEnvelope{Artifact: model.Artifact{ID: "script-1", ArtifactType: "production_script"}, Payload: map[string]any{"productionScript": "林秋把车票收进口袋，向车门走去。"}}}}
	raw, _ := json.Marshal(bindings)
	err := validateInvocationBusinessPayload(validator, payload, model.InvocationPreflightRevision{InputSnapshotJSON: string(raw)})
	if err == nil || !strings.Contains(err.Error(), "4–15") || !strings.Contains(err.Error(), "原剧本") {
		t.Fatalf("err=%v", err)
	}
}

func TestInvocationVideoPromptValidatorRequiresStructureAndExactRefs(t *testing.T) {
	validator, _ := invocationBusinessValidatorFor("video_prompt_package")
	payload := map[string]any{"items": []any{map[string]any{
		"shotId": "shot-001", "prompt": "林秋走向公交车。@图0",
		"inputArtifactRefs": []any{map[string]any{"bindingName": "first_frame", "artifactId": "tail-frame-1", "contentHash": "sha256:forged"}},
	}}}
	bindings := []ResolvedArtifactBinding{{BindingName: "asset_rendition", Artifact: ArtifactEnvelope{
		Artifact:   model.Artifact{ID: "tail-frame-1", ArtifactType: "asset_rendition", ContentHash: "sha256:tail"},
		Extensions: map[string]any{"workflow_media_import": map[string]any{"role": "continuity_reference"}},
	}}}
	raw, _ := json.Marshal(bindings)
	err := validateInvocationBusinessPayload(validator, payload, model.InvocationPreflightRevision{InputSnapshotJSON: string(raw)})
	if err == nil || !strings.Contains(err.Error(), "四段") || !strings.Contains(err.Error(), "引用") || !strings.Contains(err.Error(), "首帧") {
		t.Fatalf("err=%v", err)
	}
}
