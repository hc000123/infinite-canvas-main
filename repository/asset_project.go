package repository

import (
	"errors"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func ListAssetProjects() ([]model.AssetProjectSummary, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.AssetProjectSummary
	err = db.Model(&model.AssetProject{}).
		Select("asset_projects.*, COUNT(assets.id) AS asset_count").
		Joins("LEFT JOIN assets ON assets.project_id = asset_projects.id").
		Group("asset_projects.id").Order("asset_projects.updated_at DESC").Scan(&items).Error
	return items, err
}

func GetAssetProject(id string) (model.AssetProject, error) {
	db, err := DB()
	if err != nil {
		return model.AssetProject{}, err
	}
	var item model.AssetProject
	err = db.Where("id = ?", id).First(&item).Error
	return item, err
}

func AssetProjectNameExists(name string, excludeID string) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	tx := db.Model(&model.AssetProject{}).Where("name = ?", name)
	if excludeID != "" {
		tx = tx.Where("id <> ?", excludeID)
	}
	var count int64
	err = tx.Count(&count).Error
	return count > 0, err
}

func SaveAssetProject(item model.AssetProject) (model.AssetProject, error) {
	db, err := DB()
	if err != nil {
		return item, err
	}
	if saved, findErr := GetAssetProject(item.ID); findErr == nil && item.CreatedAt == "" {
		item.CreatedAt = saved.CreatedAt
	} else if findErr != nil && !errors.Is(findErr, gorm.ErrRecordNotFound) {
		return item, findErr
	}
	return item, db.Save(&item).Error
}

func TouchAssetProject(id string, updatedAt string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Model(&model.AssetProject{}).Where("id = ?", id).Update("updated_at", updatedAt).Error
}

func DeleteAssetProject(id string) ([]model.Asset, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var assets []model.Asset
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("project_id = ?", id).Find(&assets).Error; err != nil {
			return err
		}
		if err := tx.Where("project_id = ?", id).Delete(&model.Asset{}).Error; err != nil {
			return err
		}
		if err := tx.Where("project_id = ?", id).Delete(&model.AssetFolder{}).Error; err != nil {
			return err
		}
		return tx.Delete(&model.AssetProject{}, "id = ?", id).Error
	})
	return assets, err
}

func ListAssetFolders(projectID string) ([]model.AssetFolder, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.AssetFolder
	err = db.Where("project_id = ?", projectID).Order("name ASC").Find(&items).Error
	return items, err
}

func GetAssetFolder(id string) (model.AssetFolder, error) {
	db, err := DB()
	if err != nil {
		return model.AssetFolder{}, err
	}
	var item model.AssetFolder
	err = db.Where("id = ?", id).First(&item).Error
	return item, err
}

func AssetFolderNameExists(projectID string, parentID string, name string, excludeID string) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	tx := db.Model(&model.AssetFolder{}).Where("project_id = ? AND parent_id = ? AND name = ?", projectID, parentID, name)
	if excludeID != "" {
		tx = tx.Where("id <> ?", excludeID)
	}
	var count int64
	err = tx.Count(&count).Error
	return count > 0, err
}

func SaveAssetFolder(item model.AssetFolder) (model.AssetFolder, error) {
	db, err := DB()
	if err != nil {
		return item, err
	}
	if saved, findErr := GetAssetFolder(item.ID); findErr == nil && item.CreatedAt == "" {
		item.CreatedAt = saved.CreatedAt
	} else if findErr != nil && !errors.Is(findErr, gorm.ErrRecordNotFound) {
		return item, findErr
	}
	return item, db.Save(&item).Error
}

func DeleteAssetFolder(projectID string, folderID string) ([]model.Asset, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	folders, err := ListAssetFolders(projectID)
	if err != nil {
		return nil, err
	}
	descendants := map[string]bool{folderID: true}
	for changed := true; changed; {
		changed = false
		for _, folder := range folders {
			if descendants[folder.ParentID] && !descendants[folder.ID] {
				descendants[folder.ID] = true
				changed = true
			}
		}
	}
	ids := make([]string, 0, len(descendants))
	for id := range descendants {
		ids = append(ids, id)
	}
	var assets []model.Asset
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("project_id = ? AND folder_id IN ?", projectID, ids).Find(&assets).Error; err != nil {
			return err
		}
		if err := tx.Where("project_id = ? AND folder_id IN ?", projectID, ids).Delete(&model.Asset{}).Error; err != nil {
			return err
		}
		return tx.Where("project_id = ? AND id IN ?", projectID, ids).Delete(&model.AssetFolder{}).Error
	})
	return assets, err
}
