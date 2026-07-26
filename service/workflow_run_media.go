package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const maxWorkflowMediaBytes = 10 << 20

type CreateWorkflowMediaBatchInput struct {
	StageID        string `json:"stageId"`
	IdempotencyKey string `json:"idempotencyKey"`
}

type WorkflowMediaItemInput struct {
	AssetID string
	Label   string
	Kind    string
	Version string
	Order   int
}

func CreateUserWorkflowMediaBatch(userID string, workflowRunID string, input CreateWorkflowMediaBatchInput) (model.WorkflowMediaBatchDetail, error) {
	workflow, ok, err := repository.GetUserWorkflowRun(userID, workflowRunID)
	if err != nil {
		return model.WorkflowMediaBatchDetail{}, err
	}
	if !ok {
		return model.WorkflowMediaBatchDetail{}, safeMessageError{message: "工作流不存在"}
	}
	stageID := strings.TrimSpace(input.StageID)
	if stageID != WorkflowStageAssetExtraction && stageID != WorkflowStageAssetImagePrompt && stageID != WorkflowStageShotBreakdown && stageID != WorkflowStageShotPrompt {
		return model.WorkflowMediaBatchDetail{}, safeMessageError{message: "该阶段不接受参考图片"}
	}
	idempotencyKey := strings.TrimSpace(input.IdempotencyKey)
	if idempotencyKey == "" || len(idempotencyKey) > 200 {
		return model.WorkflowMediaBatchDetail{}, safeMessageError{message: "缺少有效启动幂等键"}
	}
	stamp := now()
	batch, err := repository.CreateWorkflowMediaBatch(model.WorkflowMediaBatch{
		ID: newID("mediabatch"), UserID: workflow.UserID, WorkflowRunID: workflow.ID, StageID: stageID,
		IdempotencyKey: idempotencyKey, Status: model.WorkflowMediaBatchOpen,
		ExpiresAt: time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano), CreatedAt: stamp, UpdatedAt: stamp,
	})
	if err != nil {
		return model.WorkflowMediaBatchDetail{}, err
	}
	return GetUserWorkflowMediaBatch(userID, batch.ID)
}

func GetUserWorkflowMediaBatch(userID string, batchID string) (model.WorkflowMediaBatchDetail, error) {
	detail, ok, err := repository.GetUserWorkflowMediaBatch(userID, batchID)
	if err != nil {
		return detail, err
	}
	if !ok {
		return detail, safeMessageError{message: "图片批次不存在"}
	}
	return detail, nil
}

func UploadUserWorkflowMedia(userID string, batchID string, file multipart.File, header *multipart.FileHeader, input WorkflowMediaItemInput) (model.WorkflowMediaBatchDetail, error) {
	batch, err := GetUserWorkflowMediaBatch(userID, batchID)
	if err != nil {
		return batch, err
	}
	if batch.Batch.Status != model.WorkflowMediaBatchOpen {
		return batch, safeMessageError{message: "图片批次已被使用"}
	}
	expiresAt, parseErr := time.Parse(time.RFC3339Nano, batch.Batch.ExpiresAt)
	if parseErr != nil || !expiresAt.After(time.Now()) {
		return batch, safeMessageError{message: "图片批次已过期，请重新上传"}
	}
	if header == nil || header.Size <= 0 || header.Size > maxWorkflowMediaBytes {
		return batch, safeMessageError{message: "单张图片必须小于 10MB"}
	}
	data, err := io.ReadAll(io.LimitReader(file, maxWorkflowMediaBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxWorkflowMediaBytes {
		return batch, safeMessageError{message: "图片读取失败或超过 10MB"}
	}
	mimeType := http.DetectContentType(data)
	extension := map[string]string{"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}[mimeType]
	if extension == "" {
		return batch, safeMessageError{message: "仅支持 PNG、JPEG、WebP 图片"}
	}
	kind := strings.ToLower(strings.TrimSpace(input.Kind))
	if kind != "character" && kind != "scene" && kind != "prop" {
		return batch, safeMessageError{message: "图片类型必须是角色、场景或道具"}
	}
	if input.Order < 0 || input.Order > 999 {
		return batch, safeMessageError{message: "图片顺序无效"}
	}
	itemID := newID("mediaitem")
	directory := filepath.Join(config.Cfg.WorkflowLocalMediaDir, batch.Batch.ID)
	if err := os.MkdirAll(directory, 0700); err != nil {
		return batch, err
	}
	serverPath := filepath.Join(directory, itemID+extension)
	if err := os.WriteFile(serverPath, data, 0600); err != nil {
		return batch, err
	}
	digest := sha256.Sum256(data)
	item := model.WorkflowMediaItem{
		ID: itemID, BatchID: batch.Batch.ID, AssetID: boundedWorkflowMediaText(input.AssetID, 200),
		Label: boundedWorkflowMediaText(input.Label, 200), Kind: kind, Version: boundedWorkflowMediaText(input.Version, 100),
		Position: input.Order, SHA256: hex.EncodeToString(digest[:]), MIME: mimeType, Size: int64(len(data)), ServerPath: serverPath, CreatedAt: now(),
	}
	if err := repository.CreateWorkflowMediaItem(item); err != nil {
		_ = os.Remove(serverPath)
		if errors.Is(err, repository.ErrWorkflowMediaBatchInvalid) {
			return batch, safeMessageError{message: "图片批次已满或已被使用"}
		}
		return batch, err
	}
	return GetUserWorkflowMediaBatch(userID, batchID)
}

func DeleteUserWorkflowMediaBatch(userID string, batchID string) error {
	paths, err := repository.DeleteOpenWorkflowMediaBatch(userID, batchID)
	if err != nil {
		return safeMessageError{message: "图片批次不存在或已被使用"}
	}
	for _, path := range paths {
		_ = os.Remove(path)
	}
	_ = os.Remove(filepath.Join(config.Cfg.WorkflowLocalMediaDir, filepath.Base(batchID)))
	return nil
}

func ParseWorkflowMediaOrder(value string) int {
	order, _ := strconv.Atoi(strings.TrimSpace(value))
	return order
}

func boundedWorkflowMediaText(value string, limit int) string {
	value = strings.TrimSpace(value)
	if len(value) > limit {
		return value[:limit]
	}
	return value
}

type workflowMediaInvocationImport struct {
	Refs         []ArtifactRefInput
	ManifestJSON string
}

func prepareWorkflowMediaInvocationInputs(userID string, detail WorkflowRunDetail, stageID string, input WorkflowStageStartInput, context *WorkflowShotPromptContext) (workflowMediaInvocationImport, error) {
	batchID := strings.TrimSpace(input.MediaBatchID)
	if batchID == "" {
		if stageID == WorkflowStageShotPrompt && context != nil && len(context.References) > 0 {
			return workflowMediaInvocationImport{}, safeMessageError{message: "镜头上下文包含参考图片，但没有对应图片批次"}
		}
		return workflowMediaInvocationImport{}, nil
	}
	if stageID != WorkflowStageShotPrompt || context == nil {
		return workflowMediaInvocationImport{}, safeMessageError{message: "当前阶段不接受参考图片批次"}
	}
	batch, err := GetUserWorkflowMediaBatch(userID, batchID)
	if err != nil {
		return workflowMediaInvocationImport{}, err
	}
	if batch.Batch.WorkflowRunID != detail.Run.ID || batch.Batch.StageID != stageID || batch.Batch.IdempotencyKey != strings.TrimSpace(input.IdempotencyKey) || (batch.Batch.Status != model.WorkflowMediaBatchOpen && batch.Batch.Status != model.WorkflowMediaBatchClaimed) {
		return workflowMediaInvocationImport{}, safeMessageError{message: "参考图片批次与当前工作流阶段不匹配"}
	}
	if len(batch.Items) == 0 || len(batch.Items) > 9 || len(batch.Items) != len(context.References) {
		return workflowMediaInvocationImport{}, safeMessageError{message: "参考图片与已确认镜头上下文不一致"}
	}
	references := make(map[string]WorkflowReferenceContext, len(context.References))
	for _, reference := range context.References {
		key := strings.TrimSpace(reference.LibraryAssetID)
		if key == "" {
			return workflowMediaInvocationImport{}, safeMessageError{message: "参考图片缺少素材编号"}
		}
		if _, exists := references[key]; exists {
			return workflowMediaInvocationImport{}, safeMessageError{message: "镜头上下文包含重复参考图片"}
		}
		references[key] = reference
	}
	inputs := make([]CreateArtifactInput, 0, len(batch.Items))
	manifestItems := make([]map[string]any, 0, len(batch.Items))
	for index, item := range batch.Items {
		reference, ok := references[item.AssetID]
		if !ok || strings.TrimSpace(reference.Version) != strings.TrimSpace(item.Version) {
			return workflowMediaInvocationImport{}, safeMessageError{message: "参考图片版本与镜头上下文不一致"}
		}
		assetID := strings.TrimSpace(reference.LogicalAssetID)
		if assetID == "" {
			assetID = strings.TrimSpace(reference.LibraryAssetID)
		}
		fileExtension := map[string]string{"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}[item.MIME]
		mediaRef := fmt.Sprintf("workflow-media://%s/%s%s?sha256=%s&version=%s", batch.Batch.ID, item.ID, fileExtension, item.SHA256, url.QueryEscape(item.Version))
		payload, _ := json.Marshal(map[string]any{
			"assetId": assetID, "renditionId": item.ID, "mediaType": "image", "mediaRef": mediaRef,
			"generationMetadata": map[string]any{"provider": "workflow_local_upload", "requestId": item.ID},
		})
		extension, _ := json.Marshal(map[string]any{
			"role": reference.Role, "ref": reference.Ref, "label": reference.Label, "logicalAssetId": reference.LogicalAssetID,
			"libraryAssetId": reference.LibraryAssetID, "version": reference.Version, "usage": reference.Usage,
			"sourceShotId": reference.SourceShotID, "sha256": item.SHA256, "mime": item.MIME, "order": index + 1,
		})
		inputs = append(inputs, CreateArtifactInput{
			ArtifactType: "asset_rendition", SchemaVersion: "1.0.0", ProjectID: detail.Run.ProjectID, EpisodeID: detail.Run.EpisodeID,
			Payload: payload, Extensions: map[string]json.RawMessage{"workflow_media_import": extension},
		})
		manifestItems = append(manifestItems, map[string]any{
			"id": item.ID, "assetId": item.AssetID, "label": item.Label, "kind": item.Kind, "role": reference.Role,
			"ref": reference.Ref, "version": item.Version, "order": index + 1, "sha256": item.SHA256,
			"mime": item.MIME, "size": item.Size, "serverPath": item.ServerPath,
		})
	}
	items, envelopes, err := buildArtifacts(userID, inputs, false)
	if err != nil {
		return workflowMediaInvocationImport{}, err
	}
	for index := range items {
		items[index].ID = deterministicInvocationID("workflowmediaartifact", batch.Batch.ID, batch.Items[index].ID, batch.Items[index].SHA256)
		envelopes[index].Artifact.ID = items[index].ID
	}
	if err := persistWorkflowMediaArtifacts(userID, items); err != nil {
		return workflowMediaInvocationImport{}, err
	}
	refs := make([]ArtifactRefInput, 0, len(envelopes))
	for _, artifact := range envelopes {
		refs = append(refs, ArtifactRefInput{BindingName: "asset_rendition", ArtifactID: artifact.Artifact.ID, ContentHash: artifact.Artifact.ContentHash})
	}
	manifest, _ := json.Marshal(map[string]any{"items": manifestItems, "degraded": false, "reason": ""})
	return workflowMediaInvocationImport{Refs: refs, ManifestJSON: string(manifest)}, nil
}

func persistWorkflowMediaArtifacts(userID string, items []model.Artifact) error {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID)
	}
	stored, err := repository.GetUserArtifactsByIDs(userID, ids)
	if err != nil {
		return err
	}
	missing := make([]model.Artifact, 0, len(items))
	for _, item := range items {
		if existing, ok := stored[item.ID]; ok {
			if existing.ContentHash != item.ContentHash {
				return errors.New("参考图片 Artifact 内容冲突")
			}
			continue
		}
		missing = append(missing, item)
	}
	if len(missing) == 0 {
		return nil
	}
	if err := repository.CreateArtifacts(missing); err == nil {
		return nil
	}
	stored, lookupErr := repository.GetUserArtifactsByIDs(userID, ids)
	if lookupErr != nil || len(stored) != len(items) {
		return errors.New("参考图片 Artifact 导入失败")
	}
	for _, item := range items {
		if stored[item.ID].ContentHash != item.ContentHash {
			return errors.New("参考图片 Artifact 内容冲突")
		}
	}
	return nil
}
