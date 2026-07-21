package service

import (
	"reflect"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
)

func TestCodexExecutorBuildsReadOnlyMultimodalCommand(t *testing.T) {
	command := buildCodexCommand(CodexExecutorOptions{Bin: "codex", Workdir: "/workspace", Model: "gpt-test"}, "/tmp/final.txt", []string{"/staged/1.png", "/staged/2.webp"})
	expected := []string{"exec", "--ephemeral", "--sandbox", "read-only", "--color", "never", "--cd", "/workspace", "--output-last-message", "/tmp/final.txt", "-i", "/staged/1.png", "-i", "/staged/2.webp", "--model", "gpt-test", "-"}
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
