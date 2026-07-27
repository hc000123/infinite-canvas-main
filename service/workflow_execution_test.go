package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestWorkflowExecutionConfirmationStartsOnlyReadyRootNodes(t *testing.T) {
	fixture := workflowExecutionFixture(t)
	fixture.request.Parameters = json.RawMessage(`{ "tone": "cinematic", "count": 2 }`)
	preflight, err := PreflightWorkflowExecution(fixture.userID, fixture.request)
	if err != nil {
		t.Fatal(err)
	}
	if preflight.Run.Status != model.WorkflowExecutionAwaitingConfirmation || len(preflight.Nodes) != 2 {
		t.Fatalf("preflight=%#v", preflight)
	}
	confirmed, err := ConfirmWorkflowExecution(fixture.userID, preflight.Run.ID, WorkflowExecutionConfirmationInput{
		Revision: preflight.Run.Revision, Fingerprint: preflight.Run.ConfirmationFingerprint, RequirementCodes: preflight.ConfirmationRequirements,
	})
	if err != nil {
		t.Fatal(err)
	}
	if confirmed.Nodes[0].InvocationID == "" || confirmed.Nodes[0].Status != model.WorkflowNodeExecutionQueued {
		t.Fatalf("root=%#v", confirmed.Nodes[0])
	}
	if confirmed.Revision.ParametersJSON != `{"count":2,"tone":"cinematic"}` {
		t.Fatalf("frozen parameters=%q", confirmed.Revision.ParametersJSON)
	}
	revisions, err := repository.ListInvocationPreflightRevisions(fixture.userID, confirmed.Nodes[0].InvocationID)
	if err != nil || len(revisions) != 1 || revisions[0].ParametersJSON != confirmed.Revision.ParametersJSON {
		t.Fatalf("invocation parameters=%#v err=%v", revisions, err)
	}
	if confirmed.Nodes[1].InvocationID != "" || confirmed.Nodes[1].Status != model.WorkflowNodeExecutionBlocked {
		t.Fatalf("downstream=%#v", confirmed.Nodes[1])
	}
	replayed, err := ConfirmWorkflowExecution(fixture.userID, preflight.Run.ID, WorkflowExecutionConfirmationInput{
		Revision: preflight.Run.Revision, Fingerprint: preflight.Run.ConfirmationFingerprint, RequirementCodes: preflight.ConfirmationRequirements,
	})
	if err != nil || replayed.Nodes[0].InvocationID != confirmed.Nodes[0].InvocationID || replayed.Confirmation == nil || replayed.Confirmation.ID != confirmed.Confirmation.ID {
		t.Fatalf("confirmation replay=%#v err=%v", replayed, err)
	}
}

func TestWorkflowExecutionNodeIdempotencyKeySupportsMultiDigitRevision(t *testing.T) {
	got := workflowExecutionNodeIdempotencyKey("execution-1", 12, "assets")
	if got != "workflow-execution:execution-1:revision:12:node:assets" {
		t.Fatalf("key=%q", got)
	}
}

func TestWorkflowExecutionNodeInputsAggregatesMultipleSourcesInStableOrder(t *testing.T) {
	spec := WorkflowNodeSpec{InputBindings: []WorkflowNodeInputBinding{{
		BindingName: "asset_rendition", ArtifactType: "asset_rendition", Source: WorkflowNodeSource,
		FromNodeKeys: []string{"character", "prop", "scene"}, FromOutputBinding: "asset_rendition", Required: true,
	}}}
	encode := func(refs ...ArtifactRefInput) string {
		raw, _ := json.Marshal(refs)
		return string(raw)
	}
	nodes := []model.WorkflowNodeExecution{
		{NodeKey: "scene", OutputArtifactRefsJSON: encode(ArtifactRefInput{BindingName: "asset_rendition", ArtifactID: "scene-0"})},
		{NodeKey: "character", OutputArtifactRefsJSON: encode(ArtifactRefInput{BindingName: "asset_rendition", ArtifactID: "character-0"}, ArtifactRefInput{BindingName: "asset_rendition", ArtifactID: "character-1"})},
		{NodeKey: "prop", OutputArtifactRefsJSON: encode(ArtifactRefInput{BindingName: "asset_rendition", ArtifactID: "prop-0"})},
	}
	refs, err := workflowExecutionNodeInputs(spec, nil, nodes)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"character-0", "character-1", "prop-0", "scene-0"}
	if len(refs) != len(want) {
		t.Fatalf("refs=%+v", refs)
	}
	for index, ref := range refs {
		if ref.BindingName != "asset_rendition" || ref.ArtifactID != want[index] {
			t.Fatalf("refs=%+v", refs)
		}
	}
	nodes[1].OutputArtifactRefsJSON = `[]`
	if _, err := workflowExecutionNodeInputs(spec, nil, nodes); err == nil || !strings.Contains(err.Error(), "尚未批准") {
		t.Fatalf("missing approved parent accepted: %v", err)
	}
}

func TestWorkflowExecutionAgentNodeStartsFrozenAgentPlan(t *testing.T) {
	agentFixture := seedTwoStepAgentPlan(t)
	created, err := CreateProjectWorkflow("user-1", WorkflowCreateInput{
		ProjectID: "project-1", Name: "Agent 执行流程", Version: "1.0.0",
		Package: WorkflowPackage{InputArtifactTypes: []string{"source_text"}, Nodes: []WorkflowNodeSpec{{
			NodeKey: "director", Name: "导演编排", ExecutorType: WorkflowExecutorAgent,
			AgentRef:           &WorkflowAgentRef{AgentID: agentFixture.CreateInput.AgentID, AgentVersionID: agentFixture.CreateInput.AgentVersionID},
			InputBindings:      []WorkflowNodeInputBinding{{BindingName: "source", ArtifactType: "source_text", Source: WorkflowInputSource, WorkflowInputName: "source"}},
			OutputArtifactType: "content_profile",
		}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	published, err := PublishWorkflowVersion("user-1", created.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	preflight, err := PreflightWorkflowExecution("user-1", WorkflowExecutionPreflightInput{
		WorkflowVersionID: published.Version.ID, ProjectID: "project-1", EpisodeID: "episode-1",
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: agentFixture.SourceArtifactID, ContentHash: agentFixture.SourceArtifactHash}},
		IdempotencyKey:    "workflow-agent-node-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	confirmed, err := ConfirmWorkflowExecution("user-1", preflight.Run.ID, WorkflowExecutionConfirmationInput{Revision: 1, Fingerprint: preflight.Run.ConfirmationFingerprint, RequirementCodes: preflight.ConfirmationRequirements})
	if err != nil {
		t.Fatal(err)
	}
	node := confirmed.Nodes[0]
	if node.AgentPlanID == "" || node.InvocationID != "" || node.Status != model.WorkflowNodeExecutionRunning {
		t.Fatalf("node=%#v", node)
	}
	plan, err := GetAgentPlanDetail("user-1", node.AgentPlanID)
	if err != nil || plan.Plan.AgentVersionID != agentFixture.CreateInput.AgentVersionID || len(plan.Steps) != 2 || plan.Steps[0].Step.InvocationID == "" {
		t.Fatalf("plan=%#v err=%v", plan, err)
	}
	firstInvocationID := plan.Steps[0].Step.InvocationID
	firstRaw := `{"productionScript":"优化后的公交站剧本"}`
	if err := NewAgentRunWorker(AgentRunWorkerOptions{ID: "workflow-agent-first", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: firstRaw, structuredJSON: firstRaw}}}).ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	needsReview, err := ContinueWorkflowExecution("user-1", confirmed.Run.ID)
	if err != nil || needsReview.Nodes[0].Status != model.WorkflowNodeExecutionNeedsReview {
		t.Fatalf("needs review=%#v err=%v", needsReview.Nodes, err)
	}
	firstDetail, err := GetInvocationDetail("user-1", firstInvocationID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ReviewInvocation("user-1", firstInvocationID, InvocationReviewInput{Decision: "approved", Attempt: 1, ArtifactSetHash: firstDetail.ArtifactSetHash}); err != nil {
		t.Fatal(err)
	}
	secondStarted, err := ContinueWorkflowExecution("user-1", confirmed.Run.ID)
	if err != nil {
		t.Fatal(err)
	}
	plan, err = GetAgentPlanDetail("user-1", node.AgentPlanID)
	if err != nil || plan.Steps[1].Step.InvocationID == "" || secondStarted.Nodes[0].Status != model.WorkflowNodeExecutionRunning {
		t.Fatalf("second started=%#v plan=%#v err=%v", secondStarted.Nodes, plan, err)
	}
	secondInvocationID := plan.Steps[1].Step.InvocationID
	secondRaw := `{"routingTags":[{"tag":"短剧","evidence":["公交站告别"],"confidence":0.95}]}`
	if err := NewAgentRunWorker(AgentRunWorkerOptions{ID: "workflow-agent-second", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: secondRaw, structuredJSON: secondRaw}}}).ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := ContinueWorkflowExecution("user-1", confirmed.Run.ID); err != nil {
		t.Fatal(err)
	}
	secondDetail, err := GetInvocationDetail("user-1", secondInvocationID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ReviewInvocation("user-1", secondInvocationID, InvocationReviewInput{Decision: "approved", Attempt: 1, ArtifactSetHash: secondDetail.ArtifactSetHash}); err != nil {
		t.Fatal(err)
	}
	completed, err := ContinueWorkflowExecution("user-1", confirmed.Run.ID)
	if err != nil || completed.Run.Status != model.WorkflowExecutionCompleted || completed.Nodes[0].Status != model.WorkflowNodeExecutionCompleted {
		t.Fatalf("completed=%#v err=%v", completed, err)
	}
	var outputRefs []ArtifactRefInput
	if json.Unmarshal([]byte(completed.Nodes[0].OutputArtifactRefsJSON), &outputRefs) != nil || len(outputRefs) != 1 || outputRefs[0].ArtifactID != secondDetail.OutputArtifacts[0].Artifact.ID {
		t.Fatalf("workflow output refs=%#v", outputRefs)
	}
}

func TestWorkflowExecutionPreflightIsIdempotentAndRejectsChangedRequest(t *testing.T) {
	fixture := workflowExecutionFixture(t)
	first, err := PreflightWorkflowExecution(fixture.userID, fixture.request)
	if err != nil {
		t.Fatal(err)
	}
	second, err := PreflightWorkflowExecution(fixture.userID, fixture.request)
	if err != nil || second.Run.ID != first.Run.ID {
		t.Fatalf("second=%#v err=%v", second, err)
	}
	fixture.request.EpisodeID = "episode-changed"
	if _, err := PreflightWorkflowExecution(fixture.userID, fixture.request); !errors.Is(err, repository.ErrWorkflowExecutionIdempotencyConflict) {
		t.Fatalf("changed request err=%v", err)
	}
}

func TestWorkflowExecutionSkipsRootWhenFrozenParameterConditionIsFalse(t *testing.T) {
	setupInvocationServiceTest(t)
	skill, _ := seedInvocationSkill(t, invocationSkillSeed{ID: "workflow-condition", VersionID: "workflow-condition-v1", Version: "1.0.0", Recommended: true})
	assetSkill, _ := seedInvocationSkill(t, invocationSkillSeed{ID: "workflow-condition-assets", VersionID: "workflow-condition-assets-v1", Version: "1.0.0", Recommended: true, Mutate: func(pkg *SkillPackage) {
		pkg.Manifest.Capabilities = []string{"asset.extract"}
		pkg.Manifest.InputArtifactTypes = []string{"production_script"}
		pkg.Manifest.OutputArtifactTypes = []string{"asset_catalog"}
		pkg.Manifest.SchemaCompatibility = map[string]string{"production_script": ">=1.0 <2.0"}
		pkg.InputContract.ArtifactInputs = []ArtifactInputSpec{{BindingName: "script", ArtifactType: "production_script", Required: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0"}}
		pkg.OutputContract.ArtifactOutputs = []ArtifactOutputSpec{{BindingName: "assets", ArtifactType: "asset_catalog", Min: 1, Max: 1, SchemaVersion: "1.0.0"}}
	}})
	root := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"公交站"}`)
	created, err := CreateProjectWorkflow("user-1", WorkflowCreateInput{
		ProjectID: "project-1", Name: "条件流程", Version: "1.0.0",
		Package: WorkflowPackage{InputArtifactTypes: []string{"source_text"}, Nodes: []WorkflowNodeSpec{{
			NodeKey: "script", Name: "剧本", ExecutorType: WorkflowExecutorSkill,
			SkillBinding:       &WorkflowSkillBinding{Mode: WorkflowSkillBindingFixed, SkillID: skill.ID},
			InputBindings:      []WorkflowNodeInputBinding{{BindingName: "source", ArtifactType: "source_text", Source: WorkflowInputSource, WorkflowInputName: "source"}},
			OutputArtifactType: "production_script",
			Condition:          &WorkflowCondition{Source: WorkflowInputSource, Key: "enabled", Operator: "equals", Value: json.RawMessage(`true`)},
		}, {
			NodeKey: "assets", Name: "资产", ExecutorType: WorkflowExecutorSkill,
			SkillBinding:  &WorkflowSkillBinding{Mode: WorkflowSkillBindingFixed, SkillID: assetSkill.ID},
			InputBindings: []WorkflowNodeInputBinding{{BindingName: "script", ArtifactType: "production_script", Source: WorkflowNodeSource, FromNodeKey: "script", Required: true}},
			DependsOn:     []string{"script"}, OutputArtifactType: "asset_catalog",
		}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	published, err := PublishWorkflowVersion("user-1", created.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	preflight, err := PreflightWorkflowExecution("user-1", WorkflowExecutionPreflightInput{
		WorkflowVersionID: published.Version.ID, ProjectID: "project-1", EpisodeID: "episode-1",
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: root.Artifact.ID, ContentHash: root.Artifact.ContentHash}},
		Parameters:        json.RawMessage(`{"enabled":false}`), IdempotencyKey: "workflow-condition-false",
	})
	if err != nil {
		t.Fatal(err)
	}
	confirmed, err := ConfirmWorkflowExecution("user-1", preflight.Run.ID, WorkflowExecutionConfirmationInput{Revision: 1, Fingerprint: preflight.Run.ConfirmationFingerprint, RequirementCodes: preflight.ConfirmationRequirements})
	if err != nil {
		t.Fatal(err)
	}
	if confirmed.Run.Status != model.WorkflowExecutionCompleted || len(confirmed.Nodes) != 2 || confirmed.Nodes[0].Status != model.WorkflowNodeExecutionSkipped || confirmed.Nodes[1].Status != model.WorkflowNodeExecutionSkipped || confirmed.Nodes[0].InvocationID != "" || confirmed.Nodes[1].InvocationID != "" {
		t.Fatalf("confirmed=%#v", confirmed)
	}
}

func TestWorkflowExecutionUnlocksDownstreamWithOnlyApprovedParentOutputs(t *testing.T) {
	fixture := workflowExecutionFixture(t)
	preflight, err := PreflightWorkflowExecution(fixture.userID, fixture.request)
	if err != nil {
		t.Fatal(err)
	}
	confirmed, err := ConfirmWorkflowExecution(fixture.userID, preflight.Run.ID, WorkflowExecutionConfirmationInput{Revision: 1, Fingerprint: preflight.Run.ConfirmationFingerprint, RequirementCodes: preflight.ConfirmationRequirements})
	if err != nil {
		t.Fatal(err)
	}
	raw := `{"productionScript":"清晨，林秋在旧公交站收起车票，走向驶来的公交车。"}`
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "workflow-execution-root", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	rootDetail, err := GetInvocationDetail(fixture.userID, confirmed.Nodes[0].InvocationID)
	if err != nil || rootDetail.Run.Status != model.InvocationStatusNeedsReview || len(rootDetail.OutputArtifacts) != 1 {
		t.Fatalf("root detail=%#v err=%v", rootDetail, err)
	}
	beforeApproval, err := ContinueWorkflowExecution(fixture.userID, confirmed.Run.ID)
	if err != nil || beforeApproval.Nodes[1].InvocationID != "" || beforeApproval.Nodes[1].Status != model.WorkflowNodeExecutionBlocked {
		t.Fatalf("before approval=%#v err=%v", beforeApproval.Nodes, err)
	}
	if _, err := ReviewInvocation(fixture.userID, rootDetail.Run.ID, InvocationReviewInput{Decision: "approved", Attempt: 1, ArtifactSetHash: rootDetail.ArtifactSetHash}); err != nil {
		t.Fatal(err)
	}
	continued, err := ContinueWorkflowExecution(fixture.userID, confirmed.Run.ID)
	if err != nil {
		t.Fatal(err)
	}
	child := continued.Nodes[1]
	if child.InvocationID == "" || child.Status != model.WorkflowNodeExecutionQueued {
		t.Fatalf("child=%#v", child)
	}
	childDetail, err := GetInvocationDetail(fixture.userID, child.InvocationID)
	if err != nil {
		t.Fatal(err)
	}
	inputRefs := make([]model.InvocationArtifactRef, 0)
	for _, ref := range childDetail.AuthoritativeArtifactRefs {
		if ref.Direction == "input" {
			inputRefs = append(inputRefs, ref)
		}
	}
	if len(inputRefs) != 1 || inputRefs[0].ArtifactID != rootDetail.OutputArtifacts[0].Artifact.ID || inputRefs[0].BindingName != "script" {
		t.Fatalf("child inputs=%#v root output=%#v", inputRefs, rootDetail.OutputArtifacts)
	}
}

func TestWorkflowExecutionResumesFailedNodeAfterFrozenInvocationRetry(t *testing.T) {
	fixture := workflowSingleNodeExecutionFixture(t)
	preflight, err := PreflightWorkflowExecution(fixture.userID, fixture.request)
	if err != nil {
		t.Fatal(err)
	}
	confirmed, err := ConfirmWorkflowExecution(fixture.userID, preflight.Run.ID, WorkflowExecutionConfirmationInput{Revision: 1, Fingerprint: preflight.Run.ConfirmationFingerprint, RequirementCodes: preflight.ConfirmationRequirements})
	if err != nil {
		t.Fatal(err)
	}
	invocationID := confirmed.Nodes[0].InvocationID
	invocationRun, ok, err := repository.GetUserInvocation(fixture.userID, invocationID)
	if err != nil || !ok {
		t.Fatalf("invocation run=%#v ok=%v err=%v", invocationRun, ok, err)
	}
	frozen, err := loadInvocationPreflightSnapshot(fixture.userID, invocationRun)
	if err != nil || frozen.ExecutionPolicy.MaxAttempts != 2 {
		t.Fatalf("frozen retry policy=%#v err=%v", frozen.ExecutionPolicy, err)
	}
	if err := NewAgentRunWorker(AgentRunWorkerOptions{ID: "workflow-retry-failure", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{message: "temporary upstream failure", retryable: true}}}).ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	failed, err := ContinueWorkflowExecution(fixture.userID, confirmed.Run.ID)
	if err != nil || failed.Run.Status != model.WorkflowExecutionFailed || failed.Nodes[0].Status != model.WorkflowNodeExecutionFailed {
		t.Fatalf("failed=%#v err=%v", failed, err)
	}
	retried, err := RetryInvocation(fixture.userID, invocationID)
	if err != nil || retried.Run.LatestAttempt != 2 || retried.Run.LatestRevision != 1 {
		t.Fatalf("retried=%#v err=%v", retried, err)
	}
	resumed, err := ContinueWorkflowExecution(fixture.userID, confirmed.Run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if resumed.Run.Status != model.WorkflowExecutionRunning || resumed.Run.WorkflowVersionID != confirmed.Run.WorkflowVersionID || resumed.Run.WorkflowContentHash != confirmed.Run.WorkflowContentHash || resumed.Nodes[0].InvocationID != invocationID || resumed.Nodes[0].Status != model.WorkflowNodeExecutionQueued {
		t.Fatalf("resumed=%#v", resumed)
	}
}

func TestCancelWorkflowExecutionPropagatesToInvocation(t *testing.T) {
	fixture := workflowExecutionFixture(t)
	preflight, err := PreflightWorkflowExecution(fixture.userID, fixture.request)
	if err != nil {
		t.Fatal(err)
	}
	confirmed, err := ConfirmWorkflowExecution(fixture.userID, preflight.Run.ID, WorkflowExecutionConfirmationInput{Revision: 1, Fingerprint: preflight.Run.ConfirmationFingerprint, RequirementCodes: preflight.ConfirmationRequirements})
	if err != nil {
		t.Fatal(err)
	}
	cancelled, err := CancelWorkflowExecution(fixture.userID, confirmed.Run.ID)
	if err != nil {
		t.Fatal(err)
	}
	invocation, ok, err := repository.GetUserInvocation(fixture.userID, confirmed.Nodes[0].InvocationID)
	if err != nil || !ok || invocation.Status != model.InvocationStatusCancelled || cancelled.Run.Status != model.WorkflowExecutionCancelled {
		t.Fatalf("invocation=%#v cancelled=%#v ok=%v err=%v", invocation, cancelled, ok, err)
	}
}

type workflowExecutionTestFixture struct {
	userID  string
	request WorkflowExecutionPreflightInput
}

func workflowExecutionFixture(t *testing.T) workflowExecutionTestFixture {
	t.Helper()
	setupInvocationServiceTest(t)
	firstSkill, _ := seedInvocationSkill(t, invocationSkillSeed{ID: "workflow-execution-first", VersionID: "workflow-execution-first-v1", Version: "1.0.0", Recommended: true})
	secondSkill, _ := seedInvocationSkill(t, invocationSkillSeed{ID: "workflow-execution-second", VersionID: "workflow-execution-second-v1", Version: "1.0.0", Recommended: true, Mutate: func(pkg *SkillPackage) {
		pkg.Manifest.Capabilities = []string{"asset.extract"}
		pkg.Manifest.InputArtifactTypes = []string{"production_script"}
		pkg.Manifest.OutputArtifactTypes = []string{"asset_catalog"}
		pkg.Manifest.SchemaCompatibility = map[string]string{"production_script": ">=1.0 <2.0"}
		pkg.InputContract.ArtifactInputs = []ArtifactInputSpec{{BindingName: "script", ArtifactType: "production_script", Required: true, RequiresApproval: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0"}}
		pkg.OutputContract.ArtifactOutputs = []ArtifactOutputSpec{{BindingName: "assets", ArtifactType: "asset_catalog", Min: 1, Max: 1, SchemaVersion: "1.0.0"}}
	}})
	root := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"公交站"}`)
	pkg := WorkflowPackage{InputArtifactTypes: []string{"source_text"}, Nodes: []WorkflowNodeSpec{
		{NodeKey: "script", Name: "剧本", ExecutorType: WorkflowExecutorSkill, SkillBinding: &WorkflowSkillBinding{Mode: WorkflowSkillBindingFixed, SkillID: firstSkill.ID}, InputBindings: []WorkflowNodeInputBinding{{BindingName: "source", ArtifactType: "source_text", Source: WorkflowInputSource, WorkflowInputName: "source"}}, OutputArtifactType: "production_script"},
		{NodeKey: "assets", Name: "资产", ExecutorType: WorkflowExecutorSkill, SkillBinding: &WorkflowSkillBinding{Mode: WorkflowSkillBindingFixed, SkillID: secondSkill.ID}, InputBindings: []WorkflowNodeInputBinding{{BindingName: "script", ArtifactType: "production_script", Source: WorkflowNodeSource, FromNodeKey: "script"}}, DependsOn: []string{"script"}, OutputArtifactType: "asset_catalog"},
	}}
	created, err := CreateProjectWorkflow("user-1", WorkflowCreateInput{ProjectID: "project-1", Name: "执行流程", Version: "1.0.0", Package: pkg})
	if err != nil {
		t.Fatal(err)
	}
	published, err := PublishWorkflowVersion("user-1", created.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	return workflowExecutionTestFixture{userID: "user-1", request: WorkflowExecutionPreflightInput{
		WorkflowVersionID: published.Version.ID, ProjectID: "project-1", EpisodeID: "episode-1",
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: root.Artifact.ID, ContentHash: root.Artifact.ContentHash}},
		IdempotencyKey:    "workflow-execution-test-key",
	}}
}

func workflowSingleNodeExecutionFixture(t *testing.T) workflowExecutionTestFixture {
	t.Helper()
	setupInvocationServiceTest(t)
	skill, _ := seedInvocationSkill(t, invocationSkillSeed{ID: "workflow-single", VersionID: "workflow-single-v1", Version: "1.0.0", Recommended: true})
	root := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"公交站"}`)
	created, err := CreateProjectWorkflow("user-1", WorkflowCreateInput{
		ProjectID: "project-1", Name: "单节点流程", Version: "1.0.0",
		Package: WorkflowPackage{InputArtifactTypes: []string{"source_text"}, Nodes: []WorkflowNodeSpec{{
			NodeKey: "script", Name: "剧本", ExecutorType: WorkflowExecutorSkill,
			SkillBinding:       &WorkflowSkillBinding{Mode: WorkflowSkillBindingFixed, SkillID: skill.ID},
			InputBindings:      []WorkflowNodeInputBinding{{BindingName: "source", ArtifactType: "source_text", Source: WorkflowInputSource, WorkflowInputName: "source"}},
			OutputArtifactType: "production_script", RetryPolicy: WorkflowRetryPolicy{MaxAttempts: 2},
		}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	published, err := PublishWorkflowVersion("user-1", created.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	return workflowExecutionTestFixture{userID: "user-1", request: WorkflowExecutionPreflightInput{
		WorkflowVersionID: published.Version.ID, ProjectID: "project-1", EpisodeID: "episode-1",
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: root.Artifact.ID, ContentHash: root.Artifact.ContentHash}},
		IdempotencyKey:    "workflow-single-execution",
	}}
}
