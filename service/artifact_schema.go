package service

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"regexp"
	"strings"

	"github.com/Masterminds/semver/v3"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/cyberphone/json-canonicalization/go/src/webpki.org/jsoncanonicalizer"
	"github.com/santhosh-tekuri/jsonschema/v5"
)

var artifactTypePattern = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

type ArtifactSchemaInput struct {
	ID           string         `json:"id,omitempty"`
	ArtifactType string         `json:"artifactType"`
	Version      string         `json:"version"`
	Schema       map[string]any `json:"schema"`
	ContentHash  string         `json:"contentHash,omitempty"`
	Core         bool           `json:"core"`
}

type ResolvedArtifactSchema struct {
	ID           string         `json:"id"`
	ArtifactType string         `json:"artifactType"`
	Version      string         `json:"version"`
	Schema       map[string]any `json:"schema"`
	ContentHash  string         `json:"contentHash"`
	Core         bool           `json:"core"`
}

func NormalizeArtifactSchema(input ArtifactSchemaInput) (ResolvedArtifactSchema, error) {
	artifactType := strings.TrimSpace(input.ArtifactType)
	if !artifactTypePattern.MatchString(artifactType) {
		return ResolvedArtifactSchema{}, errors.New("Artifact 类型格式不正确")
	}
	version := strings.TrimSpace(input.Version)
	if _, err := semver.StrictNewVersion(version); err != nil {
		return ResolvedArtifactSchema{}, fmt.Errorf("Artifact Schema 版本必须是严格 SemVer: %w", err)
	}
	if input.Schema == nil {
		return ResolvedArtifactSchema{}, errors.New("Artifact Schema 不能为空")
	}
	canonical, normalized, err := canonicalJSONObject(input.Schema)
	if err != nil {
		return ResolvedArtifactSchema{}, fmt.Errorf("Artifact Schema 无法序列化: %w", err)
	}
	if _, err := compileLocalJSONSchema(artifactSchemaResourceName(artifactType, version), canonical); err != nil {
		return ResolvedArtifactSchema{}, fmt.Errorf("Artifact Schema 无法编译: %w", err)
	}
	hash := sha256.Sum256(canonical)
	return ResolvedArtifactSchema{
		ID: strings.TrimSpace(input.ID), ArtifactType: artifactType, Version: version,
		Schema: normalized, ContentHash: "sha256:" + hex.EncodeToString(hash[:]), Core: input.Core,
	}, nil
}

func ResolveArtifactSchema(artifactType, version string) (ResolvedArtifactSchema, error) {
	stored, ok, err := repository.GetArtifactSchemaByTypeVersion(strings.TrimSpace(artifactType), strings.TrimSpace(version))
	if err != nil {
		return ResolvedArtifactSchema{}, err
	}
	if !ok {
		return ResolvedArtifactSchema{}, errors.New("Artifact Schema 不存在")
	}
	resolved, err := resolvedArtifactSchemaFromModel(stored)
	if err != nil {
		return ResolvedArtifactSchema{}, err
	}
	if resolved.ContentHash != stored.ContentHash {
		return ResolvedArtifactSchema{}, errors.New("Artifact Schema 内容哈希校验失败")
	}
	return resolved, nil
}

func ValidateArtifactPayload(schema ResolvedArtifactSchema, payload json.RawMessage) error {
	normalized, err := NormalizeArtifactSchema(ArtifactSchemaInput{
		ID: schema.ID, ArtifactType: schema.ArtifactType, Version: schema.Version,
		Schema: schema.Schema, Core: schema.Core,
	})
	if err != nil {
		return err
	}
	if normalized.ContentHash != schema.ContentHash {
		return errors.New("Artifact Schema 内容哈希校验失败")
	}
	canonicalSchema, _, err := canonicalJSONObject(normalized.Schema)
	if err != nil {
		return fmt.Errorf("Artifact Schema 无法序列化: %w", err)
	}
	compiled, err := compileLocalJSONSchema(artifactSchemaResourceName(schema.ArtifactType, schema.Version), canonicalSchema)
	if err != nil {
		return fmt.Errorf("Artifact Schema 无法编译: %w", err)
	}
	value, err := decodeCanonicalJSON(payload)
	if err != nil {
		return fmt.Errorf("Artifact payload 不是有效 JSON: %w", err)
	}
	if err := compiled.Validate(value); err != nil {
		return fmt.Errorf("Artifact payload 不符合 Schema: %w", err)
	}
	return nil
}

func ArtifactSchemaVersionMatches(version, constraint string) bool {
	parsedVersion, err := semver.StrictNewVersion(strings.TrimSpace(version))
	if err != nil {
		return false
	}
	parsedConstraint, err := semver.NewConstraint(strings.TrimSpace(constraint))
	return err == nil && parsedConstraint.Check(parsedVersion)
}

func ensureArtifactSchema(input ResolvedArtifactSchema) (ResolvedArtifactSchema, error) {
	normalized, err := NormalizeArtifactSchema(ArtifactSchemaInput{
		ID: input.ID, ArtifactType: input.ArtifactType, Version: input.Version,
		Schema: input.Schema, Core: input.Core,
	})
	if err != nil {
		return ResolvedArtifactSchema{}, err
	}
	if normalized.ID == "" {
		normalized.ID = artifactSchemaID(normalized)
	}
	schemaJSON, _, err := canonicalJSONObject(normalized.Schema)
	if err != nil {
		return ResolvedArtifactSchema{}, err
	}
	stored, err := repository.CreateArtifactSchema(model.ArtifactSchema{
		ID: normalized.ID, ArtifactType: normalized.ArtifactType, Version: normalized.Version,
		SchemaJSON: string(schemaJSON), ContentHash: normalized.ContentHash, Core: normalized.Core, CreatedAt: now(),
	})
	if err != nil {
		return ResolvedArtifactSchema{}, err
	}
	return resolvedArtifactSchemaFromModel(stored)
}

func resolvedArtifactSchemaFromModel(stored model.ArtifactSchema) (ResolvedArtifactSchema, error) {
	var schema map[string]any
	value, err := decodeCanonicalJSON([]byte(stored.SchemaJSON))
	if err != nil {
		return ResolvedArtifactSchema{}, fmt.Errorf("Artifact Schema 存储内容损坏: %w", err)
	}
	var ok bool
	schema, ok = value.(map[string]any)
	if !ok {
		return ResolvedArtifactSchema{}, errors.New("Artifact Schema 根节点必须是对象")
	}
	normalized, err := NormalizeArtifactSchema(ArtifactSchemaInput{
		ID: stored.ID, ArtifactType: stored.ArtifactType, Version: stored.Version,
		Schema: schema, Core: stored.Core,
	})
	if err != nil {
		return ResolvedArtifactSchema{}, err
	}
	return normalized, nil
}

func canonicalJSONObject(value map[string]any) ([]byte, map[string]any, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, nil, err
	}
	canonical, err := jsoncanonicalizer.Transform(raw)
	if err != nil {
		return nil, nil, err
	}
	normalizedValue, err := decodeCanonicalJSON(canonical)
	if err != nil {
		return nil, nil, err
	}
	normalized, ok := normalizedValue.(map[string]any)
	if !ok {
		return nil, nil, errors.New("JSON 根节点必须是对象")
	}
	return canonical, normalized, nil
}

func compileLocalJSONSchema(resourceName string, raw []byte) (*jsonschema.Schema, error) {
	resourceURL := "https://schemas.infinite-canvas.invalid/" + url.PathEscape(resourceName)
	compiler := jsonschema.NewCompiler()
	compiler.LoadURL = func(externalURL string) (io.ReadCloser, error) {
		return nil, fmt.Errorf("禁止外部 JSON Schema 引用: %s", externalURL)
	}
	if err := compiler.AddResource(resourceURL, bytes.NewReader(raw)); err != nil {
		return nil, err
	}
	return compiler.Compile(resourceURL)
}

func decodeCanonicalJSON(raw []byte) (any, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return nil, errors.New("JSON 包含多个顶层值")
		}
		return nil, err
	}
	return value, nil
}

func artifactSchemaResourceName(artifactType, version string) string {
	return "artifact-schema-" + artifactType + "-" + version + ".json"
}

func artifactSchemaID(schema ResolvedArtifactSchema) string {
	prefix := "artifact-schema-"
	if schema.Core {
		prefix += "core-"
	}
	return prefix + schema.ArtifactType + "-" + schema.Version
}
