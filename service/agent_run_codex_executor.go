package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
)

type CodexExecutorOptions struct {
	Bin     string
	Workdir string
	Model   string
}

type CodexAgentRunExecutor struct {
	options CodexExecutorOptions
}

func NewCodexAgentRunExecutor(options CodexExecutorOptions) *CodexAgentRunExecutor {
	if strings.TrimSpace(options.Bin) == "" {
		options.Bin = "codex"
	}
	if strings.TrimSpace(options.Workdir) == "" {
		options.Workdir = "."
	}
	return &CodexAgentRunExecutor{options: options}
}

func (executor *CodexAgentRunExecutor) Kind() string { return AgentRunExecutorCodexCLI }

func (executor *CodexAgentRunExecutor) Available(context.Context) error {
	if _, err := exec.LookPath(executor.options.Bin); err != nil {
		return errors.New("本地 Codex CLI 不可用")
	}
	info, err := os.Stat(executor.options.Workdir)
	if err != nil || !info.IsDir() {
		return errors.New("Codex CLI 工作目录不可用")
	}
	return nil
}

func (executor *CodexAgentRunExecutor) ReserveCredits(run *model.AgentRun) error {
	run.Credits = 0
	run.EstimatedCredits = 0
	run.CreditsReserved = 0
	return nil
}

func (executor *CodexAgentRunExecutor) RefundCredits(run *model.AgentRun) error {
	run.CreditsRefunded = 0
	return nil
}

func (executor *CodexAgentRunExecutor) Call(ctx context.Context, run model.AgentRun) agentRunCallResult {
	prompt, err := buildCodexPromptFromRequest(run.RequestJSON)
	if err != nil {
		return agentRunCallResult{message: "Codex CLI 输入快照无效"}
	}
	images, err := codexImagePaths(run.ImageManifestJSON)
	if err != nil {
		return agentRunCallResult{message: "Codex CLI 图片清单无效"}
	}
	if imageContext := codexImageContext(run.ImageManifestJSON); imageContext != "" {
		prompt += "\n\n" + imageContext
	}
	tempDir, err := os.MkdirTemp("", "workflow-codex-")
	if err != nil {
		return agentRunCallResult{message: "Codex CLI 临时目录创建失败"}
	}
	defer os.RemoveAll(tempDir)
	outputPath := filepath.Join(tempDir, "final.txt")
	commandTemplate := buildCodexCommand(executor.options, outputPath, images)
	command := exec.CommandContext(ctx, commandTemplate.Path, commandTemplate.Args[1:]...)
	command.Stdin = strings.NewReader(prompt)
	var stderr limitedBuffer
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		if errors.Is(ctx.Err(), context.Canceled) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return agentRunCallResult{message: "Codex CLI 已取消或超时"}
		}
		return agentRunCallResult{message: safeCodexCommandError(stderr.String()), retryable: false}
	}
	file, err := os.Open(outputPath)
	if err != nil {
		return agentRunCallResult{message: "Codex CLI 未返回可审核内容", retryable: true}
	}
	defer file.Close()
	output, err := io.ReadAll(io.LimitReader(file, 4<<20))
	if err != nil || strings.TrimSpace(string(output)) == "" {
		return agentRunCallResult{message: "Codex CLI 未返回可审核内容", retryable: true}
	}
	rawOutput := strings.TrimSpace(string(output))
	return agentRunCallResult{rawOutput: rawOutput, structuredJSON: extractJSONDraft(rawOutput)}
}

func buildCodexCommand(options CodexExecutorOptions, outputPath string, images []string) *exec.Cmd {
	args := []string{"exec", "--ephemeral", "--sandbox", "read-only", "--color", "never", "--cd", options.Workdir, "--output-last-message", outputPath}
	for _, image := range images {
		args = append(args, "-i", image)
	}
	if strings.TrimSpace(options.Model) != "" {
		args = append(args, "--model", strings.TrimSpace(options.Model))
	}
	args = append(args, "-")
	return exec.Command(options.Bin, args...)
}

func buildCodexPromptFromRequest(requestJSON string) (string, error) {
	var request struct {
		Messages []AgentRunMessage `json:"messages"`
	}
	if err := json.Unmarshal([]byte(requestJSON), &request); err != nil || len(request.Messages) == 0 {
		return "", errors.New("missing messages")
	}
	parts := make([]string, 0, len(request.Messages))
	for _, message := range request.Messages {
		if strings.TrimSpace(message.Content) != "" {
			parts = append(parts, fmt.Sprintf("[%s]\n%s", strings.ToUpper(strings.TrimSpace(message.Role)), strings.TrimSpace(message.Content)))
		}
	}
	if len(parts) == 0 {
		return "", errors.New("empty messages")
	}
	return strings.Join(parts, "\n\n"), nil
}

func codexImagePaths(manifestJSON string) ([]string, error) {
	if strings.TrimSpace(manifestJSON) == "" {
		return nil, nil
	}
	var manifest struct {
		Items []struct {
			ServerPath string `json:"serverPath"`
			Order      int    `json:"order"`
		} `json:"items"`
	}
	if err := json.Unmarshal([]byte(manifestJSON), &manifest); err != nil {
		return nil, err
	}
	if len(manifest.Items) > 9 {
		return nil, errors.New("too many images")
	}
	sort.SliceStable(manifest.Items, func(left, right int) bool { return manifest.Items[left].Order < manifest.Items[right].Order })
	paths := make([]string, 0, len(manifest.Items))
	for _, item := range manifest.Items {
		if strings.TrimSpace(item.ServerPath) == "" {
			return nil, errors.New("missing image path")
		}
		paths = append(paths, item.ServerPath)
	}
	return paths, nil
}

func codexImageContext(manifestJSON string) string {
	var manifest struct {
		Items []struct {
			Label   string `json:"label"`
			Kind    string `json:"kind"`
			Version string `json:"version"`
			SHA256  string `json:"sha256"`
			Order   int    `json:"order"`
		} `json:"items"`
	}
	if json.Unmarshal([]byte(manifestJSON), &manifest) != nil || len(manifest.Items) == 0 {
		return ""
	}
	sort.SliceStable(manifest.Items, func(left, right int) bool { return manifest.Items[left].Order < manifest.Items[right].Order })
	lines := []string{"[IMAGE REFERENCES]", "必须先逐张理解图片中的人物外观、空间关系、光线与关键道具，再结合文本生成结果；不得只根据文件名猜测。"}
	for index, item := range manifest.Items {
		lines = append(lines, fmt.Sprintf("@图%d：%s｜类型=%s｜版本=%s｜哈希=%s", index+1, item.Label, item.Kind, item.Version, item.SHA256))
	}
	return strings.Join(lines, "\n")
}

type limitedBuffer struct{ bytes.Buffer }

func (buffer *limitedBuffer) Write(value []byte) (int, error) {
	original := len(value)
	remaining := 16<<10 - buffer.Len()
	if remaining > 0 {
		if len(value) > remaining {
			value = value[:remaining]
		}
		_, _ = buffer.Buffer.Write(value)
	}
	return original, nil
}

func safeCodexCommandError(stderr string) string {
	_ = stderr
	return "Codex CLI 执行失败，请检查本地登录状态和运行日志"
}
