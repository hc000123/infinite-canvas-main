package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestValidateStoryboardArtifactRejectsSummaryPrompt(t *testing.T) {
	report := ValidateStoryboardArtifact(json.RawMessage(`{"shots":[{"id":"shot-1","sceneId":"scene-1","duration":4,"prompt":"白色摄影棚内，一只红色纸飞机停在木桌上，镜头缓慢推近，电影感，无人物。"}]}`))
	if report.Passed || len(report.Issues) != 1 || report.Issues[0].Code != "invalid_shot_prompt_structure" {
		t.Fatalf("report = %+v", report)
	}
}

func TestValidateStoryboardArtifactAcceptsCopyOnlyPrompt(t *testing.T) {
	prompt := "场景：白色摄影棚日间室内，木桌位于中央。\n声音：轻微环境风声，无台词。\n画面内容：\n0-2秒：35mm 中远景缓慢推近红色纸飞机。\n2-4秒：50mm 近景，机翼轻颤后停下。\n限制：无人物、无字幕、无 logo、无水印。"
	payload, _ := json.Marshal(map[string]any{"shots": []map[string]any{{"id": "shot-1", "sceneId": "scene-1", "duration": 4, "prompt": prompt}}})
	report := ValidateStoryboardArtifact(payload)
	if !report.Passed {
		t.Fatalf("report = %+v", report)
	}
}

func TestValidateStoryboardArtifactAcceptsAsciiContractColons(t *testing.T) {
	prompt := "场景: 白色摄影棚。\n声音: 无台词。\n画面内容:\n0-4秒：镜头缓慢推近红色纸飞机。\n限制: 无字幕、无水印。"
	payload, _ := json.Marshal(map[string]any{"shots": []map[string]any{{"id": "shot-1", "sceneId": "scene-1", "duration": 4, "prompt": prompt}}})
	report := ValidateStoryboardArtifact(payload)
	if !report.Passed {
		t.Fatalf("report = %+v", report)
	}
}

func TestStoryboardStagePromptRequiresCopyOnlyContract(t *testing.T) {
	systemPrompt, _ := workflowStagePrompts(model.WorkflowRun{}, WorkflowStageSeedanceStoryboard, model.WorkflowArtifact{})
	for _, field := range []string{"场景：", "声音：", "画面内容：", "限制：", "连续时间段", "禁止只写电影感摘要"} {
		if !strings.Contains(systemPrompt, field) {
			t.Fatalf("system prompt missing %q", field)
		}
	}
}
