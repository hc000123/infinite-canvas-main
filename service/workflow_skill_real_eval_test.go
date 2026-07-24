package service

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

const workflowSkillEvalScript = `【场1 咖啡馆后门，夜，内】
雨水顺着磨砂玻璃往下淌。林岚穿着深色雨衣推门进来，右手始终攥着一把磨损的黄铜钥匙。陈叔站在木桌后，把桌上的旧台灯调暗。
林岚把黄铜钥匙放在木桌中央：“门后的灯还亮吗？”
陈叔看一眼钥匙，压低声音：“亮着，但今晚只能开一次。”
门外传来急促脚步。林岚立刻收回钥匙，和陈叔对视一秒。

【场2 地下档案室，夜，内】
林岚脱下湿雨衣，露出沾灰的工作服。她用同一把黄铜钥匙打开铁柜，陈叔守在狭窄楼梯口。柜内的冷光照亮两人的脸。
林岚抽出一只密封档案袋：“找到它了。”
楼上传来门被撞开的闷响。陈叔回头，抬手示意她停下。`

func TestWorkflowSkillSeedRealCodexQuality(t *testing.T) {
	if os.Getenv("WORKFLOW_SKILL_REAL_EVAL") != "1" {
		t.Skip("set WORKFLOW_SKILL_REAL_EVAL=1 to run the local Codex quality evaluation")
	}
	executor := NewCodexAgentRunExecutor(CodexExecutorOptions{
		Workdir: ".",
		Model:   strings.TrimSpace(os.Getenv("WORKFLOW_SKILL_EVAL_MODEL")),
	})
	if err := executor.Available(context.Background()); err != nil {
		t.Fatal(err)
	}
	run := model.WorkflowRun{WorkflowVersion: VideoWorkflowVersion, ScriptSnapshot: workflowSkillEvalScript}
	if os.Getenv("WORKFLOW_SKILL_REAL_EVAL_STAGE") == WorkflowSkillStageVideo {
		runWorkflowSkillVideoOnlyEval(t, executor, run)
		return
	}

	artSystem, artUser := workflowStagePrompts(run, WorkflowStageAssetExtraction, model.WorkflowArtifact{}, nil)
	art := runRealWorkflowSkill(t, executor, WorkflowSkillStageArt, artSystem, artUser)
	artItems := workflowEvalItems(t, art)
	assertWorkflowEvalAssetCoverage(t, artItems)

	artArtifact := model.WorkflowArtifact{ContentJSON: string(art)}
	assetsSystem, assetsUser := workflowStagePrompts(run, WorkflowStageAssetImagePrompt, artArtifact, nil)
	assets := runRealWorkflowSkill(t, executor, WorkflowSkillStageAssets, assetsSystem, assetsUser)
	assetPromptItems := workflowEvalItems(t, assets)
	assertWorkflowEvalAssetIdentity(t, artItems, assetPromptItems)

	storyboardSystem, storyboardUser := workflowStagePrompts(run, WorkflowStageShotBreakdown, model.WorkflowArtifact{}, nil)
	storyboard := runRealWorkflowSkill(t, executor, WorkflowSkillStageStoryboard, storyboardSystem, storyboardUser)
	var storyboardPayload struct {
		Shots []struct {
			ShotID       string         `json:"shotId"`
			SceneKey     string         `json:"sceneKey"`
			SourceScript string         `json:"sourceScript"`
			ShotDraft    map[string]any `json:"shotDraft"`
		} `json:"shots"`
	}
	if err := json.Unmarshal(storyboard, &storyboardPayload); err != nil {
		t.Fatal(err)
	}
	if len(storyboardPayload.Shots) < 4 {
		t.Fatalf("storyboard is too coarse: got %d shots", len(storyboardPayload.Shots))
	}
	for _, shot := range storyboardPayload.Shots {
		if !strings.Contains(workflowSkillEvalScript, shot.SourceScript) {
			t.Fatalf("shot %s sourceScript is not an exact script excerpt", shot.ShotID)
		}
		dialogue := workflowString(shot.ShotDraft, "dialogue")
		if dialogue != "" && !strings.Contains(workflowSkillEvalScript, dialogue) {
			t.Fatalf("shot %s changed the original dialogue", shot.ShotID)
		}
	}
	firstShot := storyboardPayload.Shots[0]
	duration, _ := firstShot.ShotDraft["durationSeconds"].(float64)
	if duration < 4 || duration > 15 {
		t.Fatalf("unexpected first-shot duration: %v", duration)
	}
	contextValue := WorkflowShotPromptContext{
		ShotID:          firstShot.ShotID,
		SourceScript:    firstShot.SourceScript,
		ShotDraft:       firstShot.ShotDraft,
		PromptInputHash: "eval-fixed-input-hash-v1",
	}
	storyboardArtifact := model.WorkflowArtifact{ContentJSON: string(storyboard)}
	videoSystem, videoUser := workflowStagePrompts(run, WorkflowStageShotPrompt, storyboardArtifact, &contextValue)
	video := runRealWorkflowSkill(t, executor, WorkflowSkillStageVideo, videoSystem, videoUser)
	assertWorkflowEvalVideo(t, video, firstShot.ShotID, contextValue.PromptInputHash, duration)
}

func runWorkflowSkillVideoOnlyEval(t *testing.T, executor AgentRunExecutor, run model.WorkflowRun) {
	t.Helper()
	shotDraft := map[string]any{
		"shotSize":        "中远景",
		"camera":          "室内门侧平视机位，磨砂玻璃门占画面右侧，木桌与陈叔位于画面深处",
		"movement":        "固定镜头，从林岚推门入画开始保持稳定，到陈叔调暗台灯后停在两人分隔的空间关系上",
		"action":          "林岚推开后门进入咖啡馆后门区域，右手攥着黄铜钥匙垂在身侧，陈叔在木桌后把旧台灯旋暗",
		"performance":     "林岚进门后没有立刻脱下雨衣，手指持续扣紧钥匙；陈叔动作放慢，调灯时抬眼确认她的位置",
		"dialogue":        "",
		"durationSeconds": float64(7),
		"continuityMode":  "cut",
	}
	sourceScript := "雨水顺着磨砂玻璃往下淌。林岚穿着深色雨衣推门进来，右手始终攥着一把磨损的黄铜钥匙。陈叔站在木桌后，把桌上的旧台灯调暗。"
	storyboard, err := json.Marshal(map[string]any{"shots": []any{map[string]any{
		"shotId": "shot-001", "sceneKey": "scene-001", "sourceScript": sourceScript, "shotDraft": shotDraft,
	}}})
	if err != nil {
		t.Fatal(err)
	}
	contextValue := WorkflowShotPromptContext{
		ShotID: "shot-001", SourceScript: sourceScript, ShotDraft: shotDraft, PromptInputHash: "eval-fixed-input-hash-v1",
	}
	systemPrompt, userPrompt := workflowStagePrompts(run, WorkflowStageShotPrompt, model.WorkflowArtifact{ContentJSON: string(storyboard)}, &contextValue)
	video := runRealWorkflowSkill(t, executor, WorkflowSkillStageVideo, systemPrompt, userPrompt)
	assertWorkflowEvalVideo(t, video, contextValue.ShotID, contextValue.PromptInputHash, 7)
}

func runRealWorkflowSkill(t *testing.T, executor AgentRunExecutor, stageKey string, systemPrompt string, userPrompt string) []byte {
	t.Helper()
	files, err := loadWorkflowSkillSeedFiles(stageKey)
	if err != nil {
		t.Fatal(err)
	}
	contract := workflowSkillSeedContract(stageKey)
	contract.QualityGateProfile = []string{"schema", workflowSkillRequiredGateByTarget[stageKey]}
	packageValue, err := NormalizeWorkflowSkillPackage(files, contract)
	if err != nil {
		t.Fatal(err)
	}
	resolved := ResolvedWorkflowSkill{
		Skill:   model.WorkflowSkill{Name: stageKey, StageKey: stageKey},
		Version: model.WorkflowSkillVersion{Version: workflowSkillSeedVersion, ContentHash: packageValue.ContentHash},
		Package: packageValue,
	}
	request, err := buildAgentRunChatRequest(CreateAgentRunInput{
		SystemPrompt: systemPrompt + workflowSkillInstructions(resolved),
		UserPrompt:   userPrompt,
	}, "workflow-skill-eval")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	call := executor.Call(ctx, model.AgentRun{RequestJSON: string(request), ImageManifestJSON: `{"items":[],"degraded":true,"reason":"text-only-eval"}`})
	if call.message != "" {
		t.Fatalf("%s executor failed: %s", stageKey, call.message)
	}
	content := workflowAgentRunContent(model.AgentRun{RawOutput: call.rawOutput, StructuredDraftJSON: call.structuredJSON})
	gate := workflowSkillEvaluationGate(stageKey, content)
	appendWorkflowSkillSchemaIssues(content, contract, &gate)
	if !gate.Passed {
		t.Fatalf("%s quality gate failed: %+v\noutput: %s", stageKey, gate.Issues, content)
	}
	t.Logf("%s output: %s", stageKey, content)
	return content
}

func workflowEvalItems(t *testing.T, raw []byte) []map[string]any {
	t.Helper()
	var payload struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	return payload.Items
}

func assertWorkflowEvalAssetCoverage(t *testing.T, items []map[string]any) {
	t.Helper()
	counts := map[string]int{}
	for _, item := range items {
		counts[workflowString(item, "kind")]++
		evidence := workflowString(item, "scriptEvidence")
		if evidence == "" || !strings.Contains(workflowSkillEvalScript, evidence) {
			t.Fatalf("asset evidence is not an exact script excerpt: %q", evidence)
		}
	}
	for kind, minimum := range map[string]int{"character": 2, "scene": 2, "prop": 1, "costume": 1} {
		if counts[kind] < minimum {
			t.Fatalf("missing expected %s coverage: got %d, want at least %d", kind, counts[kind], minimum)
		}
	}
}

func assertWorkflowEvalAssetIdentity(t *testing.T, source []map[string]any, prompted []map[string]any) {
	t.Helper()
	if len(source) != len(prompted) {
		t.Fatalf("asset prompt stage changed item count: %d -> %d", len(source), len(prompted))
	}
	sourceByID := map[string]map[string]any{}
	for _, item := range source {
		sourceByID[workflowString(item, "logicalAssetId")] = item
	}
	for _, item := range prompted {
		id := workflowString(item, "logicalAssetId")
		original, ok := sourceByID[id]
		if !ok {
			t.Fatalf("asset prompt stage invented id %s", id)
		}
		for _, field := range []string{"kind", "name", "scriptEvidence", "description", "parentLogicalAssetId", "variantType", "variantName"} {
			if !reflect.DeepEqual(original[field], item[field]) {
				t.Fatalf("asset %s changed immutable field %s", id, field)
			}
		}
		prompt := workflowString(item, "imagePrompt")
		if len([]rune(prompt)) < 40 {
			t.Fatalf("asset %s prompt is too shallow", id)
		}
	}
}

func assertWorkflowEvalVideo(t *testing.T, raw []byte, shotID string, inputHash string, duration float64) {
	t.Helper()
	var payload struct {
		ShotID            string `json:"shotId"`
		Prompt            string `json:"prompt"`
		PromptInputHash   string `json:"promptInputHash"`
		ReferenceEvidence []any  `json:"referenceEvidence"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	if payload.ShotID != shotID || payload.PromptInputHash != inputHash {
		t.Fatalf("video stage changed shot identity or input hash")
	}
	if len(payload.ReferenceEvidence) != 0 {
		t.Fatalf("text-only evaluation must not invent reference-image evidence")
	}
	timeline := regexp.MustCompile(`(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)秒`).FindAllStringSubmatch(payload.Prompt, -1)
	if len(timeline) == 0 {
		t.Fatal("video prompt has no timed segments")
	}
	expectedStart := 0.0
	for _, segment := range timeline {
		start, _ := strconv.ParseFloat(segment[1], 64)
		end, _ := strconv.ParseFloat(segment[2], 64)
		if math.Abs(start-expectedStart) > 0.001 || end <= start {
			t.Fatalf("video prompt timeline is not continuous at %s-%s", segment[1], segment[2])
		}
		expectedStart = end
	}
	if math.Abs(expectedStart-duration) > 0.001 {
		t.Fatalf("video prompt ends at %.1fs, shot duration is %.1fs", expectedStart, duration)
	}
}
