package service

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

type jimengPreparedVideoCommand struct {
	args    []string
	tempDir string
	cleanup func()
}

func prepareJimengVideoCommand(body []byte, contentType, modelVersion string, sessionID int) (jimengPreparedVideoCommand, error) {
	if !strings.HasPrefix(contentType, "multipart/form-data") {
		args, err := BuildJimengText2VideoArgs(body, contentType, modelVersion, sessionID)
		return jimengPreparedVideoCommand{args: args, cleanup: func() {}}, err
	}
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return jimengPreparedVideoCommand{}, err
	}
	form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
	if err != nil {
		return jimengPreparedVideoCommand{}, err
	}
	defer form.RemoveAll()

	mode := strings.TrimSpace(firstArkFormValue(form.Value, "dreamina_mode"))
	prompt := strings.TrimSpace(firstArkFormValue(form.Value, "prompt"))
	if prompt == "" {
		return jimengPreparedVideoCommand{}, errors.New("缺少视频提示词")
	}
	images, imageRoles := form.File["input_image[]"], form.Value["input_image_role[]"]
	videos, audios := form.File["input_video[]"], form.File["input_audio[]"]
	if mode == "" || mode == "auto" {
		mode = inferJimengMode(len(images), len(videos), len(audios), imageRoles)
	}
	if err := validateJimengModeInputs(mode, len(images), len(videos), len(audios)); err != nil {
		return jimengPreparedVideoCommand{}, err
	}

	tempDir := ""
	cleanup := func() {}
	if len(images)+len(videos)+len(audios) > 0 {
		tempDir, err = os.MkdirTemp("", "infinite-canvas-dreamina-*")
		if err != nil {
			return jimengPreparedVideoCommand{}, err
		}
		var once sync.Once
		cleanup = func() { once.Do(func() { _ = os.RemoveAll(tempDir) }) }
	}
	fail := func(err error) (jimengPreparedVideoCommand, error) {
		cleanup()
		return jimengPreparedVideoCommand{}, err
	}
	imagePaths, err := stageJimengFiles(tempDir, "image", images, jimengImageFile)
	if err != nil {
		return fail(err)
	}
	videoPaths, err := stageJimengFiles(tempDir, "video", videos, jimengVideoFile)
	if err != nil {
		return fail(err)
	}
	audioPaths, err := stageJimengFiles(tempDir, "audio", audios, jimengAudioFile)
	if err != nil {
		return fail(err)
	}

	fields := jimengVideoFields{
		Prompt:     prompt,
		Duration:   firstArkFormAliasValue(form.Value, "duration", "seconds"),
		Ratio:      firstArkFormAliasValue(form.Value, "ratio", "size"),
		Resolution: firstArkFormAliasValue(form.Value, "video_resolution", "resolution", "resolution_name"),
	}
	args, err := buildJimengModeArgs(mode, fields, modelVersion, sessionID, imagePaths, imageRoles, videoPaths, audioPaths)
	if err != nil {
		return fail(err)
	}
	return jimengPreparedVideoCommand{args: args, tempDir: tempDir, cleanup: cleanup}, nil
}

func inferJimengMode(imageCount, videoCount, audioCount int, roles []string) string {
	if videoCount > 0 || audioCount > 0 {
		return "multimodal2video"
	}
	if imageCount == 0 {
		return "text2video"
	}
	if imageCount == 1 {
		return "image2video"
	}
	if imageCount == 2 && len(roles) >= 2 && strings.TrimSpace(roles[0]) == "first_frame" && strings.TrimSpace(roles[1]) == "last_frame" {
		return "frames2video"
	}
	return "multiframe2video"
}

func validateJimengModeInputs(mode string, imageCount, videoCount, audioCount int) error {
	switch mode {
	case "text2video":
		if imageCount+videoCount+audioCount > 0 {
			return errors.New("文生视频不能携带参考素材")
		}
	case "image2video":
		if imageCount != 1 || videoCount+audioCount > 0 {
			return errors.New("图生视频需要恰好 1 张图片")
		}
	case "frames2video":
		if imageCount != 2 || videoCount+audioCount > 0 {
			return errors.New("首尾帧需要恰好 2 张图片")
		}
	case "multiframe2video":
		if imageCount < 2 || imageCount > 20 || videoCount+audioCount > 0 {
			return errors.New("多帧故事需要 2-20 张图片，且不能包含视频或音频")
		}
	case "multimodal2video":
		if imageCount == 0 && videoCount == 0 {
			return errors.New("全能参考至少需要图片或视频")
		}
		if imageCount > 9 || videoCount > 3 || audioCount > 3 || imageCount+videoCount+audioCount > 12 {
			return errors.New("全能参考最多支持 9 张图片、3 个视频、3 个音频且素材总数不超过 12 个")
		}
	default:
		return errors.New("不支持的即梦视频模式")
	}
	return nil
}

type jimengFileKind int

const (
	jimengImageFile jimengFileKind = iota
	jimengVideoFile
	jimengAudioFile
)

func stageJimengFiles(tempDir, prefix string, files []*multipart.FileHeader, kind jimengFileKind) ([]string, error) {
	paths := make([]string, 0, len(files))
	for index, header := range files {
		ext := strings.ToLower(filepath.Ext(header.Filename))
		if !jimengFileExtensionAllowed(ext, kind) || !jimengDeclaredMIMEAllowed(header.Header.Get("Content-Type"), kind) {
			return nil, jimengUnsupportedFileError(kind)
		}
		source, err := header.Open()
		if err != nil {
			return nil, err
		}
		content, err := io.ReadAll(source)
		_ = source.Close()
		if err != nil {
			return nil, err
		}
		if !jimengFileSignatureAllowed(content, kind) {
			return nil, jimengUnsupportedFileError(kind)
		}
		path := filepath.Join(tempDir, fmt.Sprintf("%s-%02d%s", prefix, index+1, ext))
		if err := os.WriteFile(path, content, 0600); err != nil {
			return nil, err
		}
		paths = append(paths, path)
	}
	return paths, nil
}

func jimengDeclaredMIMEAllowed(value string, kind jimengFileKind) bool {
	value = strings.ToLower(strings.TrimSpace(strings.SplitN(value, ";", 2)[0]))
	if value == "" || value == "application/octet-stream" {
		return true
	}
	switch kind {
	case jimengImageFile:
		return strings.HasPrefix(value, "image/")
	case jimengVideoFile:
		return strings.HasPrefix(value, "video/")
	case jimengAudioFile:
		return strings.HasPrefix(value, "audio/") || value == "application/ogg"
	default:
		return false
	}
}

func jimengFileExtensionAllowed(ext string, kind jimengFileKind) bool {
	allowed := map[jimengFileKind]map[string]bool{
		jimengImageFile: {".png": true, ".jpg": true, ".jpeg": true, ".webp": true},
		jimengVideoFile: {".mp4": true, ".mov": true, ".m4v": true, ".webm": true},
		jimengAudioFile: {".mp3": true, ".wav": true, ".m4a": true, ".aac": true, ".ogg": true},
	}
	return allowed[kind][ext]
}

func jimengFileSignatureAllowed(content []byte, kind jimengFileKind) bool {
	switch kind {
	case jimengImageFile:
		return bytes.HasPrefix(content, []byte("\x89PNG\r\n\x1a\n")) || bytes.HasPrefix(content, []byte("\xff\xd8\xff")) || bytes.HasPrefix(content, []byte("RIFF")) && len(content) >= 12 && string(content[8:12]) == "WEBP"
	case jimengVideoFile:
		return len(content) >= 12 && string(content[4:8]) == "ftyp" || bytes.HasPrefix(content, []byte("\x1a\x45\xdf\xa3"))
	case jimengAudioFile:
		return bytes.HasPrefix(content, []byte("ID3")) || bytes.HasPrefix(content, []byte("\xff\xfb")) || bytes.HasPrefix(content, []byte("RIFF")) || bytes.HasPrefix(content, []byte("OggS")) || len(content) >= 12 && string(content[4:8]) == "ftyp"
	default:
		return false
	}
}

func jimengUnsupportedFileError(kind jimengFileKind) error {
	labels := map[jimengFileKind]string{jimengImageFile: "图片", jimengVideoFile: "视频", jimengAudioFile: "音频"}
	return fmt.Errorf("%s素材格式不受支持", labels[kind])
}

func buildJimengModeArgs(mode string, fields jimengVideoFields, modelVersion string, sessionID int, images, roles, videos, audios []string) ([]string, error) {
	modelVersion = strings.TrimSpace(modelVersion)
	if modelVersion == "" {
		modelVersion = "seedance2.0fast"
	}
	prompt, duration := strings.TrimSpace(fields.Prompt), normalizeJimengDuration(fields.Duration)
	resolution := normalizeJimengModelResolution(modelVersion, fields.Resolution)
	var args []string
	switch mode {
	case "text2video":
		args = []string{"text2video", "--prompt=" + prompt, "--duration=" + strconv.Itoa(duration), "--ratio=" + normalizeJimengRatio(fields.Ratio), "--video_resolution=" + resolution, "--model_version=" + modelVersion}
	case "image2video":
		args = []string{"image2video", "--image=" + images[0], "--prompt=" + prompt, "--duration=" + strconv.Itoa(duration), "--video_resolution=" + resolution, "--model_version=" + modelVersion}
	case "frames2video":
		first, last := jimengFramePaths(images, roles)
		args = []string{"frames2video", "--first=" + first, "--last=" + last, "--prompt=" + prompt, "--duration=" + strconv.Itoa(duration), "--video_resolution=" + resolution, "--model_version=" + modelVersion}
	case "multiframe2video":
		args = []string{"multiframe2video", "--images=" + strings.Join(images, ",")}
		if len(images) == 2 {
			args = append(args, "--prompt="+prompt, "--duration="+strconv.Itoa(min(8, duration)))
		} else {
			segmentDuration := max(0.5, min(8, float64(duration)/float64(len(images)-1)))
			for range len(images) - 1 {
				args = append(args, "--transition-prompt="+prompt)
			}
			for range len(images) - 1 {
				args = append(args, "--transition-duration="+strconv.FormatFloat(segmentDuration, 'f', -1, 64))
			}
		}
	case "multimodal2video":
		args = []string{"multimodal2video"}
		for _, path := range images {
			args = append(args, "--image="+path)
		}
		for _, path := range videos {
			args = append(args, "--video="+path)
		}
		for _, path := range audios {
			args = append(args, "--audio="+path)
		}
		args = append(args, "--prompt="+prompt, "--duration="+strconv.Itoa(duration), "--ratio="+normalizeJimengRatio(fields.Ratio), "--video_resolution="+resolution, "--model_version="+modelVersion)
	default:
		return nil, errors.New("不支持的即梦视频模式")
	}
	if sessionID > 0 {
		args = append(args, "--session="+strconv.Itoa(sessionID))
	}
	return append(args, "--poll=0"), nil
}

func jimengFramePaths(images, roles []string) (string, string) {
	first, last := images[0], images[1]
	for index, role := range roles {
		if index >= len(images) {
			break
		}
		switch strings.TrimSpace(role) {
		case "first_frame":
			first = images[index]
		case "last_frame":
			last = images[index]
		}
	}
	return first, last
}

func normalizeJimengModelResolution(modelVersion, resolution string) string {
	if strings.TrimSpace(modelVersion) != "seedance2.0_vip" {
		return "720p"
	}
	return normalizeJimengResolution(resolution)
}
