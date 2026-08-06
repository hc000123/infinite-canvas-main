package service

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/textproto"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

type jimengUpload struct {
	field    string
	name     string
	content  []byte
	fileType string
	role     string
}

func TestPrepareJimengVideoCommandBuildsAllModes(t *testing.T) {
	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 32)...)
	mp4 := []byte("\x00\x00\x00\x18ftypmp42video")
	mp3 := []byte("ID3audio")
	tests := []struct {
		name       string
		mode       string
		uploads    []jimengUpload
		wantPrefix []string
		wantParts  []string
	}{
		{name: "text", mode: "text2video", wantPrefix: []string{"text2video", "--prompt=镜头推进", "--duration=6", "--ratio=9:16", "--video_resolution=720p", "--model_version=seedance2.0fast"}},
		{name: "image", mode: "image2video", uploads: []jimengUpload{{field: "input_image[]", name: "first.png", content: png, fileType: "image/png", role: "first_frame"}}, wantPrefix: []string{"image2video"}, wantParts: []string{"--image=", "--prompt=镜头推进", "--duration=6", "--video_resolution=720p", "--model_version=seedance2.0fast"}},
		{name: "legacy reference image", mode: "auto", uploads: []jimengUpload{{field: "input_reference[]", name: "legacy.png", content: png, fileType: "image/png", role: "reference_image"}}, wantPrefix: []string{"image2video"}, wantParts: []string{"--image=", "--prompt=镜头推进", "--duration=6"}},
		{name: "frames", mode: "frames2video", uploads: []jimengUpload{{field: "input_image[]", name: "last.png", content: png, fileType: "image/png", role: "last_frame"}, {field: "input_image[]", name: "first.png", content: png, fileType: "image/png", role: "first_frame"}}, wantPrefix: []string{"frames2video"}, wantParts: []string{"--first=", "--last=", "--prompt=镜头推进", "--duration=6"}},
		{name: "multiframe", mode: "multiframe2video", uploads: []jimengUpload{{field: "input_image[]", name: "1.png", content: png, fileType: "image/png"}, {field: "input_image[]", name: "2.png", content: png, fileType: "image/png"}, {field: "input_image[]", name: "3.png", content: png, fileType: "image/png"}}, wantPrefix: []string{"multiframe2video"}, wantParts: []string{"--images=", "--video_resolution=1080p", "--transition-prompt=镜头推进", "--transition-prompt=镜头推进", "--transition-duration=3", "--transition-duration=3"}},
		{name: "multimodal", mode: "multimodal2video", uploads: []jimengUpload{{field: "input_image[]", name: "image.png", content: png, fileType: "image/png"}, {field: "input_video[]", name: "clip.mp4", content: mp4, fileType: "video/mp4"}, {field: "input_audio[]", name: "voice.mp3", content: mp3, fileType: "audio/mpeg"}}, wantPrefix: []string{"multimodal2video"}, wantParts: []string{"--image=", "--video=", "--audio=", "--prompt=镜头推进", "--ratio=9:16"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, contentType := buildJimengMultipart(t, tt.mode, tt.uploads)
			command, err := prepareJimengVideoCommand(body, contentType, "seedance2.0fast", 2)
			if err != nil {
				t.Fatalf("prepareJimengVideoCommand: %v", err)
			}
			tempDir := command.tempDir
			defer command.cleanup()
			if !equalStringSlices(command.args[:len(tt.wantPrefix)], tt.wantPrefix) {
				t.Fatalf("args prefix = %#v, want %#v", command.args, tt.wantPrefix)
			}
			for _, part := range tt.wantParts {
				if !jimengArgsContain(command.args, part) {
					t.Fatalf("args = %#v, want part %q", command.args, part)
				}
			}
			for _, arg := range command.args {
				if !strings.HasPrefix(arg, "--image=") && !strings.HasPrefix(arg, "--video=") && !strings.HasPrefix(arg, "--audio=") && !strings.HasPrefix(arg, "--first=") && !strings.HasPrefix(arg, "--last=") {
					continue
				}
				if _, err := os.Stat(strings.SplitN(arg, "=", 2)[1]); err != nil {
					t.Fatalf("staged file missing for %q: %v", arg, err)
				}
			}
			command.cleanup()
			if tempDir != "" {
				if _, err := os.Stat(tempDir); !os.IsNotExist(err) {
					t.Fatalf("temporary directory still exists: %s", tempDir)
				}
			}
		})
	}
}

func TestPrepareJimengVideoCommandAllowsSeedance25AudioOnly(t *testing.T) {
	body, contentType := buildJimengMultipart(t, "multimodal2video", []jimengUpload{{field: "input_audio[]", name: "voice.mp3", content: []byte("ID3audio"), fileType: "audio/mpeg"}})
	command, err := prepareJimengVideoCommand(body, contentType, "seedance2.5", 0)
	if err != nil {
		t.Fatalf("prepareJimengVideoCommand: %v", err)
	}
	defer command.cleanup()
	for _, want := range []string{"--audio=", "--model_version=seedance2.5"} {
		if !jimengArgsContain(command.args, want) {
			t.Fatalf("args = %#v, want %q", command.args, want)
		}
	}
}

func TestJimengMultiframeTransitionDurationUsesNewMinimum(t *testing.T) {
	images := make([]string, 10)
	for index := range images {
		images[index] = filepath.Join(t.TempDir(), "frame.png")
	}
	args, err := buildJimengModeArgs("multiframe2video", jimengVideoFields{Prompt: "连续变化", Duration: "4", Resolution: "720p"}, "seedance2.0fast", 0, images, nil, nil, nil)
	if err != nil {
		t.Fatalf("buildJimengModeArgs: %v", err)
	}
	for _, arg := range args {
		if strings.HasPrefix(arg, "--transition-duration=") && arg != "--transition-duration=1" {
			t.Fatalf("args = %#v, transition duration must use the CLI minimum", args)
		}
	}
}

func TestPrepareJimengVideoCommandRejectsInvalidModeInputs(t *testing.T) {
	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 32)...)
	tests := []struct {
		name    string
		mode    string
		uploads []jimengUpload
		want    string
	}{
		{name: "image missing", mode: "image2video", want: "图生视频需要恰好 1 张图片"},
		{name: "frames missing", mode: "frames2video", uploads: []jimengUpload{{field: "input_image[]", name: "one.png", content: png, fileType: "image/png"}}, want: "首尾帧需要恰好 2 张图片"},
		{name: "multiframe too few", mode: "multiframe2video", uploads: []jimengUpload{{field: "input_image[]", name: "one.png", content: png, fileType: "image/png"}}, want: "多帧故事需要 2-20 张图片"},
		{name: "audio only", mode: "multimodal2video", uploads: []jimengUpload{{field: "input_audio[]", name: "voice.mp3", content: []byte("ID3audio"), fileType: "audio/mpeg"}}, want: "全能参考至少需要图片或视频"},
		{name: "bad image", mode: "image2video", uploads: []jimengUpload{{field: "input_image[]", name: "fake.png", content: []byte("not-image"), fileType: "image/png"}}, want: "图片素材格式不受支持"},
		{name: "bad image mime", mode: "image2video", uploads: []jimengUpload{{field: "input_image[]", name: "fake.png", content: png, fileType: "text/plain"}}, want: "图片素材格式不受支持"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, contentType := buildJimengMultipart(t, tt.mode, tt.uploads)
			_, err := prepareJimengVideoCommand(body, contentType, "seedance2.0fast", 0)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("err = %v, want %q", err, tt.want)
			}
		})
	}
}

func TestRunJimengCLIUsesDreaminaHome(t *testing.T) {
	if runtime.GOOS == "darwin" {
		t.Skip("macOS uses the login keychain and must preserve the real HOME")
	}
	home := filepath.Join(t.TempDir(), "dreamina-home")
	t.Setenv("DREAMINA_HOME", home)
	cli := filepath.Join(t.TempDir(), "dreamina")
	if err := os.WriteFile(cli, []byte("#!/bin/sh\nprintf '%s' \"$HOME\"\n"), 0755); err != nil {
		t.Fatal(err)
	}
	output, err := runJimengCLI(context.Background(), model.ModelChannel{CLIPath: cli}, "version")
	if err != nil {
		t.Fatalf("runJimengCLI: %v", err)
	}
	if string(output) != home {
		t.Fatalf("HOME = %q, want %q", output, home)
	}
}

func TestRunJimengCLIUsesContextDreaminaHome(t *testing.T) {
	if runtime.GOOS == "darwin" {
		t.Skip("macOS uses the login keychain and must preserve the real HOME")
	}
	globalHome := filepath.Join(t.TempDir(), "global-home")
	userHome := filepath.Join(t.TempDir(), "user-home")
	t.Setenv("DREAMINA_HOME", globalHome)
	cli := filepath.Join(t.TempDir(), "dreamina")
	if err := os.WriteFile(cli, []byte("#!/bin/sh\nprintf '%s' \"$HOME\"\n"), 0755); err != nil {
		t.Fatal(err)
	}
	output, err := runJimengCLI(WithJimengCLIHome(context.Background(), userHome), model.ModelChannel{CLIPath: cli}, "version")
	if err != nil {
		t.Fatalf("runJimengCLI: %v", err)
	}
	if string(output) != userHome {
		t.Fatalf("HOME = %q, want per-user home %q", output, userHome)
	}
}

func TestJimengEnvironmentPreservesMacOSHomeForLoginKeychain(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("macOS keychain behavior")
	}
	environment := []string{"HOME=/Users/tester", "PATH=/usr/bin"}

	result := jimengEnvironmentWithHome(environment, filepath.Join(t.TempDir(), "user-home"))

	if strings.Join(result, "\n") != strings.Join(environment, "\n") {
		t.Fatalf("environment = %#v, want real HOME preserved for macOS keychain", result)
	}
}

func buildJimengMultipart(t *testing.T, mode string, uploads []jimengUpload) ([]byte, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range map[string]string{"dreamina_mode": mode, "prompt": "镜头推进", "duration": "6", "ratio": "9:16", "resolution": "1080p"} {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatal(err)
		}
	}
	for _, upload := range uploads {
		header := make(map[string][]string)
		header["Content-Disposition"] = []string{`form-data; name="` + upload.field + `"; filename="` + upload.name + `"`}
		header["Content-Type"] = []string{upload.fileType}
		part, err := writer.CreatePart(textprotoMIMEHeader(header))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(upload.content); err != nil {
			t.Fatal(err)
		}
		roleField := ""
		if upload.field == "input_image[]" {
			roleField = "input_image_role[]"
		}
		if upload.field == "input_reference[]" {
			roleField = "input_reference_role[]"
		}
		if roleField != "" {
			if err := writer.WriteField(roleField, upload.role); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return body.Bytes(), writer.FormDataContentType()
}

func textprotoMIMEHeader(values map[string][]string) textproto.MIMEHeader {
	return textproto.MIMEHeader(values)
}

func jimengArgsContain(args []string, part string) bool {
	for _, arg := range args {
		if arg == part || strings.HasPrefix(arg, part) {
			return true
		}
	}
	return false
}
