package service

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/cyberphone/json-canonicalization/go/src/webpki.org/jsoncanonicalizer"
	"github.com/santhosh-tekuri/jsonschema/v5"
)

type ArtifactRefInput struct {
	BindingName string `json:"bindingName"`
	ArtifactID  string `json:"artifactId"`
	ContentHash string `json:"contentHash"`
}

type CreateArtifactInput struct {
	ArtifactType         string                     `json:"artifactType"`
	SchemaVersion        string                     `json:"schemaVersion"`
	ProjectID            string                     `json:"projectId"`
	EpisodeID            string                     `json:"episodeId"`
	ParentArtifactRefs   []ArtifactRefInput         `json:"parentArtifactRefs"`
	ProducerInvocationID string                     `json:"-"`
	ProducerAttempt      int                        `json:"-"`
	ProducerSkillID      string                     `json:"-"`
	Payload              json.RawMessage            `json:"payload"`
	Extensions           map[string]json.RawMessage `json:"extensions"`
}

type ArtifactEnvelope struct {
	Artifact          model.Artifact `json:"artifact"`
	ParentArtifactIds []string       `json:"parentArtifactIds"`
	Payload           map[string]any `json:"payload"`
	Extensions        map[string]any `json:"extensions"`
}

type ArtifactRefSnapshot struct {
	BindingName       string         `json:"bindingName"`
	ArtifactID        string         `json:"artifactId"`
	ArtifactHash      string         `json:"artifactHash"`
	ArtifactType      string         `json:"artifactType"`
	SchemaID          string         `json:"schemaId"`
	SchemaVersion     string         `json:"schemaVersion"`
	SchemaContentHash string         `json:"schemaContentHash"`
	Schema            map[string]any `json:"schema"`
	ProjectID         string         `json:"projectId"`
	EpisodeID         string         `json:"episodeId"`
}

type ArtifactQuery struct {
	ProjectID            string `json:"projectId"`
	EpisodeID            string `json:"episodeId"`
	ArtifactType         string `json:"artifactType"`
	ProducerInvocationID string `json:"producerInvocationId"`
	ApprovalState        string `json:"approvalState"`
	Page                 int    `json:"page"`
	PageSize             int    `json:"pageSize"`
}

type ArtifactList struct {
	Items    []ArtifactEnvelope `json:"items"`
	Total    int64              `json:"total"`
	Page     int                `json:"page"`
	PageSize int                `json:"pageSize"`
}

func CreateArtifact(userID string, input CreateArtifactInput) (ArtifactEnvelope, error) {
	if strings.TrimSpace(input.ArtifactType) != "source_text" {
		return ArtifactEnvelope{}, errors.New("手动导入只允许创建 source_text Artifact")
	}
	if len(input.Extensions) != 0 {
		return ArtifactEnvelope{}, errors.New("手动导入不允许写入 Skill 扩展")
	}
	if strings.TrimSpace(input.ProducerInvocationID) != "" || input.ProducerAttempt != 0 || strings.TrimSpace(input.ProducerSkillID) != "" {
		return ArtifactEnvelope{}, errors.New("手动导入不允许声明生产者")
	}
	items, envelopes, err := buildArtifacts(userID, []CreateArtifactInput{input}, false)
	if err != nil {
		return ArtifactEnvelope{}, err
	}
	if _, err := repository.CreateArtifact(items[0]); err != nil {
		return ArtifactEnvelope{}, err
	}
	return envelopes[0], nil
}

// buildProducedArtifacts prepares an immutable output set for the Invocation
// repository to persist in its finalization transaction.
func buildProducedArtifacts(userID string, inputs []CreateArtifactInput) ([]model.Artifact, []ArtifactEnvelope, error) {
	return buildArtifacts(userID, inputs, true)
}

func GetArtifact(userID, artifactID string) (ArtifactEnvelope, error) {
	userID, artifactID = strings.TrimSpace(userID), strings.TrimSpace(artifactID)
	stored, ok, err := repository.GetUserArtifact(userID, artifactID)
	if err != nil {
		return ArtifactEnvelope{}, err
	}
	if !ok {
		return ArtifactEnvelope{}, errors.New("Artifact 不存在")
	}
	return artifactEnvelopeFromModel(stored)
}

func ListArtifacts(userID string, query ArtifactQuery) (ArtifactList, error) {
	query.ApprovalState = strings.ToLower(strings.TrimSpace(query.ApprovalState))
	if query.ApprovalState != "" && query.ApprovalState != "approved" && query.ApprovalState != "unapproved" && query.ApprovalState != "pending" && query.ApprovalState != "rejected" {
		return ArtifactList{}, errors.New("Artifact approvalState 无效")
	}
	page := model.Query{Page: query.Page, PageSize: query.PageSize}
	page.Normalize()
	items, total, err := repository.ListUserArtifacts(strings.TrimSpace(userID), repository.ArtifactQuery{
		ProjectID: query.ProjectID, EpisodeID: query.EpisodeID, ArtifactType: query.ArtifactType,
		ProducerInvocationID: query.ProducerInvocationID, ApprovalState: query.ApprovalState, Page: page.Page, PageSize: page.PageSize,
	})
	if err != nil {
		return ArtifactList{}, err
	}
	context := newArtifactReadContext(strings.TrimSpace(userID), items)
	rootIDs := make([]string, 0, len(items))
	for _, item := range items {
		rootIDs = append(rootIDs, item.ID)
	}
	if err := context.preloadLineage(rootIDs); err != nil {
		return ArtifactList{}, err
	}
	envelopes := make([]ArtifactEnvelope, 0, len(items))
	for _, item := range items {
		envelope, err := context.envelope(item.ID)
		if err != nil {
			return ArtifactList{}, err
		}
		envelopes = append(envelopes, envelope)
	}
	return ArtifactList{Items: envelopes, Total: total, Page: page.Page, PageSize: page.PageSize}, nil
}

func ResolveArtifactRefs(userID string, refs []ArtifactRefInput) ([]ArtifactEnvelope, []ArtifactRefSnapshot, error) {
	userID = strings.TrimSpace(userID)
	envelopes := make([]ArtifactEnvelope, 0, len(refs))
	snapshots := make([]ArtifactRefSnapshot, 0, len(refs))
	seen := make(map[string]struct{}, len(refs))
	normalized := make([]ArtifactRefInput, 0, len(refs))
	artifactIDs := make([]string, 0, len(refs))
	for _, raw := range refs {
		ref := normalizeArtifactRef(raw)
		if ref.ArtifactID == "" || ref.ContentHash == "" {
			return nil, nil, errors.New("Artifact 引用缺少 ID 或内容哈希")
		}
		key := ref.BindingName + "\x00" + ref.ArtifactID
		if _, ok := seen[key]; ok {
			return nil, nil, errors.New("Artifact 引用绑定重复")
		}
		seen[key] = struct{}{}
		normalized = append(normalized, ref)
		artifactIDs = append(artifactIDs, ref.ArtifactID)
	}
	stored, err := repository.GetUserArtifactsByIDs(userID, artifactIDs)
	if err != nil {
		return nil, nil, err
	}
	context := newArtifactReadContext(userID, artifactMapValues(stored))
	if err := context.preloadLineage(artifactIDs); err != nil {
		return nil, nil, err
	}
	for _, ref := range normalized {
		envelope, err := context.envelope(ref.ArtifactID)
		if err != nil {
			return nil, nil, err
		}
		if envelope.Artifact.ContentHash != ref.ContentHash {
			return nil, nil, errors.New("Artifact 引用内容哈希已过期")
		}
		schema, err := context.schema(envelope.Artifact)
		if err != nil {
			return nil, nil, err
		}
		if schema.ID != envelope.Artifact.SchemaID || schema.ContentHash != envelope.Artifact.SchemaContentHash {
			return nil, nil, errors.New("Artifact Schema 快照已过期")
		}
		envelopes = append(envelopes, envelope)
		snapshots = append(snapshots, ArtifactRefSnapshot{
			BindingName: ref.BindingName, ArtifactID: envelope.Artifact.ID, ArtifactHash: envelope.Artifact.ContentHash,
			ArtifactType: envelope.Artifact.ArtifactType, SchemaID: schema.ID, SchemaVersion: schema.Version,
			SchemaContentHash: schema.ContentHash, Schema: schema.Schema, ProjectID: envelope.Artifact.ProjectID, EpisodeID: envelope.Artifact.EpisodeID,
		})
	}
	return envelopes, snapshots, nil
}

func buildArtifacts(userID string, inputs []CreateArtifactInput, produced bool) ([]model.Artifact, []ArtifactEnvelope, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil, nil, errors.New("Artifact 用户不能为空")
	}
	if len(inputs) == 0 {
		return nil, nil, errors.New("Artifact 创建列表不能为空")
	}
	items := make([]model.Artifact, 0, len(inputs))
	envelopes := make([]ArtifactEnvelope, 0, len(inputs))
	for _, input := range inputs {
		item, envelope, err := buildArtifact(userID, input, produced)
		if err != nil {
			return nil, nil, err
		}
		items = append(items, item)
		envelopes = append(envelopes, envelope)
	}
	return items, envelopes, nil
}

func buildArtifact(userID string, input CreateArtifactInput, produced bool) (model.Artifact, ArtifactEnvelope, error) {
	input.ArtifactType = strings.TrimSpace(input.ArtifactType)
	input.SchemaVersion = strings.TrimSpace(input.SchemaVersion)
	input.ProjectID = strings.TrimSpace(input.ProjectID)
	input.EpisodeID = strings.TrimSpace(input.EpisodeID)
	input.ProducerInvocationID = strings.TrimSpace(input.ProducerInvocationID)
	input.ProducerSkillID = strings.TrimSpace(input.ProducerSkillID)
	if produced {
		if input.ProducerInvocationID == "" || input.ProducerAttempt < 1 || input.ProducerSkillID == "" {
			return model.Artifact{}, ArtifactEnvelope{}, errors.New("生产 Artifact 缺少 Invocation、attempt 或 Skill")
		}
		for key := range input.Extensions {
			if key != input.ProducerSkillID {
				return model.Artifact{}, ArtifactEnvelope{}, errors.New("Artifact 扩展必须使用生产 Skill 的精确命名空间")
			}
		}
	}
	schema, err := ResolveArtifactSchema(input.ArtifactType, input.SchemaVersion)
	if err != nil {
		return model.Artifact{}, ArtifactEnvelope{}, err
	}
	if err := ValidateArtifactPayload(schema, input.Payload); err != nil {
		return model.Artifact{}, ArtifactEnvelope{}, err
	}
	payloadJSON, payload, err := canonicalRawObject(input.Payload)
	if err != nil {
		return model.Artifact{}, ArtifactEnvelope{}, fmt.Errorf("Artifact payload 无效: %w", err)
	}
	extensionsJSON, extensions, err := canonicalRawMap(input.Extensions)
	if err != nil {
		return model.Artifact{}, ArtifactEnvelope{}, fmt.Errorf("Artifact extensions 无效: %w", err)
	}
	parentRefs, parentIDs, err := validateParentArtifactRefs(userID, input.ProjectID, input.EpisodeID, input.ParentArtifactRefs)
	if err != nil {
		return model.Artifact{}, ArtifactEnvelope{}, err
	}
	parentJSON, err := canonicalArtifactRefs(parentRefs)
	if err != nil {
		return model.Artifact{}, ArtifactEnvelope{}, err
	}
	hash, err := artifactEnvelopeContentHash(input.ArtifactType, input.SchemaVersion, schema.ContentHash, input.ProjectID, input.EpisodeID, parentRefs, payload, extensions)
	if err != nil {
		return model.Artifact{}, ArtifactEnvelope{}, err
	}
	var producerID *string
	if input.ProducerInvocationID != "" {
		value := input.ProducerInvocationID
		producerID = &value
	}
	item := model.Artifact{
		ID: newID("artifact"), UserID: userID, ArtifactType: input.ArtifactType, SchemaID: schema.ID,
		SchemaVersion: schema.Version, SchemaContentHash: schema.ContentHash, ProjectID: input.ProjectID, EpisodeID: input.EpisodeID,
		ParentArtifactRefsJSON: string(parentJSON), ProducerInvocationID: producerID, ProducerAttempt: input.ProducerAttempt,
		PayloadJSON: string(payloadJSON), ExtensionsJSON: string(extensionsJSON), ContentHash: hash, CreatedAt: now(),
	}
	return item, ArtifactEnvelope{Artifact: item, ParentArtifactIds: parentIDs, Payload: payload, Extensions: extensions}, nil
}

func validateParentArtifactRefs(userID, projectID, episodeID string, rawRefs []ArtifactRefInput) ([]ArtifactRefInput, []string, error) {
	refs := make([]ArtifactRefInput, 0, len(rawRefs))
	ids := make([]string, 0, len(rawRefs))
	parents, _, err := ResolveArtifactRefs(userID, rawRefs)
	if err != nil {
		return nil, nil, err
	}
	for index, raw := range rawRefs {
		ref := normalizeArtifactRef(raw)
		if parents[index].Artifact.ProjectID != projectID || parents[index].Artifact.EpisodeID != episodeID {
			return nil, nil, errors.New("父 Artifact 项目或单集作用域不一致")
		}
		refs = append(refs, ref)
		ids = append(ids, ref.ArtifactID)
	}
	return refs, ids, nil
}

func normalizeArtifactRef(ref ArtifactRefInput) ArtifactRefInput {
	return ArtifactRefInput{BindingName: strings.TrimSpace(ref.BindingName), ArtifactID: strings.TrimSpace(ref.ArtifactID), ContentHash: strings.TrimSpace(ref.ContentHash)}
}

type cachedArtifactSchema struct {
	resolved  ResolvedArtifactSchema
	validator *jsonschema.Schema
}

type artifactReadContext struct {
	userID    string
	artifacts map[string]model.Artifact
	envelopes map[string]ArtifactEnvelope
	states    map[string]uint8
	schemas   map[string]cachedArtifactSchema
}

func artifactEnvelopeFromModel(item model.Artifact) (ArtifactEnvelope, error) {
	context := newArtifactReadContext(item.UserID, []model.Artifact{item})
	if err := context.preloadLineage([]string{item.ID}); err != nil {
		return ArtifactEnvelope{}, err
	}
	return context.envelope(item.ID)
}

func newArtifactReadContext(userID string, items []model.Artifact) *artifactReadContext {
	context := &artifactReadContext{
		userID: strings.TrimSpace(userID), artifacts: make(map[string]model.Artifact, len(items)),
		envelopes: make(map[string]ArtifactEnvelope, len(items)), states: make(map[string]uint8, len(items)), schemas: map[string]cachedArtifactSchema{},
	}
	for _, item := range items {
		context.artifacts[item.ID] = item
	}
	return context
}

func (context *artifactReadContext) preloadLineage(rootIDs []string) error {
	frontier := append([]string(nil), rootIDs...)
	visited := make(map[string]struct{}, len(rootIDs))
	for len(frontier) != 0 {
		parentIDs := make([]string, 0)
		for _, id := range frontier {
			if _, ok := visited[id]; ok {
				continue
			}
			visited[id] = struct{}{}
			item, ok := context.artifacts[id]
			if !ok {
				return errors.New("Artifact 不存在或不属于当前用户")
			}
			refs, err := decodeArtifactRefs([]byte(item.ParentArtifactRefsJSON))
			if err != nil {
				return fmt.Errorf("Artifact 父引用存储损坏: %w", err)
			}
			for _, ref := range refs {
				if _, loaded := context.artifacts[ref.ArtifactID]; !loaded {
					parentIDs = append(parentIDs, ref.ArtifactID)
				}
			}
		}
		if len(parentIDs) == 0 {
			break
		}
		loaded, err := repository.GetUserArtifactsByIDs(context.userID, parentIDs)
		if err != nil {
			return err
		}
		for id, item := range loaded {
			context.artifacts[id] = item
		}
		frontier = parentIDs
	}
	return nil
}

func (context *artifactReadContext) envelope(id string) (envelope ArtifactEnvelope, err error) {
	if envelope, ok := context.envelopes[id]; ok {
		return envelope, nil
	}
	if context.states[id] == 1 {
		return ArtifactEnvelope{}, errors.New("Artifact 父引用存在循环")
	}
	item, ok := context.artifacts[id]
	if !ok {
		return ArtifactEnvelope{}, errors.New("Artifact 不存在或不属于当前用户")
	}
	context.states[id] = 1
	defer func() {
		if err != nil {
			context.states[id] = 0
		}
	}()
	parentRefs, err := decodeArtifactRefs([]byte(item.ParentArtifactRefsJSON))
	if err != nil {
		return ArtifactEnvelope{}, fmt.Errorf("Artifact 父引用存储损坏: %w", err)
	}
	parentIDs := make([]string, 0, len(parentRefs))
	seen := make(map[string]struct{}, len(parentRefs))
	for index, raw := range parentRefs {
		ref := normalizeArtifactRef(raw)
		if ref.ArtifactID == "" || ref.ContentHash == "" || ref != raw {
			return ArtifactEnvelope{}, errors.New("Artifact 父引用存储损坏")
		}
		key := ref.BindingName + "\x00" + ref.ArtifactID
		if _, ok := seen[key]; ok {
			return ArtifactEnvelope{}, errors.New("Artifact 父引用存储重复")
		}
		seen[key] = struct{}{}
		parent, err := context.envelope(ref.ArtifactID)
		if err != nil {
			return ArtifactEnvelope{}, err
		}
		if parent.Artifact.ContentHash != ref.ContentHash || parent.Artifact.ProjectID != item.ProjectID || parent.Artifact.EpisodeID != item.EpisodeID {
			return ArtifactEnvelope{}, fmt.Errorf("Artifact 父引用 %d 已失效", index)
		}
		parentRefs[index] = ref
		parentIDs = append(parentIDs, ref.ArtifactID)
	}
	_, payload, err := canonicalRawObject([]byte(item.PayloadJSON))
	if err != nil {
		return ArtifactEnvelope{}, fmt.Errorf("Artifact payload 存储损坏: %w", err)
	}
	_, extensions, err := canonicalRawObject([]byte(item.ExtensionsJSON))
	if err != nil {
		return ArtifactEnvelope{}, fmt.Errorf("Artifact extensions 存储损坏: %w", err)
	}
	schema, err := context.schema(item)
	if err != nil {
		return ArtifactEnvelope{}, err
	}
	if schema.ID != item.SchemaID || schema.ContentHash != item.SchemaContentHash {
		return ArtifactEnvelope{}, errors.New("Artifact Schema 存储快照已失效")
	}
	if err := context.validatePayload(item, payload); err != nil {
		return ArtifactEnvelope{}, err
	}
	hash, err := artifactEnvelopeContentHash(item.ArtifactType, item.SchemaVersion, item.SchemaContentHash, item.ProjectID, item.EpisodeID, parentRefs, payload, extensions)
	if err != nil {
		return ArtifactEnvelope{}, err
	}
	if hash != item.ContentHash {
		return ArtifactEnvelope{}, errors.New("Artifact 内容哈希校验失败")
	}
	envelope = ArtifactEnvelope{Artifact: item, ParentArtifactIds: parentIDs, Payload: payload, Extensions: extensions}
	context.envelopes[id] = envelope
	context.states[id] = 2
	return envelope, nil
}

func (context *artifactReadContext) schema(item model.Artifact) (ResolvedArtifactSchema, error) {
	key := item.ArtifactType + "\x00" + item.SchemaVersion
	cached, ok := context.schemas[key]
	if !ok {
		resolved, err := ResolveArtifactSchema(item.ArtifactType, item.SchemaVersion)
		if err != nil {
			return ResolvedArtifactSchema{}, err
		}
		canonical, _, err := canonicalJSONObject(resolved.Schema)
		if err != nil {
			return ResolvedArtifactSchema{}, err
		}
		validator, err := compileLocalJSONSchema(artifactSchemaResourceName(resolved.ArtifactType, resolved.Version), canonical)
		if err != nil {
			return ResolvedArtifactSchema{}, err
		}
		cached = cachedArtifactSchema{resolved: resolved, validator: validator}
		context.schemas[key] = cached
	}
	if cached.resolved.ID != item.SchemaID || cached.resolved.ContentHash != item.SchemaContentHash {
		return ResolvedArtifactSchema{}, errors.New("Artifact Schema 存储快照已失效")
	}
	return cached.resolved, nil
}

func (context *artifactReadContext) validatePayload(item model.Artifact, payload map[string]any) error {
	key := item.ArtifactType + "\x00" + item.SchemaVersion
	cached, ok := context.schemas[key]
	if !ok {
		return errors.New("Artifact Schema validator 未加载")
	}
	if err := cached.validator.Validate(payload); err != nil {
		return fmt.Errorf("Artifact payload 不符合 Schema: %w", err)
	}
	return nil
}

func artifactMapValues(items map[string]model.Artifact) []model.Artifact {
	values := make([]model.Artifact, 0, len(items))
	for _, item := range items {
		values = append(values, item)
	}
	return values
}

func decodeArtifactRefs(raw []byte) ([]ArtifactRefInput, error) {
	var refs []ArtifactRefInput
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&refs); err != nil {
		return nil, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return nil, errors.New("父引用包含多个顶层值")
		}
		return nil, err
	}
	if refs == nil {
		return nil, errors.New("父引用必须是 JSON 数组")
	}
	return refs, nil
}

func canonicalArtifactRefs(refs []ArtifactRefInput) ([]byte, error) {
	raw, err := json.Marshal(refs)
	if err != nil {
		return nil, err
	}
	return jsoncanonicalizer.Transform(raw)
}

func canonicalRawObject(raw []byte) ([]byte, map[string]any, error) {
	value, err := decodeCanonicalJSON(raw)
	if err != nil {
		return nil, nil, err
	}
	object, ok := value.(map[string]any)
	if !ok {
		return nil, nil, errors.New("JSON 根节点必须是对象")
	}
	canonical, _, err := canonicalJSONObject(object)
	return canonical, object, err
}

func canonicalRawMap(values map[string]json.RawMessage) ([]byte, map[string]any, error) {
	object := make(map[string]any, len(values))
	for key, raw := range values {
		value, err := decodeCanonicalJSON(raw)
		if err != nil {
			return nil, nil, fmt.Errorf("扩展 %s 不是有效 JSON: %w", key, err)
		}
		object[key] = value
	}
	return canonicalJSONObject(object)
}

func artifactContentHash(value map[string]any) (string, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	canonical, err := jsoncanonicalizer.Transform(raw)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256(canonical)
	return "sha256:" + hex.EncodeToString(hash[:]), nil
}

func artifactEnvelopeContentHash(artifactType, schemaVersion, schemaContentHash, projectID, episodeID string, parentRefs []ArtifactRefInput, payload, extensions map[string]any) (string, error) {
	return artifactContentHash(map[string]any{
		"artifactType": artifactType, "schemaVersion": schemaVersion, "schemaContentHash": schemaContentHash,
		"projectId": projectID, "episodeId": episodeID, "parentArtifactRefs": parentRefs,
		"payload": payload, "extensions": extensions,
	})
}
