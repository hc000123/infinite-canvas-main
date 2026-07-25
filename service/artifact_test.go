package service

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"gorm.io/gorm"
)

func TestCreateArtifactBuildsImmutableEnvelopeAndStableHash(t *testing.T) {
	setupArtifactServiceTest(t)
	first, err := CreateArtifact("user-1", CreateArtifactInput{
		ArtifactType: "source_text", SchemaVersion: "1.0.0", ProjectID: "project-1", EpisodeID: "episode-1",
		Payload: json.RawMessage(`{"text":"第一集","number":1}`),
	})
	if err == nil {
		t.Fatal("fixture should reject fields outside the locked schema")
	}
	first, err = CreateArtifact("user-1", CreateArtifactInput{
		ArtifactType: "source_text", SchemaVersion: "1.0.0", ProjectID: "project-1", EpisodeID: "episode-1",
		Payload: json.RawMessage(`{"text":"第一集"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	second, err := CreateArtifact("user-1", CreateArtifactInput{
		ArtifactType: "source_text", SchemaVersion: "1.0.0", ProjectID: "project-1", EpisodeID: "episode-1",
		Payload: json.RawMessage(` { "text" : "第一集" } `),
	})
	if err != nil {
		t.Fatal(err)
	}
	if first.Artifact.ID == second.Artifact.ID {
		t.Fatal("each import must create a new immutable identity")
	}
	if first.Artifact.ContentHash != second.Artifact.ContentHash {
		t.Fatalf("hash must ignore JSON formatting: %s != %s", first.Artifact.ContentHash, second.Artifact.ContentHash)
	}
	if first.Payload["text"] != "第一集" || first.Artifact.SchemaContentHash == "" {
		t.Fatalf("missing envelope data: %+v", first)
	}
	if first.Artifact.ProducerInvocationID != nil {
		t.Fatalf("manual import stored non-null producer: %v", first.Artifact.ProducerInvocationID)
	}
	stored, ok, err := repository.GetUserArtifact("user-1", first.Artifact.ID)
	if err != nil || !ok || stored.ProducerInvocationID != nil {
		t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
	}
}

func TestCreateArtifactRejectsInvalidManualImportFields(t *testing.T) {
	setupArtifactServiceTest(t)
	tests := []struct {
		name  string
		input CreateArtifactInput
	}{
		{"non source type", CreateArtifactInput{ArtifactType: "production_script", SchemaVersion: "1.0.0", Payload: json.RawMessage(`{"productionScript":"x"}`)}},
		{"extension", CreateArtifactInput{ArtifactType: "source_text", SchemaVersion: "1.0.0", Payload: json.RawMessage(`{"text":"x"}`), Extensions: map[string]json.RawMessage{"skill-forged": json.RawMessage(`{"trusted":true}`)}}},
		{"producer id", CreateArtifactInput{ArtifactType: "source_text", SchemaVersion: "1.0.0", ProducerInvocationID: "invocation-forged", Payload: json.RawMessage(`{"text":"x"}`)}},
		{"producer attempt", CreateArtifactInput{ArtifactType: "source_text", SchemaVersion: "1.0.0", ProducerAttempt: 1, Payload: json.RawMessage(`{"text":"x"}`)}},
		{"producer skill", CreateArtifactInput{ArtifactType: "source_text", SchemaVersion: "1.0.0", ProducerSkillID: "skill-forged", Payload: json.RawMessage(`{"text":"x"}`)}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := CreateArtifact("user-1", test.input); err == nil {
				t.Fatal("expected rejection")
			}
		})
	}
}

func TestCreateArtifactRejectsForeignStaleAndMismatchedParentLineage(t *testing.T) {
	setupArtifactServiceTest(t)
	foreign := mustCreateManualArtifact(t, "user-2", "project-1", "episode-1", "foreign")
	local := mustCreateManualArtifact(t, "user-1", "project-1", "episode-1", "local")
	tests := []struct {
		name string
		ref  ArtifactRefInput
		p, e string
	}{
		{"foreign", ArtifactRefInput{ArtifactID: foreign.Artifact.ID, ContentHash: foreign.Artifact.ContentHash}, "project-1", "episode-1"},
		{"stale hash", ArtifactRefInput{ArtifactID: local.Artifact.ID, ContentHash: "sha256:stale"}, "project-1", "episode-1"},
		{"project mismatch", ArtifactRefInput{ArtifactID: local.Artifact.ID, ContentHash: local.Artifact.ContentHash}, "project-2", "episode-1"},
		{"episode mismatch", ArtifactRefInput{ArtifactID: local.Artifact.ID, ContentHash: local.Artifact.ContentHash}, "project-1", "episode-2"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := CreateArtifact("user-1", CreateArtifactInput{
				ArtifactType: "source_text", SchemaVersion: "1.0.0", ProjectID: test.p, EpisodeID: test.e,
				ParentArtifactRefs: []ArtifactRefInput{test.ref}, Payload: json.RawMessage(`{"text":"child"}`),
			})
			if err == nil {
				t.Fatal("expected parent rejection")
			}
		})
	}
}

func TestCreateArtifactRecordsValidParentLineageInHash(t *testing.T) {
	setupArtifactServiceTest(t)
	parent := mustCreateManualArtifact(t, "user-1", "project-1", "episode-1", "parent")
	input := CreateArtifactInput{
		ArtifactType: "source_text", SchemaVersion: "1.0.0", ProjectID: "project-1", EpisodeID: "episode-1",
		ParentArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: parent.Artifact.ID, ContentHash: parent.Artifact.ContentHash}},
		Payload:            json.RawMessage(`{"text":"child"}`),
	}
	child, err := CreateArtifact("user-1", input)
	if err != nil {
		t.Fatal(err)
	}
	if len(child.ParentArtifactIds) != 1 || child.ParentArtifactIds[0] != parent.Artifact.ID {
		t.Fatalf("missing parent lineage: %+v", child.ParentArtifactIds)
	}
	withoutParent := input
	withoutParent.ParentArtifactRefs = nil
	root, err := CreateArtifact("user-1", withoutParent)
	if err != nil {
		t.Fatal(err)
	}
	if child.Artifact.ContentHash == root.Artifact.ContentHash {
		t.Fatal("parent references must contribute to Artifact content hash")
	}
	reloaded, err := GetArtifact("user-1", child.Artifact.ID)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.Artifact.ContentHash != child.Artifact.ContentHash || len(reloaded.ParentArtifactIds) != 1 || reloaded.ParentArtifactIds[0] != parent.Artifact.ID {
		t.Fatalf("persisted lineage did not reproduce the envelope: %+v", reloaded)
	}
}

func TestGetArtifactRejectsTamperedImmutableContent(t *testing.T) {
	setupArtifactServiceTest(t)
	parent := mustCreateManualArtifact(t, "user-1", "project-1", "episode-1", "parent")
	createChild := func(t *testing.T) ArtifactEnvelope {
		t.Helper()
		child, err := CreateArtifact("user-1", CreateArtifactInput{
			ArtifactType: "source_text", SchemaVersion: "1.0.0", ProjectID: "project-1", EpisodeID: "episode-1",
			ParentArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: parent.Artifact.ID, ContentHash: parent.Artifact.ContentHash}},
			Payload:            json.RawMessage(`{"text":"child"}`),
		})
		if err != nil {
			t.Fatal(err)
		}
		return child
	}
	tests := []struct {
		name   string
		column string
		value  any
	}{
		{"payload", "payload_json", `{"text":"tampered"}`},
		{"extensions", "extensions_json", `{"forged":true}`},
		{"parent refs", "parent_artifact_refs_json", `[{"bindingName":"source","artifactId":"` + parent.Artifact.ID + `","contentHash":"sha256:tampered"}]`},
		{"parent refs unknown field", "parent_artifact_refs_json", `[{"bindingName":"source","artifactId":"` + parent.Artifact.ID + `","contentHash":"` + parent.Artifact.ContentHash + `","forged":true}]`},
		{"content hash", "content_hash", "sha256:tampered"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			child := createChild(t)
			db, err := repository.DB()
			if err != nil {
				t.Fatal(err)
			}
			if err := db.Model(&model.Artifact{}).Where("id = ?", child.Artifact.ID).UpdateColumn(test.column, test.value).Error; err != nil {
				t.Fatal(err)
			}
			if _, err := GetArtifact("user-1", child.Artifact.ID); err == nil {
				t.Fatalf("tampered %s was accepted", test.column)
			}
		})
	}
}

func TestCreateArtifactRejectsParentWhosePayloadWasTampered(t *testing.T) {
	setupArtifactServiceTest(t)
	parent := mustCreateManualArtifact(t, "user-1", "project-1", "episode-1", "parent")
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.Artifact{}).Where("id = ?", parent.Artifact.ID).UpdateColumn("payload_json", `{"text":"tampered"}`).Error; err != nil {
		t.Fatal(err)
	}
	_, err = CreateArtifact("user-1", CreateArtifactInput{
		ArtifactType: "source_text", SchemaVersion: "1.0.0", ProjectID: "project-1", EpisodeID: "episode-1",
		ParentArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: parent.Artifact.ID, ContentHash: parent.Artifact.ContentHash}},
		Payload:            json.RawMessage(`{"text":"child"}`),
	})
	if err == nil {
		t.Fatal("tampered parent payload was trusted during child creation")
	}
}

func TestGetArtifactRejectsChildWhenParentPayloadWasTampered(t *testing.T) {
	setupArtifactServiceTest(t)
	parent := mustCreateManualArtifact(t, "user-1", "project-1", "episode-1", "parent")
	child, err := CreateArtifact("user-1", CreateArtifactInput{
		ArtifactType: "source_text", SchemaVersion: "1.0.0", ProjectID: "project-1", EpisodeID: "episode-1",
		ParentArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: parent.Artifact.ID, ContentHash: parent.Artifact.ContentHash}},
		Payload:            json.RawMessage(`{"text":"child"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.Artifact{}).Where("id = ?", parent.Artifact.ID).UpdateColumn("payload_json", `{"text":"tampered"}`).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := GetArtifact("user-1", child.Artifact.ID); err == nil {
		t.Fatal("child read trusted a parent with tampered payload")
	}
}

func TestGetArtifactRejectsCorruptedLineageCycle(t *testing.T) {
	setupArtifactServiceTest(t)
	parent := mustCreateManualArtifact(t, "user-1", "project-1", "episode-1", "parent")
	child, err := CreateArtifact("user-1", CreateArtifactInput{
		ArtifactType: "source_text", SchemaVersion: "1.0.0", ProjectID: "project-1", EpisodeID: "episode-1",
		ParentArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: parent.Artifact.ID, ContentHash: parent.Artifact.ContentHash}},
		Payload:            json.RawMessage(`{"text":"child"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	cycleRefs, err := canonicalArtifactRefs([]ArtifactRefInput{{BindingName: "cycle", ArtifactID: child.Artifact.ID, ContentHash: child.Artifact.ContentHash}})
	if err != nil {
		t.Fatal(err)
	}
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.Artifact{}).Where("id = ?", parent.Artifact.ID).UpdateColumn("parent_artifact_refs_json", string(cycleRefs)).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := GetArtifact("user-1", child.Artifact.ID); err == nil || !strings.Contains(err.Error(), "循环") {
		t.Fatalf("corrupted cycle was not rejected explicitly: %v", err)
	}
}

func TestListArtifactsQueryCountDoesNotGrowWithItemCount(t *testing.T) {
	setupArtifactServiceTest(t)
	for index := 0; index < 30; index++ {
		mustCreateManualArtifact(t, "user-1", "project-1", "episode-1", fmt.Sprintf("item-%d", index))
	}
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	var queries atomic.Int64
	const callbackName = "test:artifact-list-query-count"
	if err := db.Callback().Query().Before("gorm:query").Register(callbackName, func(_ *gorm.DB) { queries.Add(1) }); err != nil {
		t.Fatal(err)
	}

	count := func(pageSize int) int64 {
		queries.Store(0)
		list, err := ListArtifacts("user-1", ArtifactQuery{ProjectID: "project-1", EpisodeID: "episode-1", Page: 1, PageSize: pageSize})
		if err != nil || len(list.Items) != pageSize {
			t.Fatalf("pageSize=%d items=%d err=%v", pageSize, len(list.Items), err)
		}
		return queries.Load()
	}
	small, large := count(5), count(30)
	if large != small {
		t.Fatalf("list queries grew with item count: small=%d large=%d", small, large)
	}
}

func TestResolveArtifactRefsPreservesOrderAndFreezesSnapshots(t *testing.T) {
	setupArtifactServiceTest(t)
	first := mustCreateManualArtifact(t, "user-1", "project-1", "episode-1", "first")
	second := mustCreateManualArtifact(t, "user-1", "project-1", "episode-1", "second")
	refs := []ArtifactRefInput{
		{BindingName: "secondary", ArtifactID: second.Artifact.ID, ContentHash: second.Artifact.ContentHash},
		{BindingName: "primary", ArtifactID: first.Artifact.ID, ContentHash: first.Artifact.ContentHash},
	}
	envelopes, snapshots, err := ResolveArtifactRefs("user-1", refs)
	if err != nil {
		t.Fatal(err)
	}
	if envelopes[0].Artifact.ID != second.Artifact.ID || snapshots[0].BindingName != "secondary" || snapshots[1].ArtifactID != first.Artifact.ID {
		t.Fatalf("order was not preserved: envelopes=%+v snapshots=%+v", envelopes, snapshots)
	}
	for _, snapshot := range snapshots {
		if snapshot.ArtifactHash == "" || snapshot.SchemaID == "" || snapshot.SchemaContentHash == "" || snapshot.ArtifactType != "source_text" {
			t.Fatalf("incomplete snapshot: %+v", snapshot)
		}
	}
	if _, _, err := ResolveArtifactRefs("user-1", []ArtifactRefInput{refs[0], refs[0]}); err == nil {
		t.Fatal("expected duplicate binding/artifact rejection")
	}
	stale := refs[:1]
	stale[0].ContentHash = "sha256:stale"
	if _, _, err := ResolveArtifactRefs("user-1", stale); err == nil {
		t.Fatal("expected stale reference rejection")
	}
}

func TestGetAndListArtifactsReturnDecodedEnvelopes(t *testing.T) {
	setupArtifactServiceTest(t)
	first := mustCreateManualArtifact(t, "user-1", "project-1", "episode-1", "first")
	_ = mustCreateManualArtifact(t, "user-1", "project-2", "episode-2", "second")
	_ = mustCreateManualArtifact(t, "user-2", "project-1", "episode-1", "foreign")

	got, err := GetArtifact("user-1", first.Artifact.ID)
	if err != nil || got.Payload["text"] != "first" {
		t.Fatalf("got=%+v err=%v", got, err)
	}
	list, err := ListArtifacts("user-1", ArtifactQuery{ProjectID: "project-1", EpisodeID: "episode-1", ArtifactType: "source_text", PageSize: 9999})
	if err != nil {
		t.Fatal(err)
	}
	if list.Total != 1 || len(list.Items) != 1 || list.Page != 1 || list.PageSize != 500 {
		t.Fatalf("unexpected list: %+v", list)
	}
}

func TestProducedArtifactExtensionsRequireExactProducerSkillNamespace(t *testing.T) {
	setupArtifactServiceTest(t)
	valid := CreateArtifactInput{
		ArtifactType: "production_script", SchemaVersion: "1.0.0", ProducerInvocationID: "invocation-1", ProducerAttempt: 1, ProducerSkillID: "skill-1",
		Payload: json.RawMessage(`{"productionScript":"x"}`), Extensions: map[string]json.RawMessage{"skill-1": json.RawMessage(`{"note":"ok"}`)},
	}
	items, _, err := buildProducedArtifacts("user-1", []CreateArtifactInput{valid})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok, err := repository.GetUserArtifact("user-1", items[0].ID); err != nil || ok {
		t.Fatalf("produced builder must not persist: ok=%v err=%v", ok, err)
	}
	for _, key := range []string{"skill-2", "skill-1.extra"} {
		forged := valid
		forged.Extensions = map[string]json.RawMessage{key: json.RawMessage(`{"trusted":true}`)}
		if _, _, err := buildProducedArtifacts("user-1", []CreateArtifactInput{forged}); err == nil || !strings.Contains(err.Error(), "命名空间") {
			t.Fatalf("extension %q accepted: %v", key, err)
		}
	}
}

func TestProducedArtifactHashCanonicalizesEquivalentExtensionNumbers(t *testing.T) {
	setupArtifactServiceTest(t)
	base := CreateArtifactInput{
		ArtifactType: "production_script", SchemaVersion: "1.0.0", ProducerInvocationID: "invocation-1", ProducerAttempt: 1, ProducerSkillID: "skill-1",
		Payload: json.RawMessage(`{"productionScript":"x"}`),
	}
	first := base
	first.Extensions = map[string]json.RawMessage{"skill-1": json.RawMessage(`{"score":1}`)}
	second := base
	second.Extensions = map[string]json.RawMessage{"skill-1": json.RawMessage(`{"score":1.0}`)}
	_, created, err := buildProducedArtifacts("user-1", []CreateArtifactInput{first, second})
	if err != nil {
		t.Fatal(err)
	}
	if created[0].Artifact.ContentHash != created[1].Artifact.ContentHash {
		t.Fatalf("JCS-equivalent numbers changed content hash: %s != %s", created[0].Artifact.ContentHash, created[1].Artifact.ContentHash)
	}
}

func setupArtifactServiceTest(t *testing.T) {
	t.Helper()
	setupAITaskTestDB(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
}

func mustCreateManualArtifact(t *testing.T, userID, projectID, episodeID, text string) ArtifactEnvelope {
	t.Helper()
	result, err := CreateArtifact(userID, CreateArtifactInput{
		ArtifactType: "source_text", SchemaVersion: "1.0.0", ProjectID: projectID, EpisodeID: episodeID,
		Payload: json.RawMessage(`{"text":` + string(mustJSON(t, text)) + `}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
