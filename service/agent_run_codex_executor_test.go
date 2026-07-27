package service

import (
	"reflect"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
)

func TestCodexExecutorBuildsReadOnlyMultimodalCommand(t *testing.T) {
	command := buildCodexCommand(CodexExecutorOptions{Bin: "codex", Workdir: "/workspace", Model: "gpt-test"}, "/tmp/final.txt", []string{"/staged/1.png", "/staged/2.webp"})
	expected := []string{"exec", "--ignore-user-config", "--ephemeral", "--sandbox", "read-only", "--color", "never", "--cd", "/workspace", "--output-last-message", "/tmp/final.txt", "-i", "/staged/1.png", "-i", "/staged/2.webp", "--model", "gpt-test", "-"}
	if !reflect.DeepEqual(command.Args[1:], expected) {
		t.Fatalf("args=%q", command.Args)
	}
}

func TestCodexAgentRunQueuesWithoutAPIChannelOrCredits(t *testing.T) {
	setupAITaskTestDB(t)
	previousExecutor := config.Cfg.WorkflowTextExecutor
	previousEnabled := config.Cfg.WorkflowLocalCodexEnabled
	previousModel := config.Cfg.WorkflowCodexModel
	t.Cleanup(func() {
		config.Cfg.WorkflowTextExecutor = previousExecutor
		config.Cfg.WorkflowLocalCodexEnabled = previousEnabled
		config.Cfg.WorkflowCodexModel = previousModel
	})
	config.Cfg.WorkflowTextExecutor = AgentRunExecutorCodexCLI
	config.Cfg.WorkflowLocalCodexEnabled = true
	config.Cfg.WorkflowCodexModel = ""

	run, err := CreateUserAgentRun("user-codex", CreateAgentRunInput{AgentKind: "storyboard_director", UserPrompt: "结合图片生成提示词"})
	if err != nil {
		t.Fatal(err)
	}
	if run.Executor != AgentRunExecutorCodexCLI || run.Credits != 0 || run.EstimatedCredits != 0 || run.ChannelID != "" {
		t.Fatalf("run=%+v", run)
	}
}

func TestCodexTextModeKeepsImageRunsOnAPI(t *testing.T) {
	setupAITaskTestDB(t)
	setupImageInvocationSettings(t, true)
	previousExecutor := config.Cfg.WorkflowTextExecutor
	previousEnabled := config.Cfg.WorkflowLocalCodexEnabled
	t.Cleanup(func() {
		config.Cfg.WorkflowTextExecutor = previousExecutor
		config.Cfg.WorkflowLocalCodexEnabled = previousEnabled
	})
	config.Cfg.WorkflowTextExecutor = AgentRunExecutorCodexCLI
	config.Cfg.WorkflowLocalCodexEnabled = true

	run, err := BuildUserAgentRun("user-codex", CreateAgentRunInput{
		AgentKind: "asset_rendition", Executor: AgentRunExecutorAPI, ExecutionKind: "image_model", ModelPreference: "image-test",
		FrozenRequestJSON: `{"model":"image-test","prompt":"角色设定图","n":1}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Executor != AgentRunExecutorAPI || run.ExecutionKind != "image_model" || run.ChannelID != "image-channel" {
		t.Fatalf("run=%+v", run)
	}
}

func TestAgentRunExecutorsFromConfigIncludesAPIAlongsideCodex(t *testing.T) {
	previousExecutor := config.Cfg.WorkflowTextExecutor
	previousEnabled := config.Cfg.WorkflowLocalCodexEnabled
	previousWorkdir := config.Cfg.WorkflowCodexWorkdir
	t.Cleanup(func() {
		config.Cfg.WorkflowTextExecutor = previousExecutor
		config.Cfg.WorkflowLocalCodexEnabled = previousEnabled
		config.Cfg.WorkflowCodexWorkdir = previousWorkdir
	})
	config.Cfg.WorkflowTextExecutor = AgentRunExecutorCodexCLI
	config.Cfg.WorkflowLocalCodexEnabled = true
	config.Cfg.WorkflowCodexWorkdir = t.TempDir()

	executors, err := NewAgentRunExecutorsFromConfig()
	if err != nil {
		t.Fatal(err)
	}
	kinds := map[string]bool{}
	for _, executor := range executors {
		kinds[executor.Kind()] = true
	}
	if !kinds[AgentRunExecutorCodexCLI] || !kinds[AgentRunExecutorAPI] || len(kinds) != 2 {
		t.Fatalf("kinds=%v", kinds)
	}
}

func TestCodexPromptPreservesSystemAndUserMessages(t *testing.T) {
	prompt, err := buildCodexPromptFromRequest(`{"model":"codex","messages":[{"role":"system","content":"系统规则"},{"role":"user","content":"用户输入"}]}`)
	if err != nil || prompt != "[SYSTEM]\n系统规则\n\n[USER]\n用户输入" {
		t.Fatalf("prompt=%q err=%v", prompt, err)
	}
}

func TestCodexImageContextRequiresVisualUnderstanding(t *testing.T) {
	context := codexImageContext(`{"items":[{"label":"阿宁","kind":"character","version":"v3","sha256":"abc","order":1}]}`)
	if !strings.Contains(context, "逐张理解图片") || !strings.Contains(context, "@图1：阿宁") || strings.Contains(context, "serverPath") {
		t.Fatalf("context=%q", context)
	}
}

func TestCodexCommandFailureClassifiesSafeDiagnostics(t *testing.T) {
	tests := []struct {
		name      string
		stderr    string
		message   string
		retryable bool
	}{
		{name: "outdated", stderr: "model requires a newer version of Codex", message: "Codex CLI 版本过低，请升级后重试"},
		{name: "network", stderr: "stream disconnected after retry", message: "Codex CLI 网络连接失败，请稍后重试", retryable: true},
		{name: "rate limit", stderr: "429 rate limit exceeded", message: "Codex CLI 请求频率受限，请稍后重试", retryable: true},
		{name: "unknown", stderr: "private upstream details", message: "Codex CLI 执行失败，请检查本地登录状态和运行日志"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			message, retryable := codexCommandFailure(test.stderr)
			if message != test.message || retryable != test.retryable {
				t.Fatalf("message=%q retryable=%v", message, retryable)
			}
		})
	}
}
