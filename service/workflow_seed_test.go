package service

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestSystemProductionWorkflowExecutesRoutedTwelveNodeProductionChain(t *testing.T) {
	runSystemProductionWorkflowE2E(t)
}

func runSystemProductionWorkflowE2E(t *testing.T) {
	t.Helper()
	setupInvocationServiceTest(t)
	setupSystemProductionWorkflowModels(t)
	stamp := now()
	if _, err := repository.SaveUser(model.User{ID: "user-1", Username: "system-workflow-e2e", Credits: 100, Status: model.UserStatusActive, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
		t.Fatal(err)
	}
	if err := EnsureWorkflowSeeds(); err != nil {
		t.Fatal(err)
	}
	source := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":`+mustJSONTestString(workflowExecutionBusStopScript)+`}`)
	request := WorkflowExecutionPreflightInput{
		WorkflowVersionID: systemProductionWorkflowVersionID,
		ProjectID:         "project-1",
		EpisodeID:         "episode-1",
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "source_text", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash}},
		ManualSelections:  map[string]string{"script": "skill-version-system-workflow-script-3.1.0"},
		Parameters:        json.RawMessage(`{"format":"9:16","seriesType":"short_drama"}`),
		IdempotencyKey:    "system-production-execution-e2e",
	}
	preflight, err := PreflightWorkflowExecution("user-1", request)
	if err != nil {
		t.Fatal(err)
	}
	duplicate, err := PreflightWorkflowExecution("user-1", request)
	if err != nil || duplicate.Run.ID != preflight.Run.ID || duplicate.Revision.ID != preflight.Revision.ID {
		t.Fatalf("idempotent preflight=%#v duplicate=%#v err=%v", preflight.Run, duplicate.Run, err)
	}
	if !preflight.Preview.Executable || preflight.Run.EstimatedCredits != 18 || len(preflight.Nodes) != 12 {
		t.Fatalf("preflight=%#v", preflight)
	}
	confirmed, err := ConfirmWorkflowExecution("user-1", preflight.Run.ID, WorkflowExecutionConfirmationInput{Revision: 1, Fingerprint: preflight.Run.ConfirmationFingerprint, RequirementCodes: preflight.ConfirmationRequirements})
	if err != nil {
		t.Fatal(err)
	}

	outputsBySkill := map[string]string{
		"skill-system-workflow-script":           `{"productionScript":"场次 1，清晨，旧公交站。\n林秋站在站牌下，手里捏着一张折起的车票。公交车由远及近。\n林秋低声说：“这次不等了。”\n她把车票收进口袋，向车门走去。"}`,
		"skill-system-content-classifier":        `{"routingTags":[{"tag":"female_audience","evidence":["林秋低声说：“这次不等了。”"],"confidence":0.88},{"tag":"urban_emotion","evidence":["林秋站在站牌下，手里捏着一张折起的车票。"],"confidence":0.91}]}`,
		"skill-system-workflow-art":              `{"items":[{"assetId":"character-001","kind":"character","name":"林秋","sourceEvidence":["林秋站在站牌下，手里捏着一张折起的车票。"],"coreFacts":["主要角色","在旧公交站等车","手持折起的车票"]},{"assetId":"scene-001","kind":"scene","name":"旧公交站","sourceEvidence":["场次 1，清晨，旧公交站。"],"coreFacts":["清晨","有站牌"]},{"assetId":"prop-001","kind":"prop","name":"折起的车票","sourceEvidence":["手里捏着一张折起的车票"],"coreFacts":["纸质车票","折起","可放进口袋"]}]}`,
		"skill-system-asset-brief-character":     `{"outputs":[{"bindingName":"asset_brief","ordinal":0,"payload":{"assetId":"character-001","brief":"同一位成年女性角色的全身四视图，锁定同一面部身份、齐肩黑发和深色通勤套装，中性站姿，均匀影棚光。","format":"character-four-view"}}]}`,
		"skill-system-asset-brief-scene":         `{"outputs":[{"bindingName":"asset_brief","ordinal":0,"payload":{"assetId":"scene-001","brief":"清晨旧公交站无人物主参考图，左侧旧站牌，中部候车区，右侧公路延伸至远景，冷色自然光。","format":"scene-master"}}]}`,
		"skill-system-asset-brief-prop":          `{"outputs":[{"bindingName":"asset_brief","ordinal":0,"payload":{"assetId":"prop-001","brief":"折起的纸质公交车票结构参考图，展示折痕、纸张厚度和轻微使用磨损，不虚构票面信息。","format":"prop-structure"}}]}`,
		"skill-system-asset-rendition-character": `{"outputs":[{"bindingName":"asset_rendition","ordinal":0,"payload":{"assetId":"character-001","renditionId":"rendition-character-001","mediaType":"image","mediaRef":"/api/uploaded-assets/runtime/image/sha256-character.png","generationMetadata":{"provider":"test","model":"image-test","requestId":"character-request"}}}]}`,
		"skill-system-asset-rendition-scene":     `{"outputs":[{"bindingName":"asset_rendition","ordinal":0,"payload":{"assetId":"scene-001","renditionId":"rendition-scene-001","mediaType":"image","mediaRef":"/api/uploaded-assets/runtime/image/sha256-scene.png","generationMetadata":{"provider":"test","model":"image-test","requestId":"scene-request"}}}]}`,
		"skill-system-asset-rendition-prop":      `{"outputs":[{"bindingName":"asset_rendition","ordinal":0,"payload":{"assetId":"prop-001","renditionId":"rendition-prop-001","mediaType":"image","mediaRef":"/api/uploaded-assets/runtime/image/sha256-prop.png","generationMetadata":{"provider":"test","model":"image-test","requestId":"prop-request"}}}]}`,
		"skill-system-storyboard-vertical-short": `{"shots":[{"shotId":"shot-001","sceneKey":"scene-001","sourceScript":"林秋低声说：“这次不等了。”","shotDraft":{"shotSize":"近景","camera":"9:16 竖屏，机位与林秋眼睛等高，面部和捏紧车票的手保持在中央安全区","movement":"从胸像极缓慢推到面部近景，在台词结束时停稳","action":"林秋捏紧折起的车票，说完后把视线从公路移向车门","performance":"开口前短促吸气，声音压低，最后一个字落下时下颌放松","dialogue":"这次不等了。","durationSeconds":6,"continuityMode":"continuous"}}]}`,
		"skill-system-workflow-video":            `{"items":[{"shotId":"shot-001","prompt":"场景：清晨的旧公交站，站牌在画面左侧，冷色自然光。\n声音：远处公交车引擎声逐渐靠近，无旁白。\n画面内容：0-2秒，中远景保持站牌、林秋和道路的空间关系；2-6秒，镜头稳定缓慢推近，公交车从背景驶入并减速。\n限制：保持角色、车票和光线连续，不切镜，无字幕。","inputArtifactRefs":[]}]}`,
		"skill-system-workflow-delivery":         `{"summary":"已审计 1 个镜头，可交付 1 个。","succeeded":[{"shotId":"shot-001","output":"outputs/shot-001.mp4"}],"failed":[],"retrySuggestions":[],"exportManifest":[{"shotId":"shot-001","file":"outputs/shot-001.mp4","status":"ready"}]}`,
	}
	apiExecutor := &workflowExecutionE2EExecutor{kind: AgentRunExecutorAPI, outputs: outputsBySkill}
	workerOptions := AgentRunWorkerOptions{ID: "system-workflow-e2e", LeaseDuration: time.Minute, Executor: apiExecutor}
	worker := NewAgentRunWorker(workerOptions)
	type expectedNode struct {
		key, executorType, agentVersionID, skillVersionID, outputType string
		parents                                                       []string
	}
	expected := []expectedNode{
		{"script", WorkflowExecutorSkill, "", "skill-version-system-workflow-script-3.1.0", "production_script", []string{"source"}},
		{"classify", WorkflowExecutorSkill, "", "skill-version-system-content-classifier-1.0.0", "content_profile", []string{"script"}},
		{"art", WorkflowExecutorSkill, "", "skill-version-system-workflow-art-3.1.0", "asset_catalog", []string{"script"}},
		{"character_brief", WorkflowExecutorSkill, "", "skill-version-system-asset-brief-character-1.0.0", "asset_brief", []string{"art"}},
		{"scene_brief", WorkflowExecutorSkill, "", "skill-version-system-asset-brief-scene-1.0.0", "asset_brief", []string{"art"}},
		{"prop_brief", WorkflowExecutorSkill, "", "skill-version-system-asset-brief-prop-1.0.0", "asset_brief", []string{"art"}},
		{"storyboard", WorkflowExecutorSkill, "", "skill-version-system-storyboard-vertical-short-1.0.0", "storyboard_package", []string{"script", "art", "classify"}},
		{"character_rendition", WorkflowExecutorSkill, "", "skill-version-system-asset-rendition-character-1.0.0", "asset_rendition", []string{"character_brief"}},
		{"scene_rendition", WorkflowExecutorSkill, "", "skill-version-system-asset-rendition-scene-1.0.0", "asset_rendition", []string{"scene_brief"}},
		{"prop_rendition", WorkflowExecutorSkill, "", "skill-version-system-asset-rendition-prop-1.0.0", "asset_rendition", []string{"prop_brief"}},
		{"video", WorkflowExecutorSkill, "", "skill-version-system-workflow-video-3.1.0", "video_prompt_package", []string{"storyboard", "art", "character_rendition", "prop_rendition", "scene_rendition"}},
		{"delivery", WorkflowExecutorSkill, "", "skill-version-system-workflow-delivery-3.1.0", "delivery_report", []string{"video"}},
	}
	outputs := map[string]ArtifactEnvelope{"source": source}
	invocationIDs := make([]string, 0, len(expected))
	detail := confirmed
	for index, want := range expected {
		node := detail.Nodes[index]
		if node.NodeKey != want.key || node.ExecutorType != want.executorType || node.AgentPlanID != "" {
			t.Fatalf("node[%d]=%#v want=%#v", index, node, want)
		}
		invocationID := node.InvocationID
		if invocationID == "" {
			t.Fatalf("node=%s did not start an invocation: %#v", want.key, node)
		}
		invocationIDs = append(invocationIDs, invocationID)
		invocation, err := GetInvocationDetail("user-1", invocationID)
		if err != nil || len(invocation.Revisions) != 1 || invocation.Revisions[0].SkillVersionID != want.skillVersionID {
			t.Fatalf("node=%s invocation=%#v err=%v", want.key, invocation, err)
		}
		for _, parent := range want.parents {
			found := false
			for _, ref := range invocation.AuthoritativeArtifactRefs {
				found = found || (ref.Direction == "input" && ref.ArtifactID == outputs[parent].Artifact.ID && ref.ArtifactHash == outputs[parent].Artifact.ContentHash)
			}
			if !found {
				t.Fatalf("node=%s missing frozen parent=%s refs=%#v", want.key, parent, invocation.AuthoritativeArtifactRefs)
			}
		}
		if err := worker.ProcessOne(context.Background()); err != nil {
			t.Fatal(err)
		}
		reviewState, err := ContinueWorkflowExecution("user-1", confirmed.Run.ID)
		if err != nil || reviewState.Nodes[index].Status != model.WorkflowNodeExecutionNeedsReview {
			failedInvocation, _ := GetInvocationDetail("user-1", invocationID)
			t.Fatalf("node=%s review state=%#v invocation=%#v err=%v", want.key, reviewState.Nodes, failedInvocation, err)
		}
		invocation = mustApproveWorkflowE2EInvocation(t, invocationID)
		if invocation.OutputArtifacts[0].Artifact.ArtifactType != want.outputType || invocation.OutputArtifacts[0].Artifact.ProducerInvocationID == nil || *invocation.OutputArtifacts[0].Artifact.ProducerInvocationID != invocationID {
			t.Fatalf("node=%s output=%#v", want.key, invocation.OutputArtifacts[0])
		}
		wantCredits := 1
		if want.outputType == "asset_rendition" {
			wantCredits = 3
		}
		if len(invocation.Attempts) != 1 || invocation.Attempts[0].CreditsReserved != wantCredits || invocation.Attempts[0].CreditsRefunded != 0 {
			t.Fatalf("node=%s attempts=%#v", want.key, invocation.Attempts)
		}
		for _, gate := range invocation.Attempts[0].Gates {
			if !gate.Passed {
				t.Fatalf("node=%s gate=%#v", want.key, gate)
			}
		}
		outputs[want.key] = invocation.OutputArtifacts[0]
		detail, err = ContinueWorkflowExecution("user-1", confirmed.Run.ID)
		if err != nil {
			t.Fatal(err)
		}
		if detail.Nodes[index].Status != model.WorkflowNodeExecutionApproved && detail.Nodes[index].Status != model.WorkflowNodeExecutionCompleted {
			t.Fatalf("node=%s after approval=%#v", want.key, detail.Nodes[index])
		}
	}
	if detail.Run.Status != model.WorkflowExecutionCompleted || outputs["delivery"].Artifact.ArtifactType != "delivery_report" {
		t.Fatalf("completed=%#v delivery=%#v", detail.Run, outputs["delivery"])
	}
	reloaded, err := GetWorkflowExecutionDetail("user-1", detail.Run.ID)
	if err != nil || reloaded.Run.WorkflowVersionID != systemProductionWorkflowVersionID || reloaded.Run.WorkflowContentHash != preflight.Run.WorkflowContentHash {
		t.Fatalf("reloaded=%#v err=%v", reloaded, err)
	}
	for index := range detail.Nodes {
		if reloaded.Nodes[index].ID != detail.Nodes[index].ID || reloaded.Nodes[index].InvocationID != detail.Nodes[index].InvocationID || reloaded.Nodes[index].AgentPlanID != detail.Nodes[index].AgentPlanID {
			t.Fatalf("coordinate drift index=%d before=%#v after=%#v", index, detail.Nodes[index], reloaded.Nodes[index])
		}
	}
	user, ok, err := repository.GetUserByID("user-1")
	if err != nil || !ok || user.Credits != 82 || apiExecutor.calls.Load() != 12 || len(invocationIDs) != 12 {
		t.Fatalf("user=%#v apiCalls=%d invocations=%#v ok=%v err=%v", user, apiExecutor.calls.Load(), invocationIDs, ok, err)
	}
}

func TestEnsureWorkflowSeedsPublishesComposableProductionTemplate(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureAgentSeeds(); err != nil {
		t.Fatal(err)
	}
	if err := EnsureWorkflowSeeds(); err != nil {
		t.Fatal(err)
	}
	if err := EnsureWorkflowSeeds(); err != nil {
		t.Fatal(err)
	}

	workflow, ok, err := repository.GetWorkflowDefinition(systemProductionWorkflowID)
	if err != nil || !ok {
		t.Fatalf("workflow=%+v ok=%v err=%v", workflow, ok, err)
	}
	if workflow.OwnerType != model.WorkflowOwnerSystem || !workflow.Enabled || workflow.RecommendedVersionID != systemProductionWorkflowVersionID {
		t.Fatalf("workflow=%+v", workflow)
	}
	version, ok, err := repository.GetWorkflowVersion(systemProductionWorkflowVersionID)
	if err != nil || !ok || version.Status != model.WorkflowVersionPublished || version.ContentHash == "" {
		t.Fatalf("version=%+v ok=%v err=%v", version, ok, err)
	}
	packageValue, err := DecodeWorkflowPackage(version)
	if err != nil {
		t.Fatal(err)
	}
	if version.Version != "2.3.0" || len(packageValue.Nodes) != 12 || len(packageValue.InputArtifactTypes) != 1 || packageValue.InputArtifactTypes[0] != "source_text" {
		t.Fatalf("package=%+v", packageValue)
	}
	for _, node := range packageValue.Nodes {
		if node.ExecutorType != WorkflowExecutorSkill || node.AgentRef != nil || node.SkillBinding == nil {
			t.Fatalf("system production node must be Skill-only: %+v", node)
		}
	}
	script := packageValue.Nodes[0].SkillBinding
	if script.Mode != WorkflowSkillBindingManualBeforeRun || script.SkillID != "skill-system-workflow-script" || script.Capability != "workflow.stage.script" || script.SkillVersionID != "" || packageValue.Nodes[1].SkillBinding.SkillVersionID != "skill-version-system-content-classifier-1.0.0" || packageValue.Nodes[6].SkillBinding.Mode != WorkflowSkillBindingTagRoute {
		t.Fatalf("template refs are not frozen: %+v", packageValue.Nodes)
	}
	video := packageValue.Nodes[10]
	foundRenditions := false
	for _, binding := range video.InputBindings {
		if binding.BindingName == "asset_rendition" && binding.ArtifactType == "asset_rendition" && len(binding.FromNodeKeys) == 3 {
			foundRenditions = true
		}
	}
	if !foundRenditions {
		t.Fatalf("video node does not aggregate asset renditions: %+v", video)
	}
	versions, err := repository.ListWorkflowVersions(workflow.ID)
	if err != nil || len(versions) != 1 {
		t.Fatalf("versions=%+v err=%v", versions, err)
	}
}

func TestSystemProductionWorkflowIsVisibleAndCopyable(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureAgentSeeds(); err != nil {
		t.Fatal(err)
	}
	if err := EnsureWorkflowSeeds(); err != nil {
		t.Fatal(err)
	}

	items, err := ListVisibleWorkflows("user-1", "project-1")
	if err != nil || len(items) != 1 || items[0].Workflow.ID != systemProductionWorkflowID || items[0].RecommendedPackage == nil {
		t.Fatalf("items=%+v err=%v", items, err)
	}
	copied, err := CopyWorkflowToProject("user-1", systemProductionWorkflowID, "project-1", "标准生产流（项目版）")
	if err != nil || copied.Workflow.OwnerType != model.WorkflowOwnerProject || copied.Version.Status != model.WorkflowVersionDraft || len(copied.Package.Nodes) != 12 {
		t.Fatalf("copied=%+v err=%v", copied, err)
	}
}

func TestSystemProductionWorkflowPreflightFreezesEveryNode(t *testing.T) {
	setupInvocationServiceTest(t)
	setupSystemProductionWorkflowModels(t)
	if err := EnsureWorkflowSeeds(); err != nil {
		t.Fatal(err)
	}
	source := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"场次 1，清晨，旧公交站。"}`)
	detail, err := PreflightWorkflowExecution("user-1", WorkflowExecutionPreflightInput{
		WorkflowVersionID: systemProductionWorkflowVersionID,
		ProjectID:         "project-1",
		EpisodeID:         "episode-1",
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "source_text", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash}},
		ManualSelections:  map[string]string{"script": "skill-version-system-workflow-script-3.1.0"},
		Parameters:        json.RawMessage(`{"format":"9:16","seriesType":"short_drama"}`),
		IdempotencyKey:    "system-production-preflight",
	})
	if err != nil {
		t.Fatal(err)
	}
	if detail.Run.Status != model.WorkflowExecutionAwaitingConfirmation || !detail.Preview.Executable || len(detail.Nodes) != 12 || len(detail.Preview.Nodes) != 12 || detail.Run.EstimatedCredits != 18 {
		t.Fatalf("detail=%+v", detail)
	}
	for _, node := range detail.Preview.Nodes {
		if node.BlockCode != "" || (node.AgentVersionID == "" && node.SkillVersionID == "") || node.EstimatedCredits < 0 {
			t.Fatalf("node=%+v", node)
		}
	}
	if detail.Run.EstimatedCredits <= 0 || detail.Run.ConfirmationFingerprint == "" || len(detail.ConfirmationRequirements) == 0 {
		t.Fatalf("run=%+v requirements=%+v", detail.Run, detail.ConfirmationRequirements)
	}
}

func TestSystemProductionWorkflowRoutesHorizontalLongFormStoryboard(t *testing.T) {
	setupInvocationServiceTest(t)
	setupSystemProductionWorkflowModels(t)
	if err := EnsureWorkflowSeeds(); err != nil {
		t.Fatal(err)
	}
	source := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"场次 1，黄昏，客厅。两人隔桌对坐。"}`)
	detail, err := PreflightWorkflowExecution("user-1", WorkflowExecutionPreflightInput{
		WorkflowVersionID: systemProductionWorkflowVersionID,
		ProjectID:         "project-1",
		EpisodeID:         "episode-1",
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "source_text", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash}},
		ManualSelections:  map[string]string{"script": "skill-version-system-workflow-script-3.1.0"},
		Parameters:        json.RawMessage(`{"format":"16:9","seriesType":"long_form"}`),
		IdempotencyKey:    "system-production-horizontal-long",
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, node := range detail.Preview.Nodes {
		if node.NodeKey == "storyboard" {
			if node.SkillVersionID != "skill-version-system-storyboard-horizontal-long-1.0.0" || node.BlockCode != "" {
				t.Fatalf("storyboard route=%+v", node)
			}
			return
		}
	}
	t.Fatal("storyboard route is missing")
}

func setupSystemProductionWorkflowModels(t *testing.T) {
	t.Helper()
	if _, err := SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{
			AvailableModels:   []string{"text-test", "image-test"},
			DefaultTextModel:  "text-test",
			DefaultImageModel: "image-test",
			ModelCosts:        []model.ModelCost{{Model: "text-test", Credits: 1}, {Model: "image-test", Credits: 3}},
		}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{
			{ID: "text-channel", Protocol: string(model.ModelProtocolOpenAI), Name: "text", BaseURL: "https://example.invalid/v1", APIKey: "text-key", Models: []string{"text-test"}, Capabilities: []string{"text"}, Enabled: true},
			{ID: "image-channel", Protocol: string(model.ModelProtocolOpenAI), Name: "image", BaseURL: "https://example.invalid/v1", APIKey: "image-key", Models: []string{"image-test"}, Capabilities: []string{"image"}, Enabled: true},
		}},
	}); err != nil {
		t.Fatal(err)
	}
}
