package model

// AssetProject 是后台公共素材库中的独立项目，不绑定用户本地项目。
type AssetProject struct {
	ID        string `json:"id" gorm:"primaryKey"`
	Name      string `json:"name" gorm:"uniqueIndex"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// AssetProjectSummary 是项目首页展示的素材项目摘要。
type AssetProjectSummary struct {
	AssetProject
	AssetCount int `json:"assetCount"`
}

// AssetFolder 是素材项目内的多级文件夹。
type AssetFolder struct {
	ID        string `json:"id" gorm:"primaryKey"`
	ProjectID string `json:"projectId" gorm:"uniqueIndex:idx_asset_folder_sibling;index"`
	ParentID  string `json:"parentId" gorm:"uniqueIndex:idx_asset_folder_sibling;index"`
	Name      string `json:"name" gorm:"uniqueIndex:idx_asset_folder_sibling"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}
