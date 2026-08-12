package service

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestProjectCacheScopePathIsStableAndSafe(t *testing.T) {
	root := t.TempDir()
	context := ProjectCacheContext{ProjectID: "project/a", ProjectName: "东海人鱼国 / 第一季"}
	got := projectCacheScopePath(root, "user/../1", context)
	if !strings.HasPrefix(got, root+string(os.PathSeparator)) {
		t.Fatalf("path escaped root: %s", got)
	}
	if strings.Contains(filepath.Base(got), "/") || strings.Contains(filepath.Base(got), "..") {
		t.Fatalf("unsafe path: %s", got)
	}
	if got != projectCacheScopePath(root, "user/../1", context) {
		t.Fatal("path is not stable")
	}
	renamed := context
	renamed.ProjectName = "改名后的项目"
	if got != projectCacheScopePath(root, "user/../1", renamed) {
		t.Fatal("project name changed the stable cache path")
	}
}

func TestArchiveProjectCacheFileReusesProjectDirectoryAfterRename(t *testing.T) {
	root := t.TempDir()
	var manifestPath string
	for index, name := range []string{"项目旧名", "项目新名"} {
		result, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{
			Context:  ProjectCacheContext{ProjectID: "p1", ProjectName: name, NodeID: fmt.Sprintf("n%d", index)},
			Filename: "image.png",
			MIMEType: "image/png",
			Reader:   strings.NewReader(fmt.Sprintf("image-%d", index)),
		})
		if err != nil {
			t.Fatal(err)
		}
		if manifestPath != "" && result.ManifestPath != manifestPath {
			t.Fatalf("project rename split cache manifests: %q != %q", result.ManifestPath, manifestPath)
		}
		manifestPath = result.ManifestPath
	}
	manifest, err := ReadProjectCacheManifest(manifestPath)
	if err != nil || len(manifest.Files) != 2 || manifest.ProjectName != "项目新名" {
		t.Fatalf("manifest=%#v err=%v", manifest, err)
	}
	list, err := ListUserProjectCaches(root, "u1")
	if err != nil || len(list.Projects) != 1 {
		t.Fatalf("projects=%#v err=%v", list.Projects, err)
	}
}

func TestSafeProjectCacheJoinRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	for _, value := range []string{"../outside.png", "/tmp/outside.png"} {
		if _, err := safeProjectCacheJoin(root, value); err == nil {
			t.Fatalf("unsafe path accepted: %q", value)
		}
	}
}

func TestProjectCacheRelativeDirectoryUsesProductionContext(t *testing.T) {
	tests := []struct {
		name    string
		context ProjectCacheContext
		kind    string
		want    string
	}{
		{"shared", ProjectCacheContext{ProjectID: "p", Category: "character"}, "image", filepath.Join("shared", "character", "images")},
		{"episode", ProjectCacheContext{ProjectID: "p", EpisodeID: "e1", EpisodeName: "第01集", Category: "storyboard"}, "video", filepath.Join("episodes", safeNamedID("第01集", "e1"), "storyboard", "videos")},
		{"free", ProjectCacheContext{ProjectID: "p", CanvasID: "c1", CanvasName: "灵感板", Category: "other", FreeCanvas: true}, "audio", filepath.Join("free-canvas", safeNamedID("灵感板", "c1"), "audios")},
		{"unassigned", ProjectCacheContext{}, "video", "videos"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := projectCacheRelativeDirectory(tt.context, tt.kind); got != tt.want {
				t.Fatalf("got %q want %q", got, tt.want)
			}
		})
	}
}

func TestArchiveProjectCacheFileWritesMediaAndManifest(t *testing.T) {
	root := t.TempDir()
	result, err := ArchiveProjectCacheFile(root, "user-1", ProjectCacheArchiveInput{
		Context:  ProjectCacheContext{ProjectID: "p1", ProjectName: "东海人鱼国", EpisodeID: "e1", EpisodeName: "第01集", Category: "storyboard", NodeID: "node-1"},
		Filename: "shot.mp4",
		MIMEType: "video/mp4",
		Reader:   strings.NewReader("video-bytes"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.File.Kind != "video" || result.File.SHA256 == "" {
		t.Fatalf("unexpected result: %#v", result)
	}
	if _, err := os.Stat(filepath.Join(result.ProjectPath, result.File.RelativePath)); err != nil {
		t.Fatal(err)
	}
	manifest, err := ReadProjectCacheManifest(result.ManifestPath)
	if err != nil || len(manifest.Files) != 1 {
		t.Fatalf("manifest=%#v err=%v", manifest, err)
	}
}

func TestArchiveProjectCacheFileUsesSafeSemanticDiskFilenameWithoutChangingIdentity(t *testing.T) {
	root := t.TempDir()
	context := ProjectCacheContext{
		ProjectID: "project-id", CanvasID: "canvas-id", NodeID: "node-id", AssetID: "asset-id", VersionID: "version-id", Source: "canvas", Category: "storyboard",
	}
	result, err := ArchiveProjectCacheFile(root, "user-1", ProjectCacheArchiveInput{
		Context: context, Filename: "毕业/典礼:画布-节点007-v2.mp4", MIMEType: "video/mp4", Reader: strings.NewReader("video-bytes"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := filepath.Base(result.File.RelativePath); got != "毕业-典礼-画布-节点007-v2.mp4" {
		t.Fatalf("disk filename=%q", got)
	}
	if result.File.OriginalName != "毕业/典礼:画布-节点007-v2.mp4" {
		t.Fatalf("original name=%q", result.File.OriginalName)
	}
	if result.File.Context.ProjectID != context.ProjectID || result.File.Context.CanvasID != context.CanvasID || result.File.Context.NodeID != context.NodeID || result.File.Context.AssetID != context.AssetID || result.File.Context.VersionID != context.VersionID || result.File.Context.Source != context.Source {
		t.Fatalf("identity context changed: %#v", result.File.Context)
	}
}

func TestArchiveProjectCacheFileAddsStableCollisionSuffixWithoutReusingFileID(t *testing.T) {
	root := t.TempDir()
	results := make([]ProjectCacheArchiveResult, 0, 2)
	for _, nodeID := range []string{"node-1", "node-2"} {
		result, err := ArchiveProjectCacheFile(root, "user-1", ProjectCacheArchiveInput{
			Context: ProjectCacheContext{ProjectID: "project-id", NodeID: nodeID}, Filename: "同名结果.mp4", MIMEType: "video/mp4", Reader: strings.NewReader(nodeID),
		})
		if err != nil {
			t.Fatal(err)
		}
		results = append(results, result)
	}
	if results[0].File.ID == results[1].File.ID {
		t.Fatal("distinct cache references reused one file ID")
	}
	if got := filepath.Base(results[0].File.RelativePath); got != "同名结果.mp4" {
		t.Fatalf("first filename=%q", got)
	}
	wantSecond := "同名结果__" + results[1].File.ID[:8] + ".mp4"
	if got := filepath.Base(results[1].File.RelativePath); got != wantSecond {
		t.Fatalf("second filename=%q want=%q", got, wantSecond)
	}
}

func TestSafeProjectCacheFilenameKeepsNodeVersionSuffixWithinFilesystemLimit(t *testing.T) {
	filename := safeProjectCacheFilename(strings.Repeat("超长画布名称", 30)+"-节点007-v12.mp4", "video/mp4")
	if len([]byte(filename)) > 240 {
		t.Fatalf("filename uses %d bytes: %q", len([]byte(filename)), filename)
	}
	if !strings.HasSuffix(filename, "-节点007-v12.mp4") {
		t.Fatalf("node/version suffix lost: %q", filename)
	}
}

func TestArchiveProjectCacheFileDeduplicatesSameReference(t *testing.T) {
	root := t.TempDir()
	input := ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1", NodeID: "n1"}, Filename: "image.png", MIMEType: "image/png"}
	input.Reader = strings.NewReader("same")
	first, err := ArchiveProjectCacheFile(root, "u1", input)
	if err != nil {
		t.Fatal(err)
	}
	input.Reader = strings.NewReader("same")
	second, err := ArchiveProjectCacheFile(root, "u1", input)
	if err != nil {
		t.Fatal(err)
	}
	if first.File.ID != second.File.ID {
		t.Fatalf("duplicate IDs %q %q", first.File.ID, second.File.ID)
	}
	manifest, _ := ReadProjectCacheManifest(first.ManifestPath)
	if len(manifest.Files) != 1 {
		t.Fatalf("files=%d", len(manifest.Files))
	}
}

func TestArchiveProjectCacheFileKeepsDistinctVersions(t *testing.T) {
	root := t.TempDir()
	ids := map[string]bool{}
	for _, version := range []string{"v1", "v2"} {
		result, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{
			Context:  ProjectCacheContext{ProjectID: "p1", NodeID: "n1", VersionID: version},
			Filename: "image.png",
			MIMEType: "image/png",
			Reader:   strings.NewReader("same"),
		})
		if err != nil {
			t.Fatal(err)
		}
		ids[result.File.ID] = true
	}
	if len(ids) != 2 {
		t.Fatalf("version references collapsed: %#v", ids)
	}
}

func TestArchiveProjectCacheFileKeepsDistinctClassificationScopes(t *testing.T) {
	root := t.TempDir()
	ids := map[string]bool{}
	for _, context := range []ProjectCacheContext{
		{ProjectID: "p1", NodeID: "n1", EpisodeID: "e1", Category: "storyboard"},
		{ProjectID: "p1", NodeID: "n1", EpisodeID: "e2", Category: "storyboard"},
		{ProjectID: "p1", NodeID: "n1", CanvasID: "c1", Category: "other", FreeCanvas: true},
	} {
		result, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: context, Filename: "video.mp4", MIMEType: "video/mp4", Reader: strings.NewReader("same")})
		if err != nil {
			t.Fatal(err)
		}
		ids[result.File.ID] = true
	}
	if len(ids) != 3 {
		t.Fatalf("classification scopes collapsed: %#v", ids)
	}
}

func TestArchiveProjectCacheFileConcurrentWritesRemainReadable(t *testing.T) {
	root := t.TempDir()
	var wait sync.WaitGroup
	errors := make(chan error, 20)
	for index := 0; index < 20; index++ {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			_, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{
				Context:  ProjectCacheContext{ProjectID: "p1", NodeID: fmt.Sprintf("n-%d", index)},
				Filename: "image.png",
				MIMEType: "image/png",
				Reader:   strings.NewReader(fmt.Sprintf("image-%d", index)),
			})
			errors <- err
		}(index)
	}
	wait.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	manifestPath := filepath.Join(projectCacheScopePath(root, "u1", ProjectCacheContext{ProjectID: "p1"}), "manifest.json")
	manifest, err := ReadProjectCacheManifest(manifestPath)
	if err != nil || len(manifest.Files) != 20 {
		t.Fatalf("files=%d err=%v", len(manifest.Files), err)
	}
}

func TestArchiveProjectCacheFileSeparatesUsers(t *testing.T) {
	root := t.TempDir()
	input := ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1"}, Filename: "image.png", MIMEType: "image/png"}
	input.Reader = strings.NewReader("a")
	first, err := ArchiveProjectCacheFile(root, "u1", input)
	if err != nil {
		t.Fatal(err)
	}
	input.Reader = strings.NewReader("a")
	second, err := ArchiveProjectCacheFile(root, "u2", input)
	if err != nil {
		t.Fatal(err)
	}
	if first.ProjectPath == second.ProjectPath {
		t.Fatalf("shared user directory: %s", first.ProjectPath)
	}
}

func TestListUserProjectCachesReportsMissingFiles(t *testing.T) {
	root := t.TempDir()
	first, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1", ProjectName: "A"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p2", ProjectName: "B"}, Filename: "b.png", MIMEType: "image/png", Reader: strings.NewReader("b")}); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(first.ProjectPath, first.File.RelativePath)); err != nil {
		t.Fatal(err)
	}
	list, err := ListUserProjectCaches(root, "u1")
	if err != nil || len(list.Projects) != 2 {
		t.Fatalf("projects=%d err=%v", len(list.Projects), err)
	}
	if list.PendingCount != 1 {
		t.Fatalf("pending=%d projects=%#v", list.PendingCount, list.Projects)
	}
}

func TestSetProjectCacheStatusDoesNotDeleteFiles(t *testing.T) {
	root := t.TempDir()
	archived, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := SetUserProjectCacheStatus(root, "u1", "p1", "deleted")
	if err != nil || manifest.Status != "deleted" {
		t.Fatalf("manifest=%#v err=%v", manifest, err)
	}
	if _, err := os.Stat(filepath.Join(archived.ProjectPath, archived.File.RelativePath)); err != nil {
		t.Fatal(err)
	}
}

func TestMoveUnassignedCacheFileMovesMediaAndManifestReference(t *testing.T) {
	root := t.TempDir()
	archived, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
	if err != nil {
		t.Fatal(err)
	}
	moved, err := MoveUserProjectCacheFile(root, "u1", archived.File.ID, ProjectCacheContext{ProjectID: "p1", ProjectName: "A", EpisodeID: "e1", EpisodeName: "第01集", Category: "character"})
	if err != nil || moved.File.Context.ProjectID != "p1" {
		t.Fatalf("moved=%#v err=%v", moved, err)
	}
	oldManifest, err := ReadProjectCacheManifest(archived.ManifestPath)
	if err != nil || len(oldManifest.Files) != 0 {
		t.Fatalf("old files=%#v err=%v", oldManifest.Files, err)
	}
	if _, err := os.Stat(filepath.Join(moved.ProjectPath, moved.File.RelativePath)); err != nil {
		t.Fatal(err)
	}
}

func TestMoveAssignedCacheFileIsRejectedWithoutDeletingIt(t *testing.T) {
	root := t.TempDir()
	archived, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := MoveUserProjectCacheFile(root, "u1", archived.File.ID, ProjectCacheContext{ProjectID: "p2"}); err == nil {
		t.Fatal("assigned cache file was moved")
	}
	if _, err := os.Stat(filepath.Join(archived.ProjectPath, archived.File.RelativePath)); err != nil {
		t.Fatal(err)
	}
}

func TestDeleteProjectCacheRequiresExactUserScope(t *testing.T) {
	root := t.TempDir()
	archived, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
	if err != nil {
		t.Fatal(err)
	}
	if err := DeleteUserProjectCache(root, "u2", "p1"); err == nil {
		t.Fatal("other user deleted cache")
	}
	if _, err := os.Stat(archived.ProjectPath); err != nil {
		t.Fatal(err)
	}
}

func TestWriteProjectCachePackageIncludesMetadataAndMedia(t *testing.T) {
	root := t.TempDir()
	_, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1", ProjectName: "项目 A"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	result, err := WriteProjectCachePackage(&output, root, "u1", ProjectCachePackageInput{
		ProjectID: "p1",
		Snapshot: ProjectCachePackageSnapshot{
			Project:     json.RawMessage(`{"id":"p1"}`),
			Canvases:    json.RawMessage(`[]`),
			Scripts:     json.RawMessage(`{}`),
			Storyboards: json.RawMessage(`{}`),
			Assets:      json.RawMessage(`[]`),
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(output.Bytes()), int64(output.Len()))
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, item := range zr.File {
		names[item.Name] = true
	}
	for _, name := range []string{"package-manifest.json", "metadata/project.json", "metadata/canvases.json", "metadata/scripts.json", "metadata/storyboards.json", "metadata/assets.json"} {
		if !names[name] {
			t.Fatalf("missing %s", name)
		}
	}
	if result.Filename == "" {
		t.Fatal("missing package filename")
	}
}

func TestProjectCachePackagePreflightReportsMissingMedia(t *testing.T) {
	root := t.TempDir()
	archived, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(archived.ProjectPath, archived.File.RelativePath)); err != nil {
		t.Fatal(err)
	}
	result, err := PreflightProjectCachePackage(root, "u1", "p1")
	if err != nil || len(result.Missing) != 1 || result.Missing[0] != archived.File.RelativePath {
		t.Fatalf("result=%#v err=%v", result, err)
	}
}

func TestWriteProjectCachePackageRejectsMissingMediaWithoutContinueFlag(t *testing.T) {
	root := t.TempDir()
	archived, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(archived.ProjectPath, archived.File.RelativePath)); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	_, err = WriteProjectCachePackage(&output, root, "u1", ProjectCachePackageInput{ProjectID: "p1", Snapshot: ProjectCachePackageSnapshot{}, ContinueOnMissing: false})
	if err == nil || output.Len() != 0 {
		t.Fatalf("err=%v bytes=%d", err, output.Len())
	}
}

func TestWriteProjectCacheSelectionPackageIncludesOnlySelectedMedia(t *testing.T) {
	root := t.TempDir()
	first, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1", ProjectName: "项目 A", NodeID: "n1"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
	if err != nil {
		t.Fatal(err)
	}
	second, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1", ProjectName: "项目 A", NodeID: "n2"}, Filename: "b.png", MIMEType: "image/png", Reader: strings.NewReader("b")})
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	result, err := WriteProjectCacheSelectionPackage(&output, root, "u1", ProjectCacheSelectionInput{ProjectID: "p1", FileIDs: []string{second.File.ID}})
	if err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(output.Bytes()), int64(output.Len()))
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, item := range zr.File {
		names[item.Name] = true
	}
	if !names["selection-manifest.json"] || !names[second.File.RelativePath] || names[first.File.RelativePath] {
		t.Fatalf("zip entries=%#v", names)
	}
	if result.Manifest.FileCount != 1 || !strings.Contains(result.Filename, "所选缓存") {
		t.Fatalf("result=%#v", result)
	}
}

func TestWriteProjectCacheSelectionPackageRejectsInvalidSelection(t *testing.T) {
	root := t.TempDir()
	first, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1", ProjectName: "项目 A"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
	if err != nil {
		t.Fatal(err)
	}
	other, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p2", ProjectName: "项目 B"}, Filename: "b.png", MIMEType: "image/png", Reader: strings.NewReader("b")})
	if err != nil {
		t.Fatal(err)
	}
	missing, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1", ProjectName: "项目 A", NodeID: "missing"}, Filename: "missing.png", MIMEType: "image/png", Reader: strings.NewReader("missing")})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(missing.ProjectPath, missing.File.RelativePath)); err != nil {
		t.Fatal(err)
	}
	for name, fileIDs := range map[string][]string{
		"empty":         {},
		"duplicate":     {first.File.ID, first.File.ID},
		"unknown":       {"does-not-exist"},
		"other-project": {other.File.ID},
		"missing":       {missing.File.ID},
	} {
		t.Run(name, func(t *testing.T) {
			var output bytes.Buffer
			if _, err := WriteProjectCacheSelectionPackage(&output, root, "u1", ProjectCacheSelectionInput{ProjectID: "p1", FileIDs: fileIDs}); err == nil || output.Len() != 0 {
				t.Fatalf("err=%v bytes=%d", err, output.Len())
			}
		})
	}
}
