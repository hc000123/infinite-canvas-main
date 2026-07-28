package service

import (
	"context"
	"encoding/json"
	"sync/atomic"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const workflowExecutionBusStopScript = `场次 1，清晨，旧公交站。
林秋站在站牌下，手里捏着一张折起的车票。公交车由远及近。
林秋低声说：“这次不等了。”
她把车票收进口袋，向车门走去。`

func TestWorkflowExecutionE2EBusStopParallelJoinAndAgent(t *testing.T) {
	fixture := seedWorkflowExecutionE2E(t)
	preflight, err := PreflightWorkflowExecution("user-1", fixture.request)
	if err != nil {
		t.Fatal(err)
	}
	if !preflight.Preview.Executable || preflight.Run.EstimatedCredits != 4 || len(preflight.Nodes) != 4 {
		t.Fatalf("preflight=%#v", preflight)
	}
	classificationPreview := preflight.Preview.Nodes[1]
	if classificationPreview.SkillVersionID != fixture.classificationVersionID || classificationPreview.RouteTrace.FinalSkillVersionID != fixture.classificationVersionID || len(classificationPreview.RouteTrace.Candidates) == 0 || !classificationPreview.RouteTrace.Candidates[0].Accepted {
		t.Fatalf("classification route=%#v", classificationPreview)
	}
	confirmed, err := ConfirmWorkflowExecution("user-1", preflight.Run.ID, WorkflowExecutionConfirmationInput{Revision: 1, Fingerprint: preflight.Run.ConfirmationFingerprint, RequirementCodes: preflight.ConfirmationRequirements})
	if err != nil {
		t.Fatal(err)
	}
	if confirmed.Nodes[0].InvocationID == "" || confirmed.Nodes[1].InvocationID == "" || confirmed.Nodes[2].InvocationID != "" || confirmed.Nodes[3].AgentPlanID != "" {
		t.Fatalf("parallel roots=%#v", confirmed.Nodes)
	}

	executor := &workflowExecutionE2EExecutor{outputs: map[string]string{
		"e2e-assets":     `{"items":[{"assetId":"character-001","kind":"character","name":"林秋","sourceEvidence":["林秋站在站牌下"],"coreFacts":["手持折起的车票"]}]}`,
		"e2e-classify":   `{"routingTags":[{"tag":"女频","evidence":["林秋主动告别等待"],"confidence":0.92},{"tag":"都市短剧","evidence":["旧公交站场景"],"confidence":0.9}]}`,
		"e2e-storyboard": `{"shots":[{"shotId":"shot-001","sceneKey":"scene-001","sourceScript":"林秋站在站牌下，手里捏着一张折起的车票。公交车由远及近。","shotDraft":{"shotSize":"中景","camera":"平视","movement":"缓慢推近","action":"林秋捏着车票等待，公交车由远及近","performance":"克制而坚定","dialogue":"","durationSeconds":7,"continuityMode":"continuous"}},{"shotId":"shot-002","sceneKey":"scene-001","sourceScript":"林秋低声说：“这次不等了。”","shotDraft":{"shotSize":"中近景","camera":"平视","movement":"跟拍","action":"林秋收起车票走向车门","performance":"下定决心","dialogue":"这次不等了。","durationSeconds":7,"continuityMode":"continuous"}}]}`,
		"e2e-prompt":     `{"items":[{"shotId":"shot-001","prompt":"场景：清晨的旧公交站，冷色自然光。\n声音：公交车驶近的环境声，无台词。\n画面内容：\n0-3秒：中景缓慢推近，林秋站在站牌下捏着折起的车票。\n3-7秒：公交车由远及近，林秋抬眼看向车门。\n限制：无字幕、无水印、无 logo。","inputArtifactRefs":[]}]}`,
	}}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "workflow-e2e", LeaseDuration: time.Minute, Executor: executor})
	for index := 0; index < 2; index++ {
		if err := worker.ProcessOne(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	rootReview, err := ContinueWorkflowExecution("user-1", confirmed.Run.ID)
	if err != nil || rootReview.Run.Status != model.WorkflowExecutionNeedsReview {
		t.Fatalf("root review=%#v err=%v", rootReview, err)
	}
	rootOutputIDs := map[string]bool{}
	for _, node := range rootReview.Nodes[:2] {
		detail := mustApproveWorkflowE2EInvocation(t, node.InvocationID)
		rootOutputIDs[detail.OutputArtifacts[0].Artifact.ID] = true
	}
	storyboardStarted, err := ContinueWorkflowExecution("user-1", confirmed.Run.ID)
	if err != nil || storyboardStarted.Nodes[2].InvocationID == "" || storyboardStarted.Nodes[2].Status != model.WorkflowNodeExecutionQueued {
		t.Fatalf("storyboard start=%#v err=%v", storyboardStarted.Nodes, err)
	}
	storyboardInvocation, err := GetInvocationDetail("user-1", storyboardStarted.Nodes[2].InvocationID)
	if err != nil {
		t.Fatal(err)
	}
	storyboardInputs := map[string]bool{}
	for _, ref := range storyboardInvocation.AuthoritativeArtifactRefs {
		if ref.Direction == "input" {
			storyboardInputs[ref.ArtifactID] = true
		}
	}
	if !storyboardInputs[fixture.sourceArtifactID] {
		t.Fatalf("storyboard missing source input: %#v", storyboardInputs)
	}
	for artifactID := range rootOutputIDs {
		if !storyboardInputs[artifactID] {
			t.Fatalf("storyboard missing parent %s: %#v", artifactID, storyboardInputs)
		}
	}
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := ContinueWorkflowExecution("user-1", confirmed.Run.ID); err != nil {
		t.Fatal(err)
	}
	storyboardDetail := mustApproveWorkflowE2EInvocation(t, storyboardStarted.Nodes[2].InvocationID)
	agentStarted, err := ContinueWorkflowExecution("user-1", confirmed.Run.ID)
	if err != nil || agentStarted.Nodes[3].AgentPlanID == "" || agentStarted.Nodes[3].Status != model.WorkflowNodeExecutionRunning {
		t.Fatalf("agent start=%#v err=%v", agentStarted.Nodes, err)
	}
	agentPlan, err := GetAgentPlanDetail("user-1", agentStarted.Nodes[3].AgentPlanID)
	if err != nil || len(agentPlan.Steps) != 1 || agentPlan.Steps[0].Step.InvocationID == "" || agentPlan.Plan.AgentVersionID != fixture.agentVersionID {
		t.Fatalf("agent plan=%#v err=%v", agentPlan, err)
	}
	promptInvocationID := agentPlan.Steps[0].Step.InvocationID
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := ContinueWorkflowExecution("user-1", confirmed.Run.ID); err != nil {
		t.Fatal(err)
	}
	promptDetail := mustApproveWorkflowE2EInvocation(t, promptInvocationID)
	completed, err := ContinueWorkflowExecution("user-1", confirmed.Run.ID)
	if err != nil || completed.Run.Status != model.WorkflowExecutionCompleted || completed.Nodes[3].Status != model.WorkflowNodeExecutionCompleted {
		t.Fatalf("completed=%#v err=%v", completed, err)
	}
	if len(storyboardDetail.OutputArtifacts) != 1 || len(promptDetail.OutputArtifacts) != 1 {
		t.Fatalf("storyboard/prompt outputs=%#v/%#v", storyboardDetail.OutputArtifacts, promptDetail.OutputArtifacts)
	}
	var finalRefs []ArtifactRefInput
	if json.Unmarshal([]byte(completed.Nodes[3].OutputArtifactRefsJSON), &finalRefs) != nil || len(finalRefs) != 1 || finalRefs[0].ArtifactID != promptDetail.OutputArtifacts[0].Artifact.ID {
		t.Fatalf("final refs=%#v", finalRefs)
	}
	reloaded, err := GetWorkflowExecutionDetail("user-1", completed.Run.ID)
	if err != nil || reloaded.Run.WorkflowVersionID != preflight.Run.WorkflowVersionID || reloaded.Run.WorkflowContentHash != preflight.Run.WorkflowContentHash || len(reloaded.Nodes) != len(completed.Nodes) {
		t.Fatalf("reloaded=%#v err=%v", reloaded, err)
	}
	for index := range completed.Nodes {
		if reloaded.Nodes[index].ID != completed.Nodes[index].ID || reloaded.Nodes[index].InvocationID != completed.Nodes[index].InvocationID || reloaded.Nodes[index].AgentPlanID != completed.Nodes[index].AgentPlanID {
			t.Fatalf("coordinate drift index=%d before=%#v after=%#v", index, completed.Nodes[index], reloaded.Nodes[index])
		}
	}
	user, ok, err := repository.GetUserByID("user-1")
	if err != nil || !ok || user.Credits != 96 || executor.calls.Load() != 4 {
		t.Fatalf("user=%#v calls=%d ok=%v err=%v", user, executor.calls.Load(), ok, err)
	}
}

type workflowExecutionE2EFixture struct {
	request                 WorkflowExecutionPreflightInput
	sourceArtifactID        string
	classificationVersionID string
	agentVersionID          string
}

func seedWorkflowExecutionE2E(t *testing.T) workflowExecutionE2EFixture {
	t.Helper()
	setupInvocationServiceTest(t)
	settings, err := repository.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	settings.Public.ModelChannel.ModelCosts = []model.ModelCost{{Model: "text-test", Credits: 1}}
	if _, err := SaveSettings(settings); err != nil {
		t.Fatal(err)
	}
	stamp := now()
	if _, err := repository.SaveUser(model.User{ID: "user-1", Username: "workflow-e2e", Credits: 100, Status: model.UserStatusActive, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
		t.Fatal(err)
	}
	assets, _ := seedWorkflowExecutionE2ESkill(t, "e2e-assets", "asset.extract", []ArtifactInputSpec{{BindingName: "source", ArtifactType: "source_text", Required: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0"}}, "assets", "asset_catalog", nil)
	classify, classifyVersion := seedWorkflowExecutionE2ESkill(t, "e2e-classify", "content.classify", []ArtifactInputSpec{{BindingName: "source", ArtifactType: "source_text", Required: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0"}}, "profile", "content_profile", []string{"short_drama"})
	storyboard, _ := seedWorkflowExecutionE2ESkill(t, "e2e-storyboard", "storyboard.compose", []ArtifactInputSpec{
		{BindingName: "source", ArtifactType: "source_text", Required: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0"},
		{BindingName: "assets", ArtifactType: "asset_catalog", Required: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0"},
		{BindingName: "profile", ArtifactType: "content_profile", Required: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0"},
	}, "storyboard", "storyboard_package", nil)
	prompt, promptVersion := seedWorkflowExecutionE2ESkill(t, "e2e-prompt", "prompt.compose", []ArtifactInputSpec{{BindingName: "storyboard", ArtifactType: "storyboard_package", Required: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0"}}, "prompts", "video_prompt_package", nil)
	agent, err := CreateProjectAgent("user-1", AgentCreateInput{ProjectID: "project-1", Name: "提示词导演", Version: "1.0.0", Package: AgentPackage{
		RolePrompt: "组合已批准分镜，生成视频提示词包。", PlannerMode: AgentPlannerConfiguredChain,
		DefaultSkillRefs:  []AgentSkillRef{{StepKey: "prompt", Label: "提示词", Capability: "prompt.compose", SkillID: prompt.ID, SkillVersionID: promptVersion.ID, Required: true, Parameters: json.RawMessage(`{}`), ExpectedOutputType: "video_prompt_package"}},
		SkillAccessPolicy: AgentSkillAccessPolicy{AllowedSkillIDs: []string{prompt.ID}, AllowedOwnerTypes: []model.SkillOwnerType{model.SkillOwnerSystem}},
		ExecutionPolicy:   AgentExecutionPolicy{MaxSteps: 1},
	}})
	if err != nil {
		t.Fatal(err)
	}
	publishedAgent, err := PublishAgentVersion("user-1", agent.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	source, err := CreateArtifact("user-1", CreateArtifactInput{ArtifactType: "source_text", SchemaVersion: "1.0.0", ProjectID: "project-1", EpisodeID: "episode-1", Payload: json.RawMessage(`{"text":` + mustJSONTestString(workflowExecutionBusStopScript) + `}`)})
	if err != nil {
		t.Fatal(err)
	}
	pkg := WorkflowPackage{InputArtifactTypes: []string{"source_text"}, Nodes: []WorkflowNodeSpec{
		{NodeKey: "assets", Name: "资产提取", ExecutorType: WorkflowExecutorSkill, SkillBinding: &WorkflowSkillBinding{Mode: WorkflowSkillBindingFixed, SkillID: assets.ID}, InputBindings: []WorkflowNodeInputBinding{{BindingName: "source", ArtifactType: "source_text", Source: WorkflowInputSource, WorkflowInputName: "source", Required: true}}, OutputArtifactType: "asset_catalog"},
		{NodeKey: "classify", Name: "内容分类", ExecutorType: WorkflowExecutorSkill, SkillBinding: &WorkflowSkillBinding{Mode: WorkflowSkillBindingTagRoute, Capability: "content.classify", ExpectedOutputArtifactType: "content_profile", ProjectTags: []string{"short_drama"}, CandidateSkillIDs: []string{classify.ID}}, InputBindings: []WorkflowNodeInputBinding{{BindingName: "source", ArtifactType: "source_text", Source: WorkflowInputSource, WorkflowInputName: "source", Required: true}}, OutputArtifactType: "content_profile"},
		{NodeKey: "storyboard", Name: "分镜制作", ExecutorType: WorkflowExecutorSkill, SkillBinding: &WorkflowSkillBinding{Mode: WorkflowSkillBindingFixed, SkillID: storyboard.ID}, InputBindings: []WorkflowNodeInputBinding{
			{BindingName: "source", ArtifactType: "source_text", Source: WorkflowInputSource, WorkflowInputName: "source", Required: true},
			{BindingName: "assets", ArtifactType: "asset_catalog", Source: WorkflowNodeSource, FromNodeKey: "assets", Required: true},
			{BindingName: "profile", ArtifactType: "content_profile", Source: WorkflowNodeSource, FromNodeKey: "classify", Required: true},
		}, DependsOn: []string{"assets", "classify"}, OutputArtifactType: "storyboard_package"},
		{NodeKey: "prompt", Name: "提示词编排", ExecutorType: WorkflowExecutorAgent, AgentRef: &WorkflowAgentRef{AgentID: publishedAgent.Agent.ID, AgentVersionID: publishedAgent.Version.ID}, InputBindings: []WorkflowNodeInputBinding{{BindingName: "storyboard", ArtifactType: "storyboard_package", Source: WorkflowNodeSource, FromNodeKey: "storyboard", Required: true}}, DependsOn: []string{"storyboard"}, OutputArtifactType: "video_prompt_package"},
	}}
	workflow, err := CreateProjectWorkflow("user-1", WorkflowCreateInput{ProjectID: "project-1", Name: "公交站完整流程", Version: "1.0.0", Package: pkg})
	if err != nil {
		t.Fatal(err)
	}
	published, err := PublishWorkflowVersion("user-1", workflow.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	return workflowExecutionE2EFixture{
		sourceArtifactID: source.Artifact.ID, classificationVersionID: classifyVersion.ID, agentVersionID: publishedAgent.Version.ID,
		request: WorkflowExecutionPreflightInput{WorkflowVersionID: published.Version.ID, ProjectID: "project-1", EpisodeID: "episode-1", InputArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash}}, ProjectTags: []string{"short_drama"}, Parameters: json.RawMessage(`{"format":"9:16"}`), IdempotencyKey: "workflow-bus-stop-e2e"},
	}
}

func seedWorkflowExecutionE2ESkill(t *testing.T, id, capability string, inputs []ArtifactInputSpec, outputBinding, outputType string, tags []string) (model.SkillDefinition, model.SkillVersion) {
	t.Helper()
	return seedInvocationSkill(t, invocationSkillSeed{ID: id, VersionID: id + "-v1", Version: "1.0.0", Recommended: true, ProjectTags: tags, Mutate: func(pkg *SkillPackage) {
		pkg.Manifest.Capabilities = []string{capability}
		pkg.Manifest.InputArtifactTypes = make([]string, 0, len(inputs))
		pkg.Manifest.OutputArtifactTypes = []string{outputType}
		pkg.Manifest.SchemaCompatibility = map[string]string{}
		for _, input := range inputs {
			pkg.Manifest.InputArtifactTypes = append(pkg.Manifest.InputArtifactTypes, input.ArtifactType)
			pkg.Manifest.SchemaCompatibility[input.ArtifactType] = input.SchemaConstraint
		}
		pkg.InputContract.ArtifactInputs = inputs
		pkg.OutputContract.ArtifactOutputs = []ArtifactOutputSpec{{BindingName: outputBinding, ArtifactType: outputType, Min: 1, Max: 1, SchemaVersion: "1.0.0"}}
	}})
}

func mustApproveWorkflowE2EInvocation(t *testing.T, invocationID string) InvocationDetail {
	t.Helper()
	detail, err := GetInvocationDetail("user-1", invocationID)
	if err != nil || detail.Run.Status != model.InvocationStatusNeedsReview || len(detail.OutputArtifacts) != 1 {
		t.Fatalf("invocation=%#v err=%v", detail, err)
	}
	if _, err := ReviewInvocation("user-1", invocationID, InvocationReviewInput{Decision: "approved", Attempt: detail.Run.LatestAttempt, ArtifactSetHash: detail.ArtifactSetHash}); err != nil {
		t.Fatal(err)
	}
	return detail
}

func mustJSONTestString(value string) string {
	raw, _ := json.Marshal(value)
	return string(raw)
}

type workflowExecutionE2EExecutor struct {
	calls   atomic.Int32
	kind    string
	outputs map[string]string
}

func (executor *workflowExecutionE2EExecutor) Kind() string {
	if executor.kind == "" {
		return AgentRunExecutorAPI
	}
	return executor.kind
}
func (*workflowExecutionE2EExecutor) Available(context.Context) error { return nil }
func (executor *workflowExecutionE2EExecutor) Call(_ context.Context, run model.AgentRun) agentRunCallResult {
	executor.calls.Add(1)
	output := executor.outputs[run.SkillID]
	return agentRunCallResult{rawOutput: output, structuredJSON: output}
}
func (*workflowExecutionE2EExecutor) ReserveCredits(run *model.AgentRun) error {
	return reserveAgentRunCredits(run)
}
func (*workflowExecutionE2EExecutor) RefundCredits(run *model.AgentRun) error {
	return refundAgentRunCredits(run)
}
