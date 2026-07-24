package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestValidateStoryboardArtifactRejectsSummaryPrompt(t *testing.T) {
	report := ValidateShotPromptArtifact(json.RawMessage(`{"shotId":"shot-1","promptInputHash":"hash-1","referenceEvidence":[],"prompt":"白色摄影棚内，一只红色纸飞机停在木桌上，镜头缓慢推近，电影感，无人物。"}`))
	if report.Passed || len(report.Issues) != 1 || report.Issues[0].Code != "invalid_shot_prompt_structure" {
		t.Fatalf("report = %+v", report)
	}
}

func TestValidateShotBreakdownRequiresDurationAndKnownContinuityMode(t *testing.T) {
	report := ValidateShotBreakdownArtifact(json.RawMessage(`{"shots":[{"shotId":"shot-001","sceneKey":"scene-001","sourceScript":"林秋进门。","shotDraft":{"shotSize":"中景","camera":"平视","movement":"跟拍","action":"进门","performance":"克制","dialogue":"","continuityMode":"连续"}}]}`))
	if report.Passed {
		t.Fatal("expected invalid shot draft")
	}
	codes := map[string]bool{}
	for _, issue := range report.Issues {
		codes[issue.Code] = true
	}
	if !codes["missing_duration"] || !codes["invalid_continuity_mode"] {
		t.Fatalf("issues=%+v", report.Issues)
	}
}

func TestValidateStoryboardArtifactAcceptsCopyOnlyPrompt(t *testing.T) {
	prompt := "场景：白色摄影棚日间室内，木桌位于中央。\n声音：轻微环境风声，无台词。\n画面内容：\n0-2秒：35mm 中远景缓慢推近红色纸飞机。\n2-4秒：50mm 近景，机翼轻颤后停下。\n限制：无人物、无字幕、无 logo、无水印。"
	payload, _ := json.Marshal(map[string]any{"shotId": "shot-1", "promptInputHash": "hash-1", "referenceEvidence": []any{}, "prompt": prompt})
	report := ValidateShotPromptArtifact(payload)
	if !report.Passed {
		t.Fatalf("report = %+v", report)
	}
}

func TestValidateStoryboardArtifactAcceptsAsciiContractColons(t *testing.T) {
	prompt := "场景: 白色摄影棚。\n声音: 无台词。\n画面内容:\n0-4秒：镜头缓慢推近红色纸飞机。\n限制: 无字幕、无水印。"
	payload, _ := json.Marshal(map[string]any{"shotId": "shot-1", "promptInputHash": "hash-1", "referenceEvidence": []any{}, "prompt": prompt})
	report := ValidateShotPromptArtifact(payload)
	if !report.Passed {
		t.Fatalf("report = %+v", report)
	}
}

func TestWorkflowStagePromptGetsDomainRulesFromPublishedSkill(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureWorkflowSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	resolved, err := ResolvePublishedWorkflowSkill(WorkflowSkillStageVideo, "")
	if err != nil {
		t.Fatal(err)
	}
	basePrompt, _ := workflowStagePrompts(model.WorkflowRun{}, WorkflowStageShotPrompt, model.WorkflowArtifact{}, &WorkflowShotPromptContext{ShotID: "shot-1", SourceScript: "剧本", ShotDraft: map[string]any{"action": "动作"}})
	if strings.Contains(basePrompt, "continuity_reference") {
		t.Fatal("base transport prompt contains Skill domain rule")
	}
	finalPrompt := basePrompt + workflowSkillInstructions(resolved)
	for _, field := range []string{"场景：", "声音：", "画面内容：", "限制：", "continuity_reference", "不得当作首帧"} {
		if !strings.Contains(finalPrompt, field) {
			t.Fatalf("final prompt missing %q", field)
		}
	}
}
