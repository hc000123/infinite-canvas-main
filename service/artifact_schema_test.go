package service

import (
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestNormalizeArtifactSchemaUsesStableHashAndSemver(t *testing.T) {
	first, err := NormalizeArtifactSchema(ArtifactSchemaInput{
		ArtifactType: " source_text ",
		Version:      "1.0.0",
		Schema: map[string]any{
			"required": []any{"text"},
			"type":     "object",
			"properties": map[string]any{
				"text": map[string]any{"type": "string"},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	second, err := NormalizeArtifactSchema(ArtifactSchemaInput{
		ArtifactType: "source_text",
		Version:      "1.0.0",
		Schema: map[string]any{
			"properties": map[string]any{
				"text": map[string]any{"type": "string"},
			},
			"type":     "object",
			"required": []any{"text"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if first.ContentHash != second.ContentHash || !strings.HasPrefix(first.ContentHash, "sha256:") {
		t.Fatalf("unstable hash: first=%s second=%s", first.ContentHash, second.ContentHash)
	}
	if _, err := NormalizeArtifactSchema(ArtifactSchemaInput{ArtifactType: "source_text", Version: "1.0", Schema: first.Schema}); err == nil {
		t.Fatal("expected strict semver error")
	}
}

func TestNormalizeArtifactSchemaCanonicalizesEquivalentJSONNumbers(t *testing.T) {
	var hashes []string
	for _, number := range []string{"1", "1.0", "1e0"} {
		value, err := decodeCanonicalJSON([]byte(`{"type":"number","minimum":` + number + `}`))
		if err != nil {
			t.Fatal(err)
		}
		schema, ok := value.(map[string]any)
		if !ok {
			t.Fatal("schema must decode to an object")
		}
		normalized, err := NormalizeArtifactSchema(ArtifactSchemaInput{ArtifactType: "numeric_test", Version: "1.0.0", Schema: schema})
		if err != nil {
			t.Fatal(err)
		}
		hashes = append(hashes, normalized.ContentHash)
	}
	if hashes[0] != hashes[1] || hashes[1] != hashes[2] {
		t.Fatalf("equivalent JSON numbers produced different hashes: %v", hashes)
	}
}

func TestJSONSchemaCompilerRejectsExternalFileReference(t *testing.T) {
	secretPath := filepath.Join(t.TempDir(), "secret-schema.json")
	if err := os.WriteFile(secretPath, []byte(`{"type":"string"}`), 0600); err != nil {
		t.Fatal(err)
	}
	ref := (&url.URL{Scheme: "file", Path: secretPath}).String()
	schema := map[string]any{"$ref": ref}
	_, artifactErr := NormalizeArtifactSchema(ArtifactSchemaInput{ArtifactType: "external_ref_test", Version: "1.0.0", Schema: schema})
	_, skillErr := compileSkillOutputSchema(SkillOutputContract{SchemaVersion: "1.0.0", Schema: schema})
	for name, err := range map[string]error{"artifact": artifactErr, "skill": skillErr} {
		if err == nil || !strings.Contains(err.Error(), "禁止外部") {
			t.Fatalf("%s compiler did not explicitly reject external ref: %v", name, err)
		}
	}
}

func TestArtifactSchemaCompatibilityUsesSemverConstraints(t *testing.T) {
	if !ArtifactSchemaVersionMatches("1.2.3", ">=1.0 <2.0") {
		t.Fatal("expected match")
	}
	if ArtifactSchemaVersionMatches("2.0.0", ">=1.0 <2.0") {
		t.Fatal("unexpected match")
	}
	for _, invalid := range []struct{ version, constraint string }{
		{"1.2", ">=1.0 <2.0"},
		{"1.2.3", "not-semver"},
	} {
		if ArtifactSchemaVersionMatches(invalid.version, invalid.constraint) {
			t.Fatalf("invalid input matched: %+v", invalid)
		}
	}
}

func TestValidateArtifactPayloadRejectsChangedSchemaSnapshot(t *testing.T) {
	seed := coreArtifactSchemaByType("source_text")
	seed.Schema["additionalProperties"] = true
	if err := ValidateArtifactPayload(seed, json.RawMessage(`{"text":"x","forged":true}`)); err == nil {
		t.Fatal("changed schema snapshot must not validate under the frozen content hash")
	}
}

func TestCoreAssetSchemasSupportCostumeAssets(t *testing.T) {
	tests := []struct {
		artifactType string
		payload      string
	}{
		{"asset_catalog", `{"items":[{"assetId":"costume-001","kind":"costume","name":"旧棉衣","sourceEvidence":["主角穿着旧棉衣"],"coreFacts":["褐色"]}]}`},
		{"asset_record", `{"assetId":"costume-001","kind":"costume","name":"旧棉衣","coreFacts":["褐色"]}`},
	}
	for _, test := range tests {
		t.Run(test.artifactType, func(t *testing.T) {
			if err := ValidateArtifactPayload(coreArtifactSchemaByType(test.artifactType), json.RawMessage(test.payload)); err != nil {
				t.Fatalf("costume asset rejected: %v", err)
			}
		})
	}
}

func TestCreateArtifactSchemaRejectsChangedSameVersion(t *testing.T) {
	setupAITaskTestDB(t)
	first, err := NormalizeArtifactSchema(ArtifactSchemaInput{
		ArtifactType: "source_text",
		Version:      "1.0.0",
		Core:         true,
		Schema: map[string]any{
			"type": "object", "required": []any{"text"},
			"properties": map[string]any{"text": map[string]any{"type": "string"}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ensureArtifactSchema(first); err != nil {
		t.Fatal(err)
	}
	changed := first
	changed.Schema = map[string]any{
		"type": "object", "required": []any{"different"},
		"properties": map[string]any{"different": map[string]any{"type": "string"}},
	}
	changed.ContentHash = ""
	if _, err := ensureArtifactSchema(changed); err == nil || !strings.Contains(err.Error(), "Artifact Schema 版本内容冲突") {
		t.Fatalf("expected content conflict, got %v", err)
	}
}

func TestEnsureCoreArtifactSchemasRejectsChangedSameVersion(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	seed := coreArtifactSchemaByType("source_text")
	seed.Schema["required"] = []string{"different"}
	seed.ContentHash = ""
	if _, err := ensureArtifactSchema(seed); err == nil {
		t.Fatal("expected content conflict")
	}
}

func TestCoreArtifactSchemaFixturesMatchGoldenHashes(t *testing.T) {
	if len(artifactSchemaGoldenHashes) != 10 {
		t.Fatalf("golden hashes=%d want=10", len(artifactSchemaGoldenHashes))
	}
	for artifactType, want := range artifactSchemaGoldenHashes {
		seed := coreArtifactSchemaByType(artifactType)
		if seed.ArtifactType != artifactType || seed.Version != "1.0.0" || !seed.Core {
			t.Fatalf("invalid seed for %s: %+v", artifactType, seed)
		}
		if seed.ContentHash != want || !strings.HasPrefix(want, "sha256:") {
			t.Fatalf("%s hash=%s want=%s", artifactType, seed.ContentHash, want)
		}
	}
}

func TestCoreArtifactSchemasEnforceLockedIdentities(t *testing.T) {
	tests := []struct {
		artifactType string
		valid        string
		invalid      string
	}{
		{"source_text", `{"text":"第一集"}`, `{"text":"第一集","extra":true}`},
		{"production_script", `{"productionScript":"制作稿"}`, `{"script":"制作稿"}`},
		{"content_profile", `{"routingTags":[{"tag":"男频","evidence":["主角成长"],"confidence":0.9}]}`, `{"routingTags":[{"tag":"男频","evidence":[],"confidence":2}]}`},
		{"asset_catalog", `{"items":[{"assetId":"character-001","kind":"character","name":"主角","sourceEvidence":["第一场"],"coreFacts":["黑发"]}]}`, `{"items":[{"logicalAssetId":"legacy","kind":"character","name":"主角","sourceEvidence":[],"coreFacts":[]}]}`},
		{"asset_record", `{"assetId":"prop-001","kind":"prop","name":"戒指","coreFacts":["银色"]}`, `{"assetId":"prop-001","kind":"prop","name":"戒指","coreFacts":[],"extra":true}`},
		{"asset_brief", `{"assetId":"scene-001","brief":"雨夜街道","format":"vertical"}`, `{"assetId":"scene-001","brief":"雨夜街道"}`},
		{"asset_rendition", `{"assetId":"scene-001","renditionId":"rendition-001","mediaType":"image","mediaRef":"asset://rendition-001","generationMetadata":{"model":"test"}}`, `{"logicalAssetId":"scene-001","renditionId":"rendition-001","mediaType":"image","mediaRef":"asset://rendition-001","generationMetadata":{}}`},
		{"storyboard_package", `{"shots":[{"shotId":"shot-001","sceneKey":"scene-001","sourceScript":"走入雨中","shotDraft":{"shotSize":"中景","camera":"平视","movement":"跟拍","action":"走入雨中","performance":"克制","dialogue":"","durationSeconds":6,"continuityMode":"continuous"}}]}`, `{"shots":[{"shotId":"shot-001","sceneKey":"scene-001","sourceScript":"走入雨中"}]}`},
		{"video_prompt_package", `{"items":[{"shotId":"shot-001","prompt":"人物走入雨中","inputArtifactRefs":[{"artifactId":"artifact-001","contentHash":"sha256:deadbeef"}]}]}`, `{"items":[{"shotId":"shot-001","prompt":"人物走入雨中","inputArtifactRefs":[],"extra":true}]}`},
		{"delivery_report", `{"summary":"1 条成功","succeeded":[{"shotId":"shot-001","output":"video://shot-001"}],"failed":[],"retrySuggestions":[],"exportManifest":[{"shotId":"shot-001","file":"shot-001.mp4","status":"ready"}]}`, `{"summary":"1 条成功","succeeded":[],"failed":[],"retrySuggestions":[]}`},
	}
	for _, test := range tests {
		t.Run(test.artifactType, func(t *testing.T) {
			seed := coreArtifactSchemaByType(test.artifactType)
			if err := ValidateArtifactPayload(seed, json.RawMessage(test.valid)); err != nil {
				t.Fatalf("valid payload rejected: %v", err)
			}
			if err := ValidateArtifactPayload(seed, json.RawMessage(test.invalid)); err == nil {
				t.Fatal("invalid payload accepted")
			}
		})
	}
}

func TestFreshBootstrapSeedsSchemasBeforeArtifactRoutes(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	resolved, err := ResolveArtifactSchema("source_text", "1.0.0")
	if err != nil {
		t.Fatal(err)
	}
	if resolved.ArtifactType != "source_text" || resolved.Version != "1.0.0" {
		t.Fatalf("unexpected schema: %+v", resolved)
	}
	stored, ok, err := repository.GetArtifactSchemaByTypeVersion("source_text", "1.0.0")
	if err != nil || !ok || stored.ContentHash != resolved.ContentHash {
		t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
	}
}

func TestCreateArtifactSchemaReturnsSameStoredRowForSameContent(t *testing.T) {
	setupAITaskTestDB(t)
	schema := model.ArtifactSchema{
		ID: "schema-first", ArtifactType: "source_text", Version: "1.0.0",
		SchemaJSON: `{"type":"object"}`, ContentHash: "sha256:same", Core: true,
	}
	first, err := repository.CreateArtifactSchema(schema)
	if err != nil {
		t.Fatal(err)
	}
	schema.ID = "schema-second"
	second, err := repository.CreateArtifactSchema(schema)
	if err != nil {
		t.Fatal(err)
	}
	if second.ID != first.ID {
		t.Fatalf("same content created a second identity: first=%s second=%s", first.ID, second.ID)
	}
}
