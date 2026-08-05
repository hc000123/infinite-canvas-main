package service

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestWorkflowAdapterContentFidelityAllowsOnlyDeclaredV1Changes(t *testing.T) {
	tests := []struct {
		name, transformKind string
		before, after       map[string]any
	}{
		{
			name: "script outer trim", transformKind: "stage-script-normalize-v1",
			before: map[string]any{"productionScript": "  原台词\n动作不改  ", "title": "第一集"},
			after:  map[string]any{"productionScript": "原台词\n动作不改", "title": "第一集"},
		},
		{
			name: "missing asset id", transformKind: "stage-art-normalize-v1",
			before: map[string]any{"items": []any{map[string]any{"kind": "character", "name": "林秋"}, map[string]any{"assetId": "PROP-CUSTOM", "kind": "prop", "name": "钥匙"}}},
			after:  map[string]any{"items": []any{map[string]any{"assetId": "CHAR-001", "kind": "character", "name": "林秋"}, map[string]any{"assetId": "PROP-CUSTOM", "kind": "prop", "name": "钥匙"}}},
		},
		{
			name: "missing storyboard ids", transformKind: "stage-storyboard-normalize-v1",
			before: map[string]any{"shots": []any{map[string]any{"sourceScript": "进门", "shotDraft": map[string]any{"dialogue": "我回来了"}}}},
			after:  map[string]any{"shots": []any{map[string]any{"shotId": "shot-001", "sceneKey": "scene-001", "sourceScript": "进门", "shotDraft": map[string]any{"dialogue": "我回来了"}}}},
		},
		{
			name: "other adapter exact equality", transformKind: "stage-asset-brief-character-normalize-v1",
			before: map[string]any{"assetId": "CHAR-001", "brief": "正面", "format": "four-view"},
			after:  map[string]any{"assetId": "CHAR-001", "brief": "正面", "format": "four-view"},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			after, _ := json.Marshal(test.after)
			diff, err := workflowAdapterContentFidelity(test.transformKind, test.before, after)
			if err != nil || diff["contentChanged"] != false {
				t.Fatalf("diff=%+v err=%v", diff, err)
			}
		})
	}
}

func TestWorkflowAdapterContentFidelityRejectsMutationsWithPathReason(t *testing.T) {
	tests := []struct {
		name, transformKind string
		before, after       map[string]any
		wantPath            string
	}{
		{
			name: "dialogue changed", transformKind: "stage-storyboard-normalize-v1",
			before:   map[string]any{"shots": []any{map[string]any{"shotId": "shot-001", "sceneKey": "scene-001", "shotDraft": map[string]any{"dialogue": "原台词"}}}},
			after:    map[string]any{"shots": []any{map[string]any{"shotId": "shot-001", "sceneKey": "scene-001", "shotDraft": map[string]any{"dialogue": "篡改台词"}}}},
			wantPath: "$.shots[0].shotDraft.dialogue",
		},
		{
			name: "asset name changed", transformKind: "stage-art-normalize-v1",
			before:   map[string]any{"items": []any{map[string]any{"assetId": "CHAR-001", "kind": "character", "name": "林秋"}}},
			after:    map[string]any{"items": []any{map[string]any{"assetId": "CHAR-001", "kind": "character", "name": "林夏"}}},
			wantPath: "$.items[0].name",
		},
		{
			name: "entity deleted", transformKind: "stage-art-normalize-v1",
			before:   map[string]any{"items": []any{map[string]any{"kind": "character", "name": "林秋"}, map[string]any{"kind": "prop", "name": "钥匙"}}},
			after:    map[string]any{"items": []any{map[string]any{"assetId": "CHAR-001", "kind": "character", "name": "林秋"}}},
			wantPath: "$.items",
		},
		{
			name: "entity added", transformKind: "stage-storyboard-normalize-v1",
			before:   map[string]any{"shots": []any{map[string]any{"sourceScript": "进门"}}},
			after:    map[string]any{"shots": []any{map[string]any{"shotId": "shot-001", "sceneKey": "scene-001", "sourceScript": "进门"}, map[string]any{"shotId": "shot-002", "sceneKey": "scene-001", "sourceScript": "落座"}}},
			wantPath: "$.shots",
		},
		{
			name: "existing id changed", transformKind: "stage-storyboard-normalize-v1",
			before:   map[string]any{"shots": []any{map[string]any{"shotId": "shot-custom", "sceneKey": "scene-custom", "sourceScript": "进门"}}},
			after:    map[string]any{"shots": []any{map[string]any{"shotId": "shot-001", "sceneKey": "scene-custom", "sourceScript": "进门"}}},
			wantPath: "$.shots[0].shotId",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			after, _ := json.Marshal(test.after)
			diff, err := workflowAdapterContentFidelity(test.transformKind, test.before, after)
			if err != nil || diff["contentChanged"] != true {
				t.Fatalf("diff=%+v err=%v", diff, err)
			}
			reasons := strings.Join(diff["contentChangeReasons"].([]string), " ")
			if !strings.Contains(reasons, test.wantPath) {
				t.Fatalf("reasons=%q want path %q", reasons, test.wantPath)
			}
		})
	}
}

func TestExecuteWorkflowAdapterOutputsRejectsOneTamperedItemBeforeCreatingAnyArtifact(t *testing.T) {
	setupInvocationServiceTest(t)
	first := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "asset_brief", `{"assetId":"character-001","brief":"角色正面","format":"character-four-view"}`)
	second := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "asset_brief", `{"assetId":"character-002","brief":"角色侧面","format":"character-four-view"}`)
	original := workflowAdapterTransformRegistry
	workflowAdapterTransformRegistry = cloneWorkflowAdapterTransforms(original)
	t.Cleanup(func() { workflowAdapterTransformRegistry = original })
	kind := "stage-asset-brief-character-normalize-v1"
	workflowAdapterTransformRegistry[kind] = func(bindings []ResolvedArtifactBinding) (json.RawMessage, error) {
		payload := bindings[0].Artifact.Payload
		if payload["assetId"] == "character-002" {
			return json.RawMessage(`{"assetId":"character-002","brief":"被篡改","format":"character-four-view"}`), nil
		}
		return json.Marshal(payload)
	}
	adapter, err := ResolveWorkflowAdapter(WorkflowAdapterRef{AdapterID: "stage-asset-brief-character-normalize", AdapterVersion: "1.0.0"})
	if err != nil {
		t.Fatal(err)
	}
	refs := []ArtifactRefInput{
		{BindingName: "asset_brief", ArtifactID: first.Artifact.ID, ContentHash: first.Artifact.ContentHash},
		{BindingName: "asset_brief", ArtifactID: second.Artifact.ID, ContentHash: second.Artifact.ContentHash},
	}
	before, err := ListArtifacts("user-1", ArtifactQuery{ProjectID: "project-1", EpisodeID: "episode-1", ArtifactType: "asset_brief", PageSize: 100})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = ExecuteWorkflowAdapterOutputs("user-1", "project-1", "episode-1", adapter, refs); err == nil || !strings.Contains(err.Error(), "内容保真") {
		t.Fatalf("err=%v", err)
	}
	after, err := ListArtifacts("user-1", ArtifactQuery{ProjectID: "project-1", EpisodeID: "episode-1", ArtifactType: "asset_brief", PageSize: 100})
	if err != nil || after.Total != before.Total {
		t.Fatalf("before=%d after=%d err=%v", before.Total, after.Total, err)
	}
}
