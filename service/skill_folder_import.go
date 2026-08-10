package service

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"path"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Masterminds/semver/v3"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"gopkg.in/yaml.v3"
)

const (
	skillFolderMaxFiles           = 128
	skillFolderMaxFileBytes       = 2 << 20
	skillFolderMaxBytes           = 32 << 20
	importedSkillRawSchemaVersion = "0.1.0"
)

var skillFolderArchiveTime = time.Date(1980, time.January, 1, 0, 0, 0, 0, time.UTC)
var skillFolderFrontmatterOpen = regexp.MustCompile(`^---[\t ]*(?:\r?\n|$)`)
var skillFolderFrontmatterBlock = regexp.MustCompile(`(?s)^---[\t ]*\r?\n(.*?)\r?\n(?:---|\.\.\.)[\t ]*(?:\r?\n|$)`)

type SkillFolderFile struct {
	Path string
	Data []byte
}

type SkillFolderMetadata struct {
	Name        string `json:"name" yaml:"name"`
	Description string `json:"description" yaml:"description"`
	Version     string `json:"version" yaml:"version"`
}

type SkillFolderFileIndex struct {
	Path     string `json:"path"`
	MIMEType string `json:"mimeType"`
	Hash     string `json:"hash"`
	Size     int64  `json:"size"`
	Text     bool   `json:"text"`
}

type SkillFolderSnapshot struct {
	FolderName string
	Metadata   SkillFolderMetadata
	TextFiles  map[string]string
	FileIndex  []SkillFolderFileIndex
	Archive    []byte
	SourceHash string
}

type SkillFolderImportInput struct {
	OwnerType       model.SkillOwnerType
	ProjectID       string
	StageKey        string
	Name            string
	Summary         string
	SummaryProvided bool
	Version         string
	VersionProvided bool
	Snapshot        SkillFolderSnapshot
}

type normalizedSkillFolderFile struct {
	path string
	data []byte
}

func ParseSkillFolder(folderName string, input []SkillFolderFile) (SkillFolderSnapshot, error) {
	if len(input) == 0 || len(input) > skillFolderMaxFiles {
		return SkillFolderSnapshot{}, safeMessageError{message: "Skill 文件夹文件数量必须在 1–128 个之间"}
	}
	files := make([]normalizedSkillFolderFile, 0, len(input))
	total := 0
	for _, item := range input {
		filePath, err := normalizeImportedSkillPath(item.Path)
		if err != nil {
			return SkillFolderSnapshot{}, err
		}
		if skillFolderTrashFile(filePath) {
			continue
		}
		if len(item.Data) > skillFolderMaxFileBytes {
			return SkillFolderSnapshot{}, safeMessageError{message: "Skill 文件夹包含过大的单个文件"}
		}
		total += len(item.Data)
		if total > skillFolderMaxBytes {
			return SkillFolderSnapshot{}, safeMessageError{message: "Skill 文件夹总大小超过 32 MiB"}
		}
		files = append(files, normalizedSkillFolderFile{path: filePath, data: append([]byte(nil), item.Data...)})
	}
	files = stripSkillFolderRoot(files)
	sort.Slice(files, func(i, j int) bool { return files[i].path < files[j].path })
	seen := map[string]bool{}
	for _, item := range files {
		if seen[item.path] {
			return SkillFolderSnapshot{}, safeMessageError{message: "Skill 文件夹包含重复路径"}
		}
		seen[item.path] = true
	}
	if !seen["SKILL.md"] {
		return SkillFolderSnapshot{}, safeMessageError{message: "Skill 文件夹根目录缺少 SKILL.md"}
	}
	textFiles := map[string]string{}
	index := make([]SkillFolderFileIndex, 0, len(files))
	var archive bytes.Buffer
	writer := zip.NewWriter(&archive)
	hasher := sha256.New()
	for _, item := range files {
		text := skillFolderTextFile(item.path)
		if text && !utf8.Valid(item.data) {
			return SkillFolderSnapshot{}, safeMessageError{message: "Skill 文本文件必须使用 UTF-8 编码"}
		}
		if text {
			textFiles[item.path] = string(item.data)
		}
		digest := sha256.Sum256(item.data)
		mimeType := mime.TypeByExtension(path.Ext(item.path))
		if mimeType == "" {
			mimeType = http.DetectContentType(item.data)
		}
		index = append(index, SkillFolderFileIndex{Path: item.path, MIMEType: mimeType, Hash: "sha256:" + hex.EncodeToString(digest[:]), Size: int64(len(item.data)), Text: text})
		_ = binary.Write(hasher, binary.BigEndian, uint32(len(item.path)))
		_, _ = hasher.Write([]byte(item.path))
		_ = binary.Write(hasher, binary.BigEndian, uint64(len(item.data)))
		_, _ = hasher.Write(item.data)
		header := &zip.FileHeader{Name: item.path, Method: zip.Deflate}
		header.SetModTime(skillFolderArchiveTime)
		entry, err := writer.CreateHeader(header)
		if err != nil {
			return SkillFolderSnapshot{}, err
		}
		if _, err := entry.Write(item.data); err != nil {
			return SkillFolderSnapshot{}, err
		}
	}
	if err := writer.Close(); err != nil {
		return SkillFolderSnapshot{}, err
	}
	metadata, err := parseSkillFolderMetadata(textFiles["SKILL.md"])
	if err != nil {
		return SkillFolderSnapshot{}, err
	}
	if metadata.Name == "" {
		metadata.Name = strings.TrimSpace(folderName)
	}
	return SkillFolderSnapshot{
		FolderName: strings.TrimSpace(folderName), Metadata: metadata, TextFiles: textFiles, FileIndex: index,
		Archive: archive.Bytes(), SourceHash: "sha256:" + hex.EncodeToString(hasher.Sum(nil)),
	}, nil
}

func normalizeImportedSkillPath(value string) (string, error) {
	value = strings.TrimSpace(strings.ReplaceAll(value, "\\", "/"))
	if value == "" || path.IsAbs(value) {
		return "", safeMessageError{message: "Skill 文件路径无效"}
	}
	for _, part := range strings.Split(value, "/") {
		if part == ".." || part == "" {
			return "", safeMessageError{message: "Skill 文件路径无效"}
		}
	}
	value = path.Clean(value)
	if value == "." || strings.HasPrefix(value, "../") {
		return "", safeMessageError{message: "Skill 文件路径无效"}
	}
	return value, nil
}

func stripSkillFolderRoot(files []normalizedSkillFolderFile) []normalizedSkillFolderFile {
	if len(files) == 0 {
		return files
	}
	root := strings.SplitN(files[0].path, "/", 2)
	if len(root) != 2 {
		return files
	}
	prefix := root[0] + "/"
	for _, item := range files {
		if !strings.HasPrefix(item.path, prefix) {
			return files
		}
	}
	for index := range files {
		files[index].path = strings.TrimPrefix(files[index].path, prefix)
	}
	return files
}

func skillFolderTrashFile(filePath string) bool {
	name := path.Base(filePath)
	return name == ".DS_Store" || strings.EqualFold(name, "Thumbs.db")
}

func skillFolderTextFile(filePath string) bool {
	switch strings.ToLower(path.Ext(filePath)) {
	case ".md", ".txt", ".json", ".yaml", ".yml", ".csv":
		return true
	default:
		return false
	}
}

func parseSkillFolderMetadata(content string) (SkillFolderMetadata, error) {
	content = strings.TrimPrefix(content, "\ufeff")
	if !skillFolderFrontmatterOpen.MatchString(content) {
		return SkillFolderMetadata{}, nil
	}
	match := skillFolderFrontmatterBlock.FindStringSubmatch(content)
	if len(match) != 2 {
		return SkillFolderMetadata{}, safeMessageError{message: "SKILL.md frontmatter 格式错误"}
	}
	var metadata SkillFolderMetadata
	if err := yaml.Unmarshal([]byte(match[1]), &metadata); err != nil {
		return SkillFolderMetadata{}, safeMessageError{message: "SKILL.md frontmatter 格式错误"}
	}
	metadata.Name = strings.TrimSpace(metadata.Name)
	metadata.Description = strings.TrimSpace(metadata.Description)
	metadata.Version = strings.TrimSpace(metadata.Version)
	return metadata, nil
}

func ImportManagedSkillFolder(userID string, isAdmin bool, input SkillFolderImportInput) (ResolvedSkill, error) {
	if input.OwnerType != model.SkillOwnerSystem {
		return ResolvedSkill{}, safeMessageError{message: "项目 Skill 已停用，请由管理员在 Skill 中心统一管理"}
	}
	if !isAdmin {
		return ResolvedSkill{}, safeMessageError{message: "只有管理员可以导入 System Skill"}
	}
	template, err := ResolveSkillStageTemplate(input.StageKey)
	if err != nil {
		return ResolvedSkill{}, err
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = strings.TrimSpace(input.Snapshot.Metadata.Name)
	}
	if name == "" {
		name = strings.TrimSpace(input.Snapshot.FolderName)
	}
	if name == "" {
		return ResolvedSkill{}, safeMessageError{message: "缺少 Skill 名称"}
	}
	summary := strings.TrimSpace(input.Summary)
	if !input.SummaryProvided && summary == "" {
		summary = strings.TrimSpace(input.Snapshot.Metadata.Description)
	}
	versionName := strings.TrimSpace(input.Version)
	if !input.VersionProvided && versionName == "" {
		versionName = strings.TrimSpace(input.Snapshot.Metadata.Version)
	}
	if versionName == "" {
		versionName = "1.0.0"
	}
	packageValue, err := BuildImportedSkillPackage(template.Key, input.Snapshot.TextFiles)
	if err != nil {
		return ResolvedSkill{}, err
	}
	packageValue, err = freezeImportedSkillRawContract(packageValue, template)
	if err != nil {
		return ResolvedSkill{}, err
	}
	if !skillSemanticVersionRegexp.MatchString(versionName) {
		return ResolvedSkill{}, safeMessageError{message: "Skill 版本必须使用 x.y.z"}
	}
	stamp := now()
	skill := model.SkillDefinition{
		ID: newID("skill"), Name: name, Summary: summary, OwnerType: model.SkillOwnerSystem, OwnerUserID: "",
		OwnerProjectID: "", StageKey: template.Key, Enabled: true, CreatedAt: stamp, UpdatedAt: stamp,
	}
	version := importedSkillVersion(newID("skillversion"), skill.ID, versionName, userID, stamp, packageValue, input.Snapshot, template)
	if err := repository.CreateSkillAggregateWithAudit(skill, version, skillAudit(userID, "import_folder", skill, version.ID, stamp)); err != nil {
		return ResolvedSkill{}, err
	}
	return ResolvedSkill{Skill: skill, Version: version, Package: packageValue}, nil
}

func ImportOwnedSkillFolderVersion(userID string, isAdmin bool, skillID, versionName string, versionProvided bool, snapshot SkillFolderSnapshot) (model.SkillVersion, error) {
	skill, err := editableSkill(userID, isAdmin, skillID)
	if err != nil {
		return model.SkillVersion{}, err
	}
	if skill.StageKey == "" {
		return model.SkillVersion{}, safeMessageError{message: "当前 Skill 没有所属阶段，不能导入文件夹版本"}
	}
	versions, err := repository.ListSkillVersions(skill.ID)
	if err != nil {
		return model.SkillVersion{}, err
	}
	for _, existing := range versions {
		if existing.SourceHash != "" && existing.SourceHash == snapshot.SourceHash {
			return model.SkillVersion{}, safeMessageError{message: "相同内容已经导入，无需重复创建版本"}
		}
	}
	versionName = strings.TrimSpace(versionName)
	if !versionProvided && versionName == "" {
		versionName = strings.TrimSpace(snapshot.Metadata.Version)
	}
	if versionName == "" {
		versionName = nextImportedSkillVersion(versions)
	}
	if !skillSemanticVersionRegexp.MatchString(versionName) {
		return model.SkillVersion{}, safeMessageError{message: "Skill 版本必须使用 x.y.z"}
	}
	for _, existing := range versions {
		if existing.Version == versionName {
			return model.SkillVersion{}, safeMessageError{message: "Skill 版本号已存在"}
		}
	}
	template, err := ResolveSkillStageTemplate(skill.StageKey)
	if err != nil {
		return model.SkillVersion{}, err
	}
	packageValue, err := BuildImportedSkillPackage(template.Key, snapshot.TextFiles)
	if err != nil {
		return model.SkillVersion{}, err
	}
	packageValue, err = freezeImportedSkillRawContract(packageValue, template)
	if err != nil {
		return model.SkillVersion{}, err
	}
	stamp := now()
	version := importedSkillVersion(newID("skillversion"), skill.ID, versionName, userID, stamp, packageValue, snapshot, template)
	if err := repository.CreateSkillVersionWithAudit(version, skillAudit(userID, "import_folder_version", skill, version.ID, stamp)); err != nil {
		if current, listErr := repository.ListSkillVersions(skill.ID); listErr == nil {
			for _, existing := range current {
				if existing.SourceHash == snapshot.SourceHash {
					return model.SkillVersion{}, safeMessageError{message: "相同内容已经导入，无需重复创建版本"}
				}
				if existing.Version == versionName {
					return model.SkillVersion{}, safeMessageError{message: "Skill 版本号已存在"}
				}
			}
		}
		return model.SkillVersion{}, err
	}
	return version, nil
}

func importedSkillVersion(id, skillID, versionName, userID, stamp string, packageValue SkillPackage, snapshot SkillFolderSnapshot, template SkillStageTemplate) model.SkillVersion {
	version := skillVersionFromPackage(id, skillID, versionName, userID, stamp, packageValue)
	fileIndex, _ := json.Marshal(snapshot.FileIndex)
	metadata, _ := json.Marshal(struct {
		FolderName           string              `json:"folderName"`
		Metadata             SkillFolderMetadata `json:"metadata"`
		StageKey             string              `json:"stageKey"`
		StageTemplateVersion string              `json:"stageTemplateVersion"`
		FixedAdapter         WorkflowAdapterRef  `json:"fixedAdapter"`
		RawSchemaVersion     string              `json:"rawSchemaVersion"`
		RawSchemaContentHash string              `json:"rawSchemaContentHash"`
	}{snapshot.FolderName, snapshot.Metadata, template.Key, template.TemplateVersion, template.FixedAdapter, packageValue.OutputContract.SchemaVersion, importedSkillRawSchemaHash(packageValue.OutputContract.Schema)})
	version.SourceKind = "folder_import"
	version.SourceHash = snapshot.SourceHash
	version.SourceIdentity = &version.SourceHash
	version.SourceArchiveBlob = append([]byte(nil), snapshot.Archive...)
	version.SourceFileIndexJSON = string(fileIndex)
	version.ImportMetadataJSON = string(metadata)
	return version
}

func freezeImportedSkillRawContract(packageValue SkillPackage, template SkillStageTemplate) (SkillPackage, error) {
	raw, err := json.Marshal(packageValue.OutputContract.Schema)
	if err != nil {
		return SkillPackage{}, err
	}
	var schema map[string]any
	if json.Unmarshal(raw, &schema) != nil {
		return SkillPackage{}, safeMessageError{message: "Skill raw 输出 Schema 无效"}
	}
	switch template.FixedAdapter.TransformKind {
	case "stage-art-normalize-v1":
		removeImportedRawRequired(schema, "assetId")
	case "stage-storyboard-normalize-v1", "stage-storyboard-vertical-short-normalize-v1", "stage-storyboard-horizontal-long-normalize-v1":
		removeImportedRawRequired(schema, "shotId", "sceneKey")
	}
	packageValue.OutputContract.SchemaVersion = importedSkillRawSchemaVersion
	packageValue.OutputContract.Schema = schema
	return ValidateInvocableSkillPackage(packageValue)
}

func removeImportedRawRequired(value any, names ...string) {
	remove := map[string]bool{}
	for _, name := range names {
		remove[name] = true
	}
	switch item := value.(type) {
	case map[string]any:
		if required, ok := item["required"].([]any); ok {
			kept := required[:0]
			for _, field := range required {
				name, _ := field.(string)
				if !remove[name] {
					kept = append(kept, field)
				}
			}
			item["required"] = kept
		}
		for _, child := range item {
			removeImportedRawRequired(child, names...)
		}
	case []any:
		for _, child := range item {
			removeImportedRawRequired(child, names...)
		}
	}
}

func importedSkillRawSchemaHash(schema map[string]any) string {
	raw, _, err := canonicalJSONObject(schema)
	if err != nil {
		return ""
	}
	digest := sha256.Sum256(raw)
	return "sha256:" + hex.EncodeToString(digest[:])
}

func nextImportedSkillVersion(versions []model.SkillVersion) string {
	var highest *semver.Version
	for _, item := range versions {
		parsed, err := semver.NewVersion(item.Version)
		if err == nil && (highest == nil || parsed.GreaterThan(highest)) {
			highest = parsed
		}
	}
	if highest == nil {
		return "1.0.0"
	}
	next := highest.IncPatch()
	return next.String()
}

func GetManagedSkillSourceFiles(userID, versionID string, isAdmin bool) ([]SkillFolderFileIndex, error) {
	version, _, err := GetManagedSkillVersionPackage(userID, versionID, isAdmin)
	if err != nil {
		return nil, err
	}
	if version.SourceKind != "folder_import" || len(version.SourceArchiveBlob) == 0 {
		return nil, safeMessageError{message: "当前 Skill 版本不是文件夹导入版本"}
	}
	var files []SkillFolderFileIndex
	if json.Unmarshal([]byte(version.SourceFileIndexJSON), &files) != nil {
		return nil, safeMessageError{message: "Skill 文件索引损坏"}
	}
	return files, nil
}

func GetManagedSkillSourceText(userID, versionID, filePath string, isAdmin bool) (string, error) {
	version, _, err := GetManagedSkillVersionPackage(userID, versionID, isAdmin)
	if err != nil {
		return "", err
	}
	filePath, err = normalizeImportedSkillPath(filePath)
	if err != nil {
		return "", err
	}
	files, err := GetManagedSkillSourceFiles(userID, versionID, isAdmin)
	if err != nil {
		return "", err
	}
	wantHash := ""
	for _, item := range files {
		if item.Path == filePath && item.Text {
			wantHash = item.Hash
			break
		}
	}
	if wantHash == "" {
		return "", safeMessageError{message: "Skill 文本文件不存在或不可预览"}
	}
	reader, err := zip.NewReader(bytes.NewReader(version.SourceArchiveBlob), int64(len(version.SourceArchiveBlob)))
	if err != nil {
		return "", safeMessageError{message: "Skill 文件快照损坏"}
	}
	for _, file := range reader.File {
		if file.Name != filePath {
			continue
		}
		opened, err := file.Open()
		if err != nil {
			return "", err
		}
		content, readErr := io.ReadAll(io.LimitReader(opened, skillFolderMaxFileBytes+1))
		_ = opened.Close()
		if readErr != nil || len(content) > skillFolderMaxFileBytes || !utf8.Valid(content) {
			return "", safeMessageError{message: "Skill 文本文件损坏"}
		}
		digest := sha256.Sum256(content)
		if "sha256:"+hex.EncodeToString(digest[:]) != wantHash {
			return "", safeMessageError{message: "Skill 文件哈希不一致"}
		}
		return string(content), nil
	}
	return "", safeMessageError{message: "Skill 文本文件不存在"}
}
