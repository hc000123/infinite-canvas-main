package service

import (
	"embed"
	"errors"
	"fmt"
)

const coreArtifactSchemaVersion = "1.0.0"

var coreArtifactTypes = []string{
	"source_text",
	"production_script",
	"content_profile",
	"asset_catalog",
	"asset_record",
	"asset_brief",
	"asset_rendition",
	"storyboard_package",
	"video_prompt_package",
	"delivery_report",
}

var artifactSchemaGoldenHashes = map[string]string{
	"source_text":          "sha256:6ac1160962a38436b85e26219f7556804985ab86a06c6ab49a02bb13c530d5f4",
	"production_script":    "sha256:4ec19308b29195b794c3e22074dc14351f631fd4b67eb80d51e33e6b0f9de8f7",
	"content_profile":      "sha256:dd5118967748de321b8535e1fa7809a63d244d364001bc69877ea89d94407d92",
	"asset_catalog":        "sha256:11a3ba219b0099ae6fdfcb500311e4109a38a2563f68fe05c44a815dead2d22a",
	"asset_record":         "sha256:6711dfb57252d237ee15a34878a243611c692b9e811405250bdfbfd05984b2d9",
	"asset_brief":          "sha256:353fe079694efba0ddbf1e3c7f0c0f9212129486f08876c5a1501b4410b3569b",
	"asset_rendition":      "sha256:b56907d5573cde2a94c3ac7827a4ec970703f3f502eda0612b85846e3f94b05d",
	"storyboard_package":   "sha256:7510ec56b8928bc8427718ab7f1925978aa78aa62761b21bcea0ae3eb3e6f362",
	"video_prompt_package": "sha256:56e2c9b6b8c4e33fecec45e9831f65413330502cb59eacabf11c0f227fd45803",
	"delivery_report":      "sha256:91b6acfe422e748a3bbbe0746930fb544b7ae6c978a59ebdf08849975116d73f",
}

//go:embed artifact_schema_fixtures/*.json
var coreArtifactSchemaFixtures embed.FS

func EnsureCoreArtifactSchemas() error {
	for _, artifactType := range coreArtifactTypes {
		seed, err := loadCoreArtifactSchema(artifactType)
		if err != nil {
			return err
		}
		want := artifactSchemaGoldenHashes[artifactType]
		if want == "" || seed.ContentHash != want {
			return fmt.Errorf("Artifact Schema golden hash 不匹配: %s hash=%s want=%s", artifactType, seed.ContentHash, want)
		}
		if _, err := ensureArtifactSchema(seed); err != nil {
			return err
		}
	}
	return nil
}

func coreArtifactSchemaByType(artifactType string) ResolvedArtifactSchema {
	seed, _ := loadCoreArtifactSchema(artifactType)
	return seed
}

func loadCoreArtifactSchema(artifactType string) (ResolvedArtifactSchema, error) {
	if _, ok := artifactSchemaGoldenHashes[artifactType]; !ok {
		return ResolvedArtifactSchema{}, errors.New("Core Artifact Schema 类型不存在")
	}
	raw, err := coreArtifactSchemaFixtures.ReadFile("artifact_schema_fixtures/" + artifactType + ".json")
	if err != nil {
		return ResolvedArtifactSchema{}, err
	}
	var schema map[string]any
	decoderValue, err := decodeCanonicalJSON(raw)
	if err != nil {
		return ResolvedArtifactSchema{}, err
	}
	var ok bool
	schema, ok = decoderValue.(map[string]any)
	if !ok {
		return ResolvedArtifactSchema{}, errors.New("Core Artifact Schema 根节点必须是对象")
	}
	seed, err := NormalizeArtifactSchema(ArtifactSchemaInput{
		ArtifactType: artifactType, Version: coreArtifactSchemaVersion, Schema: schema, Core: true,
	})
	if err != nil {
		return ResolvedArtifactSchema{}, err
	}
	seed.ID = artifactSchemaID(seed)
	return seed, nil
}
