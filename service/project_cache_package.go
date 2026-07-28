package service

import (
	"archive/zip"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type projectCachePackageManifest struct {
	FormatVersion int                          `json:"formatVersion"`
	ExportedAt    string                       `json:"exportedAt"`
	ProjectID     string                       `json:"projectId"`
	Files         []ProjectCacheFile           `json:"files"`
	Preflight     ProjectCachePackagePreflight `json:"preflight"`
}

func PreflightProjectCachePackage(root, userID, projectID string) (ProjectCachePackagePreflight, error) {
	path, err := findUserProjectCacheManifest(root, userID, projectID)
	if err != nil {
		return ProjectCachePackagePreflight{}, err
	}
	lock := projectCacheLock(path)
	lock.Lock()
	defer lock.Unlock()
	manifest, err := ReadProjectCacheManifest(path)
	if err != nil {
		return ProjectCachePackagePreflight{}, err
	}
	return preflightProjectCachePackage(filepath.Dir(path), manifest)
}

func preflightProjectCachePackage(projectPath string, manifest ProjectCacheManifest) (ProjectCachePackagePreflight, error) {
	result := ProjectCachePackagePreflight{Missing: []string{}, FileCount: len(manifest.Files)}
	for _, item := range manifest.Files {
		absolute, err := safeProjectCacheJoin(projectPath, item.RelativePath)
		if err != nil {
			return ProjectCachePackagePreflight{}, err
		}
		if _, statErr := os.Stat(absolute); statErr != nil {
			result.Missing = append(result.Missing, item.RelativePath)
			continue
		}
		result.Bytes += item.Bytes
	}
	return result, nil
}

func WriteProjectCachePackage(writer io.Writer, root, userID string, input ProjectCachePackageInput) (ProjectCachePackageResult, error) {
	manifestPath, err := findUserProjectCacheManifest(root, userID, input.ProjectID)
	if err != nil {
		return ProjectCachePackageResult{}, err
	}
	lock := projectCacheLock(manifestPath)
	lock.Lock()
	defer lock.Unlock()
	manifest, err := ReadProjectCacheManifest(manifestPath)
	if err != nil {
		return ProjectCachePackageResult{}, err
	}
	projectPath := filepath.Dir(manifestPath)
	preflight, err := preflightProjectCachePackage(projectPath, manifest)
	if err != nil {
		return ProjectCachePackageResult{}, err
	}
	if len(preflight.Missing) > 0 && !input.ContinueOnMissing {
		return ProjectCachePackageResult{}, safeMessageError{message: "项目缓存存在缺失文件，请确认后继续打包"}
	}
	archive := zip.NewWriter(writer)
	writeJSON := func(name string, value any) error {
		entry, createErr := archive.Create(name)
		if createErr != nil {
			return createErr
		}
		var data []byte
		if raw, ok := value.(json.RawMessage); ok {
			data = raw
		} else {
			data, createErr = json.MarshalIndent(value, "", "  ")
		}
		if createErr != nil {
			return createErr
		}
		_, createErr = entry.Write(data)
		return createErr
	}
	packageManifest := projectCachePackageManifest{FormatVersion: ProjectCacheFormatVersion, ExportedAt: time.Now().UTC().Format(time.RFC3339), ProjectID: input.ProjectID, Files: manifest.Files, Preflight: preflight}
	for name, value := range map[string]any{
		"package-manifest.json":     packageManifest,
		"metadata/project.json":     input.Snapshot.Project,
		"metadata/canvases.json":    input.Snapshot.Canvases,
		"metadata/scripts.json":     input.Snapshot.Scripts,
		"metadata/storyboards.json": input.Snapshot.Storyboards,
		"metadata/assets.json":      input.Snapshot.Assets,
	} {
		if err := writeJSON(name, value); err != nil {
			_ = archive.Close()
			return ProjectCachePackageResult{}, err
		}
	}
	missing := map[string]bool{}
	for _, path := range preflight.Missing {
		missing[path] = true
	}
	for _, item := range manifest.Files {
		if missing[item.RelativePath] {
			continue
		}
		absolute, pathErr := safeProjectCacheJoin(projectPath, item.RelativePath)
		if pathErr != nil {
			_ = archive.Close()
			return ProjectCachePackageResult{}, pathErr
		}
		file, openErr := os.Open(absolute)
		if openErr != nil {
			_ = archive.Close()
			return ProjectCachePackageResult{}, openErr
		}
		entry, createErr := archive.Create(filepath.ToSlash(item.RelativePath))
		if createErr == nil {
			_, createErr = io.Copy(entry, file)
		}
		_ = file.Close()
		if createErr != nil {
			_ = archive.Close()
			return ProjectCachePackageResult{}, createErr
		}
	}
	if err := archive.Close(); err != nil {
		return ProjectCachePackageResult{}, err
	}
	name := safeDisplaySegment(manifest.ProjectName)
	if name == "未命名" {
		name = "项目"
	}
	filename := strings.TrimSpace(name) + "__" + time.Now().Format("20060102-150405") + ".zip"
	return ProjectCachePackageResult{Filename: filename, Manifest: preflight}, nil
}
