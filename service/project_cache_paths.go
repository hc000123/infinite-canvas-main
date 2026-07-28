package service

import (
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"strings"
	"unicode"
)

func stableSegmentHash(value string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(value)))
	return hex.EncodeToString(sum[:])[:12]
}

func safeDisplaySegment(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "未命名"
	}
	runes := make([]rune, 0, 48)
	separator := false
	for _, item := range value {
		if unicode.IsLetter(item) || unicode.IsNumber(item) || item == '-' || item == '_' {
			runes = append(runes, item)
			separator = false
		} else if !separator && len(runes) > 0 {
			runes = append(runes, '-')
			separator = true
		}
		if len(runes) >= 48 {
			break
		}
	}
	result := strings.Trim(string(runes), "-_")
	if result == "" {
		return "未命名"
	}
	return result
}

func safeNamedID(name, id string) string {
	return safeDisplaySegment(name) + "__" + stableSegmentHash(id)
}

func projectCacheUserRoot(root, userID string) string {
	return filepath.Join(root, "users", "user_"+stableSegmentHash(userID))
}

func projectCacheScopePath(root, userID string, context ProjectCacheContext) string {
	userRoot := projectCacheUserRoot(root, userID)
	if strings.TrimSpace(context.ProjectID) == "" {
		return filepath.Join(userRoot, "unassigned")
	}
	return filepath.Join(userRoot, "projects", "project_"+stableSegmentHash(context.ProjectID))
}

func safeProjectCacheJoin(root, relativePath string) (string, error) {
	if filepath.IsAbs(relativePath) {
		return "", safeMessageError{message: "缓存文件路径无效"}
	}
	clean := filepath.Clean(filepath.FromSlash(relativePath))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", safeMessageError{message: "缓存文件路径无效"}
	}
	absolute := filepath.Join(root, clean)
	relative, err := filepath.Rel(root, absolute)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", safeMessageError{message: "缓存文件路径无效"}
	}
	return absolute, nil
}

func normalizeProjectCacheCategory(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "character", "scene", "prop", "storyboard":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "other"
	}
}

func projectCacheKindFromMIME(value string) string {
	value = strings.ToLower(strings.TrimSpace(strings.Split(value, ";")[0]))
	for _, kind := range []string{"image", "video", "audio"} {
		if strings.HasPrefix(value, kind+"/") {
			return kind
		}
	}
	return ""
}

func projectCacheKindDirectory(kind string) string {
	switch kind {
	case "image":
		return "images"
	case "video":
		return "videos"
	case "audio":
		return "audios"
	default:
		return "files"
	}
}

func projectCacheRelativeDirectory(context ProjectCacheContext, kind string) string {
	kindDir := projectCacheKindDirectory(kind)
	if strings.TrimSpace(context.ProjectID) == "" {
		return kindDir
	}
	category := normalizeProjectCacheCategory(context.Category)
	if context.FreeCanvas {
		return filepath.Join("free-canvas", safeNamedID(context.CanvasName, context.CanvasID), kindDir)
	}
	if strings.TrimSpace(context.EpisodeID) != "" {
		return filepath.Join("episodes", safeNamedID(context.EpisodeName, context.EpisodeID), category, kindDir)
	}
	return filepath.Join("shared", category, kindDir)
}

func projectCacheExtension(mimeType, filename string) string {
	_ = filename
	switch strings.ToLower(strings.TrimSpace(strings.Split(mimeType, ";")[0])) {
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "image/png":
		return ".png"
	case "video/webm":
		return ".webm"
	case "audio/mpeg":
		return ".mp3"
	case "audio/wav":
		return ".wav"
	case "audio/ogg":
		return ".ogg"
	case "audio/mp4":
		return ".m4a"
	case "video/mp4":
		return ".mp4"
	default:
		return ".png"
	}
}
