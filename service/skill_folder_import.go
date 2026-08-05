package service

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"mime"
	"net/http"
	"path"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"gopkg.in/yaml.v3"
)

const (
	skillFolderMaxFiles     = 128
	skillFolderMaxFileBytes = 2 << 20
	skillFolderMaxBytes     = 32 << 20
)

var skillFolderArchiveTime = time.Date(1980, time.January, 1, 0, 0, 0, 0, time.UTC)

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
	if !strings.HasPrefix(content, "---\n") {
		return SkillFolderMetadata{}, nil
	}
	end := strings.Index(content[4:], "\n---")
	if end < 0 {
		return SkillFolderMetadata{}, safeMessageError{message: "SKILL.md frontmatter 格式错误"}
	}
	var metadata SkillFolderMetadata
	if err := yaml.Unmarshal([]byte(content[4:4+end]), &metadata); err != nil {
		return SkillFolderMetadata{}, safeMessageError{message: "SKILL.md frontmatter 格式错误"}
	}
	metadata.Name = strings.TrimSpace(metadata.Name)
	metadata.Description = strings.TrimSpace(metadata.Description)
	metadata.Version = strings.TrimSpace(metadata.Version)
	return metadata, nil
}
