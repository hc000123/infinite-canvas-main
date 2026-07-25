package repository

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestArtifactRepositoryCreatesAndReadsOnlyOwnedRows(t *testing.T) {
	setupRepositoryTestDB(t)
	item := model.Artifact{
		ID: "artifact-1", UserID: "user-1", ArtifactType: "source_text",
		SchemaID: "schema-1", SchemaVersion: "1.0.0", SchemaContentHash: "sha256:schema",
		PayloadJSON: `{"text":"original"}`, ExtensionsJSON: `{}`, ContentHash: "sha256:artifact",
		CreatedAt: "2026-07-26T00:00:00Z",
	}
	if _, err := CreateArtifact(item); err != nil {
		t.Fatal(err)
	}
	if _, ok, err := GetUserArtifact("user-2", item.ID); err != nil || ok {
		t.Fatalf("foreign read ok=%v err=%v", ok, err)
	}
	stored, ok, err := GetUserArtifact("user-1", item.ID)
	if err != nil || !ok || stored.PayloadJSON != item.PayloadJSON {
		t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
	}

	changed := item
	changed.PayloadJSON = `{"text":"changed"}`
	if _, err := CreateArtifact(changed); err == nil {
		t.Fatal("create-only repository must reject duplicate artifact IDs")
	}
	stored, _, _ = GetUserArtifact("user-1", item.ID)
	if stored.PayloadJSON != item.PayloadJSON {
		t.Fatalf("duplicate create mutated immutable artifact: %s", stored.PayloadJSON)
	}
}

func TestArtifactRepositoryListsWithBasicFiltersAndPagination(t *testing.T) {
	setupRepositoryTestDB(t)
	producer := "invocation-1"
	items := []model.Artifact{
		{ID: "artifact-1", UserID: "user-1", ArtifactType: "source_text", ProjectID: "project-1", EpisodeID: "episode-1", PayloadJSON: `{}`, ExtensionsJSON: `{}`, ContentHash: "sha256:1", CreatedAt: "2026-07-26T01:00:00Z"},
		{ID: "artifact-2", UserID: "user-1", ArtifactType: "production_script", ProjectID: "project-1", EpisodeID: "episode-1", ProducerInvocationID: &producer, PayloadJSON: `{}`, ExtensionsJSON: `{}`, ContentHash: "sha256:2", CreatedAt: "2026-07-26T02:00:00Z"},
		{ID: "artifact-3", UserID: "user-1", ArtifactType: "production_script", ProjectID: "project-2", EpisodeID: "episode-2", PayloadJSON: `{}`, ExtensionsJSON: `{}`, ContentHash: "sha256:3", CreatedAt: "2026-07-26T03:00:00Z"},
		{ID: "artifact-foreign", UserID: "user-2", ArtifactType: "production_script", ProjectID: "project-1", EpisodeID: "episode-1", ProducerInvocationID: &producer, PayloadJSON: `{}`, ExtensionsJSON: `{}`, ContentHash: "sha256:4", CreatedAt: "2026-07-26T04:00:00Z"},
	}
	for _, item := range items {
		if _, err := CreateArtifact(item); err != nil {
			t.Fatal(err)
		}
	}
	got, total, err := ListUserArtifacts("user-1", ArtifactQuery{ProjectID: "project-1", EpisodeID: "episode-1", ArtifactType: "production_script", ProducerInvocationID: producer, Page: 1, PageSize: 1})
	if err != nil {
		t.Fatal(err)
	}
	if total != 1 || len(got) != 1 || got[0].ID != "artifact-2" {
		t.Fatalf("items=%+v total=%d", got, total)
	}
}

func TestArtifactRepositoryBatchReadIsUserScopedAndExplicit(t *testing.T) {
	setupRepositoryTestDB(t)
	for _, item := range []model.Artifact{
		{ID: "artifact-1", UserID: "user-1", PayloadJSON: `{}`, ExtensionsJSON: `{}`, ContentHash: "sha256:1"},
		{ID: "artifact-2", UserID: "user-1", PayloadJSON: `{}`, ExtensionsJSON: `{}`, ContentHash: "sha256:2"},
		{ID: "artifact-foreign", UserID: "user-2", PayloadJSON: `{}`, ExtensionsJSON: `{}`, ContentHash: "sha256:3"},
	} {
		if _, err := CreateArtifact(item); err != nil {
			t.Fatal(err)
		}
	}
	items, err := GetUserArtifactsByIDs("user-1", []string{"artifact-2", "artifact-1", "artifact-2", "artifact-foreign", "missing"})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 || items["artifact-1"].UserID != "user-1" || items["artifact-2"].UserID != "user-1" {
		t.Fatalf("unexpected batch result: %+v", items)
	}
}
