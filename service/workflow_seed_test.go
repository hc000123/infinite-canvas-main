package service

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestSystemProductionWorkflowExecutesSixNodesWithFrozenLineage(t *testing.T) {
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
	if !preflight.Preview.Executable || preflight.Run.EstimatedCredits != 6 || len(preflight.Nodes) != 6 {
		t.Fatalf("preflight=%#v", preflight)
	}
	confirmed, err := ConfirmWorkflowExecution("user-1", preflight.Run.ID, WorkflowExecutionConfirmationInput{Revision: 1, Fingerprint: preflight.Run.ConfirmationFingerprint, RequirementCodes: preflight.ConfirmationRequirements})
	if err != nil {
		t.Fatal(err)
	}

	executor := &workflowExecutionE2EExecutor{outputs: map[string]string{
		"skill-system-workflow-script":     `{"productionScript":"场次 1，清晨，旧公交站。\n林秋站在站牌下，手里捏着一张折起的车票。公交车由远及近。\n林秋低声说：“这次不等了。”\n她把车票收进口袋，向车门走去。"}`,
		"skill-system-workflow-art":        `{"items":[{"assetId":"character-001","kind":"character","name":"林秋","sourceEvidence":["林秋站在站牌下，手里捏着一张折起的车票。"],"coreFacts":["主要角色","在旧公交站等车","手持折起的车票"]},{"assetId":"scene-001","kind":"scene","name":"旧公交站","sourceEvidence":["场次 1，清晨，旧公交站。"],"coreFacts":["清晨","有站牌"]}]}`,
		"skill-system-workflow-assets":     `{"outputs":[{"bindingName":"asset_brief","ordinal":0,"payload":{"assetId":"character-001","brief":"同一位成年女性角色的设定四视图，同一面部身份、发型和服装，中性站姿，均匀影棚光。","format":"character-four-view"}}]}`,
		"skill-system-workflow-storyboard": `{"shots":[{"shotId":"shot-001","sceneKey":"scene-001","sourceScript":"林秋站在站牌下，手里捏着一张折起的车票。公交车由远及近。","shotDraft":{"shotSize":"中远景","camera":"与林秋肩部等高，站牌位于画面左侧","movement":"镜头稳定缓慢推近","action":"林秋捏紧折起的车票，公交车从远处驶近","performance":"视线停在车来的方向，肩部略紧","dialogue":"","durationSeconds":6,"continuityMode":"continuous"}}]}`,
		"skill-system-workflow-video":      `{"items":[{"shotId":"shot-001","prompt":"场景：清晨的旧公交站，站牌在画面左侧，冷色自然光。\n声音：远处公交车引擎声逐渐靠近，无旁白。\n画面内容：0-2秒，中远景保持站牌、林秋和道路的空间关系；2-6秒，镜头稳定缓慢推近，公交车从背景驶入并减速。\n限制：保持角色、车票和光线连续，不切镜，无字幕。","inputArtifactRefs":[]}]}`,
		"skill-system-workflow-delivery":   `{"summary":"已审计 1 个镜头，可交付 1 个。","succeeded":[{"shotId":"shot-001","output":"outputs/shot-001.mp4"}],"failed":[],"retrySuggestions":[],"exportManifest":[{"shotId":"shot-001","file":"outputs/shot-001.mp4","status":"ready"}]}`,
	}}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "system-workflow-e2e", LeaseDuration: time.Minute, Executor: executor})
	type expectedNode struct {
		key, executorType, agentVersionID, skillVersionID, outputType string
		parents                                                       []string
	}
	expected := []expectedNode{
		{"script", WorkflowExecutorAgent, "agent-version-system-script-1.0.0", "skill-version-system-workflow-script-3.1.0", "production_script", []string{"source"}},
		{"art", WorkflowExecutorAgent, "agent-version-system-art-1.0.0", "skill-version-system-workflow-art-3.1.0", "asset_catalog", []string{"script"}},
		{"assets", WorkflowExecutorSkill, "", "skill-version-system-workflow-assets-3.1.0", "asset_brief", []string{"art"}},
		{"storyboard", WorkflowExecutorAgent, "agent-version-system-storyboard-1.0.0", "skill-version-system-workflow-storyboard-3.1.0", "storyboard_package", []string{"script", "art"}},
		{"video", WorkflowExecutorSkill, "", "skill-version-system-workflow-video-3.1.0", "video_prompt_package", []string{"storyboard", "art"}},
		{"delivery", WorkflowExecutorSkill, "", "skill-version-system-workflow-delivery-3.1.0", "delivery_report", []string{"video"}},
	}
	outputs := map[string]ArtifactEnvelope{"source": source}
	invocationIDs := make([]string, 0, len(expected))
	detail := confirmed
	for index, want := range expected {
		node := detail.Nodes[index]
		if node.NodeKey != want.key || node.ExecutorType != want.executorType {
			t.Fatalf("node[%d]=%#v want=%#v", index, node, want)
		}
		invocationID := node.InvocationID
		if want.executorType == WorkflowExecutorAgent {
			plan, err := GetAgentPlanDetail("user-1", node.AgentPlanID)
			if err != nil || plan.Plan.AgentVersionID != want.agentVersionID || len(plan.Steps) != 1 {
				t.Fatalf("node=%s plan=%#v err=%v", want.key, plan, err)
			}
			invocationID = plan.Steps[0].Step.InvocationID
		}
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
		if len(invocation.Attempts) != 1 || invocation.Attempts[0].CreditsReserved != 1 || invocation.Attempts[0].CreditsRefunded != 0 {
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
	if err != nil || !ok || user.Credits != 94 || executor.calls.Load() != 6 || len(invocationIDs) != 6 {
		t.Fatalf("user=%#v calls=%d invocations=%#v ok=%v err=%v", user, executor.calls.Load(), invocationIDs, ok, err)
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
	if len(packageValue.Nodes) != 6 || len(packageValue.InputArtifactTypes) != 1 || packageValue.InputArtifactTypes[0] != "source_text" {
		t.Fatalf("package=%+v", packageValue)
	}
	if packageValue.Nodes[0].ExecutorType != WorkflowExecutorAgent || packageValue.Nodes[1].ExecutorType != WorkflowExecutorAgent || packageValue.Nodes[2].ExecutorType != WorkflowExecutorSkill {
		t.Fatalf("template must combine Agent and Skill nodes: %+v", packageValue.Nodes)
	}
	if packageValue.Nodes[0].AgentRef.AgentVersionID != "agent-version-system-script-1.0.0" || packageValue.Nodes[2].SkillBinding.SkillVersionID != "skill-version-system-workflow-assets-3.1.0" {
		t.Fatalf("template refs are not frozen: %+v", packageValue.Nodes)
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
	if err != nil || copied.Workflow.OwnerType != model.WorkflowOwnerProject || copied.Version.Status != model.WorkflowVersionDraft || len(copied.Package.Nodes) != 6 {
		t.Fatalf("copied=%+v err=%v", copied, err)
	}
}

func TestSystemProductionWorkflowPreflightFreezesEveryNode(t *testing.T) {
	setupInvocationServiceTest(t)
	settings, err := repository.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	settings.Public.ModelChannel.ModelCosts = []model.ModelCost{{Model: "text-test", Credits: 1}}
	if _, err := SaveSettings(settings); err != nil {
		t.Fatal(err)
	}
	if err := EnsureWorkflowSeeds(); err != nil {
		t.Fatal(err)
	}
	source := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"场次 1，清晨，旧公交站。"}`)
	detail, err := PreflightWorkflowExecution("user-1", WorkflowExecutionPreflightInput{
		WorkflowVersionID: systemProductionWorkflowVersionID,
		ProjectID:         "project-1",
		EpisodeID:         "episode-1",
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "source_text", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash}},
		Parameters:        json.RawMessage(`{"format":"9:16","seriesType":"short_drama"}`),
		IdempotencyKey:    "system-production-preflight",
	})
	if err != nil {
		t.Fatal(err)
	}
	if detail.Run.Status != model.WorkflowExecutionAwaitingConfirmation || !detail.Preview.Executable || len(detail.Nodes) != 6 || len(detail.Preview.Nodes) != 6 {
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
