package service

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

var projectCacheLocks sync.Map

func projectCacheLock(path string) *sync.Mutex {
	value, _ := projectCacheLocks.LoadOrStore(path, &sync.Mutex{})
	return value.(*sync.Mutex)
}

func projectCacheUserMutationLock(root, userID string) *sync.Mutex {
	return projectCacheLock(filepath.Join(projectCacheUserRoot(root, userID), ".mutation"))
}

func ArchiveProjectCacheFile(root, userID string, input ProjectCacheArchiveInput) (ProjectCacheArchiveResult, error) {
	if strings.TrimSpace(userID) == "" {
		return ProjectCacheArchiveResult{}, errors.New("未登录或权限不足")
	}
	kind := projectCacheKindFromMIME(input.MIMEType)
	if kind == "" {
		return ProjectCacheArchiveResult{}, safeMessageError{message: "仅支持缓存图片、视频或音频文件"}
	}
	if input.Reader == nil {
		return ProjectCacheArchiveResult{}, safeMessageError{message: "缓存文件不能为空"}
	}
	input.Context.Category = normalizeProjectCacheCategory(input.Context.Category)
	projectPath := projectCacheScopePath(root, userID, input.Context)
	manifestPath := filepath.Join(projectPath, "manifest.json")
	lock := projectCacheLock(manifestPath)
	lock.Lock()
	defer lock.Unlock()

	directory := projectCacheRelativeDirectory(input.Context, kind)
	absoluteDirectory := filepath.Join(projectPath, directory)
	if err := os.MkdirAll(absoluteDirectory, 0755); err != nil {
		return ProjectCacheArchiveResult{}, err
	}
	id, err := newProjectCacheID()
	if err != nil {
		return ProjectCacheArchiveResult{}, err
	}
	temporaryPath := filepath.Join(absoluteDirectory, "."+id+".tmp")
	temporary, err := os.OpenFile(temporaryPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		return ProjectCacheArchiveResult{}, err
	}
	hash := sha256.New()
	bytesWritten, copyErr := io.Copy(io.MultiWriter(temporary, hash), io.LimitReader(input.Reader, maxAssetUploadBytes+1))
	closeErr := temporary.Close()
	if copyErr != nil || closeErr != nil || bytesWritten == 0 || bytesWritten > maxAssetUploadBytes {
		_ = os.Remove(temporaryPath)
		if copyErr != nil {
			return ProjectCacheArchiveResult{}, copyErr
		}
		if closeErr != nil {
			return ProjectCacheArchiveResult{}, closeErr
		}
		if bytesWritten > maxAssetUploadBytes {
			return ProjectCacheArchiveResult{}, safeMessageError{message: "缓存文件不能超过 200 MB"}
		}
		return ProjectCacheArchiveResult{}, safeMessageError{message: "缓存文件不能为空"}
	}
	checksum := hex.EncodeToString(hash.Sum(nil))
	manifest, err := readProjectCacheManifestOrDefault(manifestPath, input.Context)
	if err != nil {
		_ = os.Remove(temporaryPath)
		return ProjectCacheArchiveResult{}, err
	}
	for index := range manifest.Files {
		item := &manifest.Files[index]
		if item.SHA256 == checksum && sameProjectCacheReference(item.Context, input.Context) {
			_ = os.Remove(temporaryPath)
			if kind == "video" && input.Favorite && !item.Favorite {
				item.Favorite = true
				manifest.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
				if err := writeProjectCacheManifest(manifestPath, manifest); err != nil {
					return ProjectCacheArchiveResult{}, err
				}
			}
			return ProjectCacheArchiveResult{File: *item, ProjectPath: projectPath, ManifestPath: manifestPath}, nil
		}
	}
	createdAt := time.Now().UTC().Format(time.RFC3339)
	filename := safeProjectCacheFilename(input.Filename, input.MIMEType)
	relativePath := filepath.Join(directory, filename)
	finalPath := filepath.Join(projectPath, relativePath)
	if _, err := os.Stat(finalPath); err == nil {
		extension := filepath.Ext(filename)
		filename = strings.TrimSuffix(filename, extension) + "__" + id[:8] + extension
		relativePath = filepath.Join(directory, filename)
		finalPath = filepath.Join(projectPath, relativePath)
	} else if !os.IsNotExist(err) {
		_ = os.Remove(temporaryPath)
		return ProjectCacheArchiveResult{}, err
	}
	if err := os.Rename(temporaryPath, finalPath); err != nil {
		_ = os.Remove(temporaryPath)
		return ProjectCacheArchiveResult{}, err
	}
	item := ProjectCacheFile{
		ID: id, RelativePath: filepath.ToSlash(relativePath), OriginalName: strings.TrimSpace(input.Filename), MIMEType: strings.TrimSpace(input.MIMEType),
		SHA256: checksum, Kind: kind, Category: input.Context.Category, CreatedAt: createdAt, Bytes: bytesWritten, Context: input.Context, Status: "ready", Favorite: kind == "video" && input.Favorite,
	}
	manifest.Files = append(manifest.Files, item)
	manifest.ProjectID = input.Context.ProjectID
	manifest.ProjectName = input.Context.ProjectName
	if manifest.Status == "" {
		manifest.Status = "active"
	}
	manifest.UpdatedAt = createdAt
	if manifest.CreatedAt == "" {
		manifest.CreatedAt = createdAt
	}
	if err := writeProjectCacheManifest(manifestPath, manifest); err != nil {
		_ = os.Remove(finalPath)
		return ProjectCacheArchiveResult{}, err
	}
	return ProjectCacheArchiveResult{File: item, ProjectPath: projectPath, ManifestPath: manifestPath}, nil
}

func ReadProjectCacheManifest(path string) (ProjectCacheManifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return ProjectCacheManifest{}, err
	}
	var manifest ProjectCacheManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return ProjectCacheManifest{}, err
	}
	return manifest, nil
}

func ListUserProjectCaches(root, userID string) (UserProjectCacheList, error) {
	userRoot := projectCacheUserRoot(root, userID)
	absoluteRoot, err := filepath.Abs(userRoot)
	if err != nil {
		absoluteRoot = userRoot
	}
	result := UserProjectCacheList{RootPath: absoluteRoot, Projects: []ProjectCacheSummary{}}
	manifestPaths, err := findProjectCacheManifestPaths(userRoot)
	if err != nil {
		return result, err
	}
	for _, path := range manifestPaths {
		manifest, readErr := ReadProjectCacheManifest(path)
		if readErr != nil {
			result.PendingCount++
			continue
		}
		summary := summarizeProjectCache(filepath.Dir(path), manifest)
		result.TotalBytes += summary.Bytes
		result.TotalFiles += summary.FileCount
		result.PendingCount += summary.MissingCount
		result.Projects = append(result.Projects, summary)
	}
	sort.Slice(result.Projects, func(i, j int) bool { return result.Projects[i].UpdatedAt > result.Projects[j].UpdatedAt })
	return result, nil
}

func GetUserProjectCache(root, userID, projectID string) (ProjectCacheManifest, ProjectCacheSummary, error) {
	path, err := findUserProjectCacheManifest(root, userID, projectID)
	if err != nil {
		return ProjectCacheManifest{}, ProjectCacheSummary{}, err
	}
	manifest, err := ReadProjectCacheManifest(path)
	if err != nil {
		return ProjectCacheManifest{}, ProjectCacheSummary{}, err
	}
	projectPath := filepath.Dir(path)
	for index := range manifest.Files {
		absolute, pathErr := safeProjectCacheJoin(projectPath, manifest.Files[index].RelativePath)
		if pathErr != nil {
			return ProjectCacheManifest{}, ProjectCacheSummary{}, pathErr
		}
		if _, statErr := os.Stat(absolute); statErr != nil {
			manifest.Files[index].Status = "missing"
		}
	}
	return manifest, summarizeProjectCache(projectPath, manifest), nil
}

func SetUserProjectCacheStatus(root, userID, projectID, status string) (ProjectCacheManifest, error) {
	if status != "active" && status != "deleted" {
		return ProjectCacheManifest{}, safeMessageError{message: "缓存项目状态无效"}
	}
	path, err := findUserProjectCacheManifest(root, userID, projectID)
	if err != nil {
		return ProjectCacheManifest{}, err
	}
	lock := projectCacheLock(path)
	lock.Lock()
	defer lock.Unlock()
	manifest, err := ReadProjectCacheManifest(path)
	if err != nil {
		return ProjectCacheManifest{}, err
	}
	manifest.Status = status
	manifest.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return manifest, writeProjectCacheManifest(path, manifest)
}

func SetUserProjectCacheFileFavorite(root, userID, fileID string, favorite bool) (ProjectCacheFile, error) {
	// User mutation locks are always acquired before manifest locks.
	userLock := projectCacheUserMutationLock(root, userID)
	userLock.Lock()
	defer userLock.Unlock()
	path, _, _, err := findUserProjectCacheFile(root, userID, fileID)
	if err != nil {
		return ProjectCacheFile{}, err
	}
	lock := projectCacheLock(path)
	lock.Lock()
	defer lock.Unlock()
	manifest, err := ReadProjectCacheManifest(path)
	if err != nil {
		return ProjectCacheFile{}, err
	}
	for index := range manifest.Files {
		if manifest.Files[index].ID != fileID {
			continue
		}
		if manifest.Files[index].Kind != "video" {
			return ProjectCacheFile{}, safeMessageError{message: "仅支持收藏视频缓存"}
		}
		if manifest.Files[index].Status != "ready" {
			return ProjectCacheFile{}, safeMessageError{message: "仅支持收藏状态正常的视频缓存"}
		}
		absolute, pathErr := safeProjectCacheJoin(filepath.Dir(path), manifest.Files[index].RelativePath)
		if pathErr != nil {
			return ProjectCacheFile{}, pathErr
		}
		info, statErr := os.Stat(absolute)
		if statErr != nil || !info.Mode().IsRegular() {
			return ProjectCacheFile{}, safeMessageError{message: "缓存视频不存在"}
		}
		if manifest.Files[index].Favorite == favorite {
			return manifest.Files[index], nil
		}
		manifest.Files[index].Favorite = favorite
		manifest.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		if err := writeProjectCacheManifest(path, manifest); err != nil {
			return ProjectCacheFile{}, err
		}
		return manifest.Files[index], nil
	}
	return ProjectCacheFile{}, safeMessageError{message: "缓存文件不存在"}
}

func DeleteUserProjectCacheFile(root, userID, fileID string) error {
	path, manifest, index, err := findUserProjectCacheFile(root, userID, fileID)
	if err != nil {
		return err
	}
	lock := projectCacheLock(path)
	lock.Lock()
	defer lock.Unlock()
	manifest, err = ReadProjectCacheManifest(path)
	if err != nil {
		return err
	}
	index = -1
	for itemIndex := range manifest.Files {
		if manifest.Files[itemIndex].ID == fileID {
			index = itemIndex
			break
		}
	}
	if index < 0 {
		return safeMessageError{message: "缓存文件不存在"}
	}
	absolute, err := safeProjectCacheJoin(filepath.Dir(path), manifest.Files[index].RelativePath)
	if err != nil {
		return err
	}
	temporary := absolute + ".deleting-" + fileID
	renamed := false
	if err := os.Rename(absolute, temporary); err == nil {
		renamed = true
	} else if !os.IsNotExist(err) {
		return err
	}
	manifest.Files = append(manifest.Files[:index], manifest.Files[index+1:]...)
	manifest.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := writeProjectCacheManifest(path, manifest); err != nil {
		if renamed {
			_ = os.Rename(temporary, absolute)
		}
		return err
	}
	if renamed {
		return os.Remove(temporary)
	}
	return nil
}

func MoveUserProjectCacheFile(root, userID, fileID string, context ProjectCacheContext) (ProjectCacheArchiveResult, error) {
	userLock := projectCacheUserMutationLock(root, userID)
	userLock.Lock()
	defer userLock.Unlock()
	absolute, item, err := ResolveUserProjectCacheFile(root, userID, fileID)
	if err != nil {
		return ProjectCacheArchiveResult{}, err
	}
	if strings.TrimSpace(item.Context.ProjectID) != "" {
		return ProjectCacheArchiveResult{}, safeMessageError{message: "只能移动未归属缓存文件"}
	}
	if strings.TrimSpace(context.ProjectID) == "" {
		return ProjectCacheArchiveResult{}, safeMessageError{message: "请选择目标项目"}
	}
	file, err := os.Open(absolute)
	if err != nil {
		return ProjectCacheArchiveResult{}, err
	}
	defer file.Close()
	context.NodeID = firstProjectCacheValue(context.NodeID, item.Context.NodeID)
	context.AssetID = firstProjectCacheValue(context.AssetID, item.Context.AssetID)
	context.VersionID = firstProjectCacheValue(context.VersionID, item.Context.VersionID)
	context.Source = firstProjectCacheValue(context.Source, item.Context.Source)
	context.Prompt = firstProjectCacheValue(context.Prompt, item.Context.Prompt)
	context.Model = firstProjectCacheValue(context.Model, item.Context.Model)
	context.Provider = firstProjectCacheValue(context.Provider, item.Context.Provider)
	result, err := ArchiveProjectCacheFile(root, userID, ProjectCacheArchiveInput{Context: context, Filename: item.OriginalName, MIMEType: item.MIMEType, Reader: file, Favorite: item.Favorite})
	if err != nil {
		return ProjectCacheArchiveResult{}, err
	}
	if err := DeleteUserProjectCacheFile(root, userID, fileID); err != nil {
		return ProjectCacheArchiveResult{}, err
	}
	return result, nil
}

func DeleteUserProjectCache(root, userID, projectID string) error {
	path, err := findUserProjectCacheManifest(root, userID, projectID)
	if err != nil {
		return err
	}
	lock := projectCacheLock(path)
	lock.Lock()
	defer lock.Unlock()
	manifest, err := ReadProjectCacheManifest(path)
	if err != nil {
		return err
	}
	if manifest.ProjectID != projectID {
		return safeMessageError{message: "缓存项目不存在"}
	}
	return os.RemoveAll(filepath.Dir(path))
}

func ResolveUserProjectCacheFile(root, userID, fileID string) (string, ProjectCacheFile, error) {
	path, manifest, index, err := findUserProjectCacheFile(root, userID, fileID)
	if err != nil {
		return "", ProjectCacheFile{}, err
	}
	item := manifest.Files[index]
	absolute, err := safeProjectCacheJoin(filepath.Dir(path), item.RelativePath)
	if err != nil {
		return "", ProjectCacheFile{}, err
	}
	if _, err := os.Stat(absolute); err != nil {
		return "", ProjectCacheFile{}, safeMessageError{message: "缓存文件不存在"}
	}
	return absolute, item, nil
}

func readProjectCacheManifestOrDefault(path string, context ProjectCacheContext) (ProjectCacheManifest, error) {
	manifest, err := ReadProjectCacheManifest(path)
	if err == nil {
		return manifest, nil
	}
	if !os.IsNotExist(err) {
		return ProjectCacheManifest{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	return ProjectCacheManifest{FormatVersion: ProjectCacheFormatVersion, ProjectID: context.ProjectID, ProjectName: context.ProjectName, Status: "active", CreatedAt: now, UpdatedAt: now, Files: []ProjectCacheFile{}}, nil
}

func writeProjectCacheManifest(path string, manifest ProjectCacheManifest) error {
	manifest.FormatVersion = ProjectCacheFormatVersion
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, data, 0644); err != nil {
		return err
	}
	if err := os.Rename(temporary, path); err != nil {
		_ = os.Remove(temporary)
		return err
	}
	return nil
}

func findProjectCacheManifestPaths(userRoot string) ([]string, error) {
	paths := []string{}
	unassigned := filepath.Join(userRoot, "unassigned", "manifest.json")
	if _, err := os.Stat(unassigned); err == nil {
		paths = append(paths, unassigned)
	}
	projectsRoot := filepath.Join(userRoot, "projects")
	entries, err := os.ReadDir(projectsRoot)
	if os.IsNotExist(err) {
		return paths, nil
	}
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			paths = append(paths, filepath.Join(projectsRoot, entry.Name(), "manifest.json"))
		}
	}
	return paths, nil
}

func findUserProjectCacheManifest(root, userID, projectID string) (string, error) {
	if projectID == "unassigned" {
		projectID = ""
	}
	paths, err := findProjectCacheManifestPaths(projectCacheUserRoot(root, userID))
	if err != nil {
		return "", err
	}
	for _, path := range paths {
		manifest, readErr := ReadProjectCacheManifest(path)
		if readErr == nil && manifest.ProjectID == projectID {
			return path, nil
		}
	}
	return "", safeMessageError{message: "缓存项目不存在"}
}

func findUserProjectCacheFile(root, userID, fileID string) (string, ProjectCacheManifest, int, error) {
	paths, err := findProjectCacheManifestPaths(projectCacheUserRoot(root, userID))
	if err != nil {
		return "", ProjectCacheManifest{}, -1, err
	}
	for _, path := range paths {
		manifest, readErr := ReadProjectCacheManifest(path)
		if readErr != nil {
			continue
		}
		for index, item := range manifest.Files {
			if item.ID == fileID {
				return path, manifest, index, nil
			}
		}
	}
	return "", ProjectCacheManifest{}, -1, safeMessageError{message: "缓存文件不存在"}
}

func summarizeProjectCache(path string, manifest ProjectCacheManifest) ProjectCacheSummary {
	absolute, err := filepath.Abs(path)
	if err != nil {
		absolute = path
	}
	result := ProjectCacheSummary{ProjectID: manifest.ProjectID, ProjectName: manifest.ProjectName, Status: manifest.Status, Path: absolute, UpdatedAt: manifest.UpdatedAt, FileCount: len(manifest.Files)}
	for _, item := range manifest.Files {
		result.Bytes += item.Bytes
		itemPath, pathErr := safeProjectCacheJoin(path, item.RelativePath)
		if pathErr != nil {
			result.MissingCount++
			continue
		}
		if _, err := os.Stat(itemPath); err != nil {
			result.MissingCount++
		}
	}
	return result
}

func sameProjectCacheReference(left, right ProjectCacheContext) bool {
	return left.NodeID == right.NodeID && left.AssetID == right.AssetID && left.VersionID == right.VersionID && left.Source == right.Source && left.EpisodeID == right.EpisodeID && left.CanvasID == right.CanvasID && left.Category == right.Category && left.FreeCanvas == right.FreeCanvas
}

func firstProjectCacheValue(value, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func newProjectCacheID() (string, error) {
	data := make([]byte, 12)
	if _, err := rand.Read(data); err != nil {
		return "", fmt.Errorf("生成缓存文件 ID 失败: %w", err)
	}
	return hex.EncodeToString(data), nil
}
