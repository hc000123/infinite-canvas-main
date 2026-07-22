package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
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
