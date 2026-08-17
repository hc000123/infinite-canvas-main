package service

import (
	"encoding/json"
	"io"
)

const ProjectCacheFormatVersion = 1

type ProjectCacheContext struct {
	ProjectID   string `json:"projectId"`
	ProjectName string `json:"projectName"`
	EpisodeID   string `json:"episodeId"`
	EpisodeName string `json:"episodeName"`
	CanvasID    string `json:"canvasId"`
	CanvasName  string `json:"canvasName"`
	NodeID      string `json:"nodeId"`
	AssetID     string `json:"assetId"`
	VersionID   string `json:"versionId"`
	Source      string `json:"source"`
	Category    string `json:"category"`
	Prompt      string `json:"prompt"`
	Model       string `json:"model"`
	Provider    string `json:"provider"`
	FreeCanvas  bool   `json:"freeCanvas"`
}

type ProjectCacheFile struct {
	ID           string              `json:"id"`
	RelativePath string              `json:"relativePath"`
	OriginalName string              `json:"originalName"`
	MIMEType     string              `json:"mimeType"`
	SHA256       string              `json:"sha256"`
	Kind         string              `json:"kind"`
	Category     string              `json:"category"`
	CreatedAt    string              `json:"createdAt"`
	Bytes        int64               `json:"bytes"`
	Context      ProjectCacheContext `json:"context"`
	Status       string              `json:"status"`
	Favorite     bool                `json:"favorite"`
}

type ProjectCacheManifest struct {
	FormatVersion int                `json:"formatVersion"`
	ProjectID     string             `json:"projectId"`
	ProjectName   string             `json:"projectName"`
	Status        string             `json:"status"`
	CreatedAt     string             `json:"createdAt"`
	UpdatedAt     string             `json:"updatedAt"`
	Files         []ProjectCacheFile `json:"files"`
}

type ProjectCacheArchiveInput struct {
	Context  ProjectCacheContext
	Filename string
	MIMEType string
	Reader   io.Reader
	Favorite bool
}

type ProjectCacheArchiveResult struct {
	File         ProjectCacheFile `json:"file"`
	ProjectPath  string           `json:"projectPath"`
	ManifestPath string           `json:"manifestPath"`
}

type ProjectCacheSummary struct {
	ProjectID    string `json:"projectId"`
	ProjectName  string `json:"projectName"`
	Status       string `json:"status"`
	Path         string `json:"path"`
	UpdatedAt    string `json:"updatedAt"`
	Bytes        int64  `json:"bytes"`
	FileCount    int    `json:"fileCount"`
	MissingCount int    `json:"missingCount"`
}

type UserProjectCacheList struct {
	RootPath     string                `json:"rootPath"`
	TotalBytes   int64                 `json:"totalBytes"`
	TotalFiles   int                   `json:"totalFiles"`
	PendingCount int                   `json:"pendingCount"`
	Projects     []ProjectCacheSummary `json:"projects"`
}

type ProjectCachePackageSnapshot struct {
	Project     json.RawMessage `json:"project"`
	Canvases    json.RawMessage `json:"canvases"`
	Scripts     json.RawMessage `json:"scripts"`
	Storyboards json.RawMessage `json:"storyboards"`
	Assets      json.RawMessage `json:"assets"`
}

type ProjectCachePackageInput struct {
	ProjectID         string                      `json:"-"`
	Snapshot          ProjectCachePackageSnapshot `json:"snapshot"`
	ContinueOnMissing bool                        `json:"continueOnMissing"`
}

type ProjectCacheSelectionInput struct {
	ProjectID string   `json:"-"`
	FileIDs   []string `json:"fileIds"`
}

type ProjectCachePackagePreflight struct {
	Missing   []string `json:"missing"`
	FileCount int      `json:"fileCount"`
	Bytes     int64    `json:"bytes"`
}

type ProjectCachePackageResult struct {
	Filename string                       `json:"filename"`
	Manifest ProjectCachePackagePreflight `json:"manifest"`
}
