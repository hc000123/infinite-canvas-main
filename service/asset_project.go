package service

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"gorm.io/gorm"
)

func ListAssetProjects() ([]model.AssetProjectSummary, error) {
	return repository.ListAssetProjects()
}

func SaveAssetProject(item model.AssetProject) (model.AssetProject, error) {
	item.Name = strings.TrimSpace(item.Name)
	if item.Name == "" {
		return item, safeMessageError{message: "请输入项目名称"}
	}
	if item.ID != "" {
		if _, err := repository.GetAssetProject(item.ID); err != nil {
			return item, safeMessageError{message: "素材项目不存在"}
		}
	}
	exists, err := repository.AssetProjectNameExists(item.Name, item.ID)
	if err != nil {
		return item, err
	}
	if exists {
		return item, safeMessageError{message: "已存在同名素材项目"}
	}
	now := time.Now().Format(time.RFC3339)
	if item.ID == "" {
		item.ID = newID("asset-project")
		item.CreatedAt = now
	}
	item.UpdatedAt = now
	return repository.SaveAssetProject(item)
}

func DeleteAssetProject(id string) error {
	if _, err := repository.GetAssetProject(strings.TrimSpace(id)); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return safeMessageError{message: "素材项目不存在"}
		}
		return err
	}
	assets, err := repository.DeleteAssetProject(id)
	if err != nil {
		return err
	}
	return cleanupUploadedAssets(assets)
}

func ListAssetFolders(projectID string) ([]model.AssetFolder, error) {
	if _, err := repository.GetAssetProject(strings.TrimSpace(projectID)); err != nil {
		return nil, safeMessageError{message: "素材项目不存在"}
	}
	return repository.ListAssetFolders(projectID)
}

func SaveAssetFolder(item model.AssetFolder) (model.AssetFolder, error) {
	item.ProjectID = strings.TrimSpace(item.ProjectID)
	item.ParentID = strings.TrimSpace(item.ParentID)
	item.Name = strings.TrimSpace(item.Name)
	if item.ProjectID == "" || item.Name == "" {
		return item, safeMessageError{message: "素材项目和文件夹名称不能为空"}
	}
	if _, err := repository.GetAssetProject(item.ProjectID); err != nil {
		return item, safeMessageError{message: "素材项目不存在"}
	}
	if item.ParentID != "" {
		parent, err := repository.GetAssetFolder(item.ParentID)
		if err != nil || parent.ProjectID != item.ProjectID {
			return item, safeMessageError{message: "上级文件夹不存在"}
		}
	}
	if item.ID != "" {
		existing, err := repository.GetAssetFolder(item.ID)
		if err != nil || existing.ProjectID != item.ProjectID {
			return item, safeMessageError{message: "文件夹不存在"}
		}
		if item.ID == item.ParentID {
			return item, safeMessageError{message: "文件夹不能移动到自身"}
		}
		folders, err := repository.ListAssetFolders(item.ProjectID)
		if err != nil {
			return item, err
		}
		parents := map[string]string{}
		for _, folder := range folders {
			parents[folder.ID] = folder.ParentID
		}
		for parentID := item.ParentID; parentID != ""; parentID = parents[parentID] {
			if parentID == item.ID {
				return item, safeMessageError{message: "文件夹层级不能形成循环"}
			}
		}
	}
	exists, err := repository.AssetFolderNameExists(item.ProjectID, item.ParentID, item.Name, item.ID)
	if err != nil {
		return item, err
	}
	if exists {
		return item, safeMessageError{message: "当前目录已存在同名文件夹"}
	}
	now := time.Now().Format(time.RFC3339)
	if item.ID == "" {
		item.ID = newID("asset-folder")
		item.CreatedAt = now
	}
	item.UpdatedAt = now
	saved, err := repository.SaveAssetFolder(item)
	if err == nil {
		err = repository.TouchAssetProject(item.ProjectID, now)
	}
	return saved, err
}

func DeleteAssetFolder(projectID string, folderID string) error {
	folder, err := repository.GetAssetFolder(strings.TrimSpace(folderID))
	if err != nil || folder.ProjectID != strings.TrimSpace(projectID) {
		return safeMessageError{message: "文件夹不存在"}
	}
	assets, err := repository.DeleteAssetFolder(projectID, folderID)
	if err != nil {
		return err
	}
	if err := repository.TouchAssetProject(projectID, time.Now().Format(time.RFC3339)); err != nil {
		return err
	}
	return cleanupUploadedAssets(assets)
}

func validateAssetLocation(projectID string, folderID string) error {
	if projectID == "" {
		return safeMessageError{message: "请选择素材项目"}
	}
	if _, err := repository.GetAssetProject(projectID); err != nil {
		return safeMessageError{message: "素材项目不存在"}
	}
	if folderID == "" {
		return nil
	}
	folder, err := repository.GetAssetFolder(folderID)
	if err != nil || folder.ProjectID != projectID {
		return safeMessageError{message: "目标文件夹不存在"}
	}
	return nil
}

func cleanupUploadedAssets(assets []model.Asset) error {
	var firstErr error
	for _, asset := range assets {
		if err := cleanupUploadedAssetURL(asset.URL); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func cleanupUploadedAssetURL(rawURL string) error {
	const prefix = "/api/uploaded-assets/library/"
	if !strings.HasPrefix(rawURL, prefix) {
		return nil
	}
	root, err := filepath.Abs(config.Cfg.PublicAssetDir)
	if err != nil {
		return err
	}
	relative := filepath.Clean(strings.TrimPrefix(rawURL, "/api/uploaded-assets/"))
	target, err := filepath.Abs(filepath.Join(root, relative))
	if err != nil {
		return err
	}
	if target == root || !strings.HasPrefix(target, root+string(os.PathSeparator)) {
		return safeMessageError{message: "素材文件路径无效"}
	}
	err = os.Remove(target)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
