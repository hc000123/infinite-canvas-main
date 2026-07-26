package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/url"
	"path"
	"sort"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/cyberphone/json-canonicalization/go/src/webpki.org/jsoncanonicalizer"
)

var invocationSources = map[string]bool{"workflow": true, "image": true, "canvas_chat": true, "direct": true, "agent_plan": true}

type invocationPreflightBuild struct {
	request          InvocationRequest
	requestHash      string
	resolved         InvocationResolutionResult
	envelopes        []ArtifactEnvelope
	snapshots        []ArtifactRefSnapshot
	bindings         []ResolvedArtifactBinding
	policy           InvocationExecutionPolicy
	confirmations    []string
	blocks           []InvocationBlockReason
	skillJSON        string
	coreSchemaJSON   string
	skillSchemaJSON  string
	inputJSON        string
	parametersJSON   string
	policyJSON       string
	traceJSON        string
	confirmationJSON string
	blocksJSON       string
}

func PreflightInvocation(userID string, raw InvocationRequest) (InvocationPreflightSnapshot, error) {
	build, err := buildInvocationPreflight(userID, raw)
	if err != nil {
		return InvocationPreflightSnapshot{}, err
	}
	stamp := now()
	invocationID := newID("invocation")
	status := invocationPreflightStatus(build.blocks, build.confirmations)
	key := strings.TrimSpace(raw.IdempotencyKey)
	var keyPointer *string
	if key != "" {
		keyPointer = &key
	}
	run := model.InvocationRun{
		ID: invocationID, UserID: strings.TrimSpace(userID), Source: build.request.Source,
		ProjectID: build.request.ProjectID, EpisodeID: build.request.EpisodeID, IdempotencyKey: keyPointer,
		AgentPlanID: build.request.AgentPlanID, AgentPlanRevision: build.request.AgentPlanRevision,
		AgentPlanStepKey: build.request.AgentPlanStepKey, ConfirmationSource: build.request.ConfirmationSource,
		RequestHash: build.requestHash, Status: status, LatestRevision: 1, LatestAttempt: 0,
		CreatedAt: stamp, UpdatedAt: stamp,
	}
	revision := invocationRevisionFromBuild(run, 1, build, stamp)
	refs := invocationInputRefs(run, revision.Revision, build.snapshots, stamp)
	event := invocationPreflightEvent(run, revision.Revision, status, build.blocksJSON, stamp)
	createdRun, created, err := repository.CreateInvocationAggregateIdempotently(run, revision, refs, event)
	if err != nil {
		return InvocationPreflightSnapshot{}, err
	}
	if !created {
		return loadInvocationPreflightSnapshot(createdRun.UserID, createdRun)
	}
	return snapshotFromInvocationBuild(run, revision, refs, build), nil
}

func RepreflightInvocation(userID, invocationID string, raw InvocationRequest) (InvocationPreflightSnapshot, error) {
	run, ok, err := repository.GetUserInvocation(strings.TrimSpace(userID), strings.TrimSpace(invocationID))
	if err != nil {
		return InvocationPreflightSnapshot{}, err
	}
	if !ok {
		return InvocationPreflightSnapshot{}, repository.ErrInvocationNotFound
	}
	allowedFrom := model.InvocationStatusBlocked
	if run.Status == model.InvocationStatusFailed {
		attempts, listErr := repository.ListInvocationAttempts(run.UserID, run.ID)
		if listErr != nil {
			return InvocationPreflightSnapshot{}, listErr
		}
		allowed := false
		for _, attempt := range attempts {
			if attempt.Attempt == run.LatestAttempt && attempt.ErrorClass == "execution_target_unavailable" {
				allowed = true
			}
		}
		if !allowed {
			return InvocationPreflightSnapshot{}, repository.ErrInvocationTransitionConflict
		}
		allowedFrom = model.InvocationStatusFailed
	} else if run.Status != model.InvocationStatusBlocked {
		return InvocationPreflightSnapshot{}, repository.ErrInvocationTransitionConflict
	}
	if strings.TrimSpace(raw.ProjectID) == "" {
		raw.ProjectID = run.ProjectID
	}
	if strings.TrimSpace(raw.EpisodeID) == "" {
		raw.EpisodeID = run.EpisodeID
	}
	normalizedSource := strings.ToLower(strings.TrimSpace(raw.Source))
	if normalizedSource == "" {
		raw.Source = run.Source
	} else {
		raw.Source = normalizedSource
	}
	if strings.TrimSpace(raw.ProjectID) != run.ProjectID || strings.TrimSpace(raw.EpisodeID) != run.EpisodeID || strings.TrimSpace(raw.Source) != run.Source {
		return InvocationPreflightSnapshot{}, errors.New("重新预检不能改变 Invocation 坐标")
	}
	raw.IdempotencyKey = ""
	build, err := buildInvocationPreflight(userID, raw)
	if err != nil {
		return InvocationPreflightSnapshot{}, err
	}
	if invocationRepreflightCoordinatesCompatible(run, build) {
		if run.ProjectID == "" {
			run.ProjectID = build.request.ProjectID
		}
		if run.EpisodeID == "" {
			run.EpisodeID = build.request.EpisodeID
		}
	}
	stamp := now()
	run.RequestHash = build.requestHash
	run.Status = invocationPreflightStatus(build.blocks, build.confirmations)
	run.LatestRevision++
	run.UpdatedAt = stamp
	revision := invocationRevisionFromBuild(run, run.LatestRevision, build, stamp)
	refs := invocationInputRefs(run, revision.Revision, build.snapshots, stamp)
	event := invocationPreflightEvent(run, revision.Revision, run.Status, build.blocksJSON, stamp)
	if err := repository.AppendInvocationPreflightRevision(run, revision, refs, event, allowedFrom); err != nil {
		return InvocationPreflightSnapshot{}, err
	}
	return snapshotFromInvocationBuild(run, revision, refs, build), nil
}

func buildInvocationPreflight(userID string, raw InvocationRequest) (invocationPreflightBuild, error) {
	request, requestHash, parametersJSON, err := normalizeInvocationRequest(raw)
	if err != nil {
		return invocationPreflightBuild{}, err
	}
	envelopes, snapshots, err := ResolveArtifactRefs(userID, request.InputArtifactRefs)
	if err != nil {
		return invocationPreflightBuild{}, err
	}
	request, err = invocationRequestWithArtifactCoordinates(request, envelopes)
	if err != nil {
		return invocationPreflightBuild{}, err
	}
	requestHash, err = hashInvocationRequest(request)
	if err != nil {
		return invocationPreflightBuild{}, err
	}
	bindings := make([]ResolvedArtifactBinding, len(envelopes))
	for index := range envelopes {
		bindings[index] = ResolvedArtifactBinding{BindingName: snapshots[index].BindingName, Artifact: envelopes[index], Snapshot: snapshots[index]}
		bindings[index].Approved, err = invocationArtifactApproved(userID, envelopes[index].Artifact)
		if err != nil {
			return invocationPreflightBuild{}, err
		}
	}
	resolved, err := ResolveInvocationSkill(userID, InvocationResolutionInput{
		ProjectID: request.ProjectID, EpisodeID: request.EpisodeID, SkillID: request.SkillID,
		SkillVersionID: request.SkillVersionID, SkillVersionConstraint: request.SkillVersionConstraint,
		Capability: request.Capability, ExpectedOutputArtifactType: request.ExpectedOutputArtifactType,
		Inputs: bindings, ProjectTags: request.ProjectTags,
	})
	if err != nil {
		return invocationPreflightBuild{}, err
	}
	build := invocationPreflightBuild{request: request, requestHash: requestHash, resolved: resolved, envelopes: envelopes, snapshots: snapshots, bindings: bindings, parametersJSON: parametersJSON, blocks: []InvocationBlockReason{}, confirmations: []string{}}
	build.blocks = append(build.blocks, invocationResolutionBlocks(resolved.Trace)...)
	if resolved.Trace.FinalSkillVersionID != "" {
		build.blocks = append(build.blocks, invocationPackageBlocks(resolved.Resolved.Package, bindings)...)
		build.confirmations = invocationConfirmationCodes(resolved.Resolved.Package.Manifest, resolved.Resolved.Package.OutputContract.ArtifactOutputs, bindings)
		build.policy, err = resolveInvocationExecutionPolicy(request, resolved.Resolved.Package, len(build.confirmations) > 0)
		if err != nil {
			build.blocks = appendInvocationBlock(build.blocks, "execution_target_unavailable", err.Error())
		}
		resolved.Trace.SelectedModel = build.policy.Model
		resolved.Trace.SelectedChannelID = build.policy.ChannelID
		build.resolved.Trace = resolved.Trace
		if err := build.freezeSchemas(); err != nil {
			return invocationPreflightBuild{}, err
		}
	} else {
		build.policy = InvocationExecutionPolicy{FallbackAllowed: false}
		if resolved.Facts != nil {
			build.confirmations = invocationConfirmationCodes(resolved.Facts.Manifest, resolved.Facts.Outputs, bindings)
		}
		build.skillJSON = "{}"
		build.coreSchemaJSON, _ = marshalInvocationJSON(map[string]any{"inputs": snapshots, "outputs": []any{}})
		build.skillSchemaJSON = "{}"
	}
	build.inputJSON, _ = marshalInvocationJSON(bindings)
	build.policyJSON, _ = marshalInvocationJSON(build.policy)
	build.traceJSON, _ = marshalInvocationJSON(build.resolved.Trace)
	build.confirmationJSON, _ = marshalInvocationJSON(build.confirmations)
	build.blocksJSON, _ = marshalInvocationJSON(build.blocks)
	return build, nil
}

func (build *invocationPreflightBuild) freezeSchemas() error {
	resolved := build.resolved.Resolved
	skillSnapshot := map[string]any{"skill": resolved.Skill, "version": resolved.Version, "package": resolved.Package}
	build.skillJSON, _ = marshalInvocationJSON(skillSnapshot)
	outputs := []any{}
	for _, spec := range resolved.Package.OutputContract.ArtifactOutputs {
		schema, err := ResolveArtifactSchema(spec.ArtifactType, spec.SchemaVersion)
		if err != nil {
			return err
		}
		outputs = append(outputs, map[string]any{"spec": spec, "schema": schema})
	}
	build.coreSchemaJSON, _ = marshalInvocationJSON(map[string]any{"inputs": build.snapshots, "outputs": outputs})
	raw, _, err := canonicalJSONObject(resolved.Package.OutputContract.Schema)
	if err != nil {
		return err
	}
	hash := sha256.Sum256(raw)
	build.skillSchemaJSON, _ = marshalInvocationJSON(map[string]any{"schemaVersion": resolved.Package.OutputContract.SchemaVersion, "schema": resolved.Package.OutputContract.Schema, "contentHash": "sha256:" + hex.EncodeToString(hash[:])})
	return nil
}

func normalizeInvocationRequest(raw InvocationRequest) (InvocationRequest, string, string, error) {
	request := raw
	request.Source = strings.ToLower(strings.TrimSpace(request.Source))
	if !invocationSources[request.Source] {
		return request, "", "", errors.New("Invocation source 无效")
	}
	request.ProjectID = strings.TrimSpace(request.ProjectID)
	request.EpisodeID = strings.TrimSpace(request.EpisodeID)
	request.SkillID = strings.TrimSpace(request.SkillID)
	request.SkillVersionID = strings.TrimSpace(request.SkillVersionID)
	request.SkillVersionConstraint = strings.Join(strings.Fields(request.SkillVersionConstraint), " ")
	request.Capability = strings.ToLower(strings.TrimSpace(request.Capability))
	request.ExpectedOutputArtifactType = strings.ToLower(strings.TrimSpace(request.ExpectedOutputArtifactType))
	request.ProjectTags = normalizedStringSet(request.ProjectTags, true)
	request.ExecutionPolicyOverride.Model = strings.TrimSpace(request.ExecutionPolicyOverride.Model)
	request.ExecutionPolicyOverride.ChannelID = strings.TrimSpace(request.ExecutionPolicyOverride.ChannelID)
	request.AgentPlanID = strings.TrimSpace(request.AgentPlanID)
	request.AgentPlanStepKey = strings.ToLower(strings.TrimSpace(request.AgentPlanStepKey))
	request.ConfirmationSource = strings.ToLower(strings.TrimSpace(request.ConfirmationSource))
	request.InputArtifactRefs = append([]ArtifactRefInput(nil), raw.InputArtifactRefs...)
	for index := range request.InputArtifactRefs {
		request.InputArtifactRefs[index] = normalizeArtifactRef(request.InputArtifactRefs[index])
		request.InputArtifactRefs[index].BindingName = strings.ToLower(request.InputArtifactRefs[index].BindingName)
	}
	sort.SliceStable(request.InputArtifactRefs, func(i, j int) bool {
		return request.InputArtifactRefs[i].BindingName < request.InputArtifactRefs[j].BindingName
	})
	parametersJSON, err := canonicalInvocationParameters(request.Parameters)
	if err != nil {
		return request, "", "", err
	}
	request.Parameters = json.RawMessage(parametersJSON)
	request.IdempotencyKey = ""
	// Binding groups are set-like, while stable sorting preserves the ordinal
	// within each repeated binding.
	requestHash, err := hashInvocationRequest(request)
	return request, requestHash, parametersJSON, err
}

func invocationRequestWithArtifactCoordinates(request InvocationRequest, envelopes []ArtifactEnvelope) (InvocationRequest, error) {
	if len(envelopes) == 0 {
		return request, nil
	}
	projectID, episodeID := envelopes[0].Artifact.ProjectID, envelopes[0].Artifact.EpisodeID
	for _, envelope := range envelopes[1:] {
		if envelope.Artifact.ProjectID != projectID || envelope.Artifact.EpisodeID != episodeID {
			return request, errors.New("Artifact 输入坐标不一致")
		}
	}
	if request.ProjectID == "" {
		request.ProjectID = projectID
	}
	if request.EpisodeID == "" {
		request.EpisodeID = episodeID
	}
	return request, nil
}

func invocationRepreflightCoordinatesCompatible(run model.InvocationRun, build invocationPreflightBuild) bool {
	for _, envelope := range build.envelopes {
		if (run.ProjectID != "" && envelope.Artifact.ProjectID != run.ProjectID) || (run.EpisodeID != "" && envelope.Artifact.EpisodeID != run.EpisodeID) {
			return false
		}
	}
	for _, block := range build.blocks {
		if block.Code == "input_project_mismatch" || block.Code == "input_episode_mismatch" {
			return false
		}
	}
	return true
}

func hashInvocationRequest(request InvocationRequest) (string, error) {
	canonical, err := marshalInvocationCanonical(request)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256(canonical)
	return "sha256:" + hex.EncodeToString(hash[:]), nil
}

func canonicalInvocationParameters(raw json.RawMessage) (string, error) {
	if len(strings.TrimSpace(string(raw))) == 0 {
		return "null", nil
	}
	value, err := decodeCanonicalJSON(raw)
	if err != nil {
		return "", errors.New("Parameters 必须是有效 JSON")
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	canonical, err := jsoncanonicalizer.Transform(encoded)
	return string(canonical), err
}

func marshalInvocationCanonical(value any) ([]byte, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return jsoncanonicalizer.Transform(raw)
}

func invocationResolutionBlocks(trace InvocationRouteTrace) []InvocationBlockReason {
	if trace.FinalSkillVersionID != "" {
		return []InvocationBlockReason{}
	}
	result := []InvocationBlockReason{}
	for _, candidate := range trace.Candidates {
		for _, reason := range candidate.Reasons {
			code := reason
			switch reason {
			case "unsupported_executor":
				code = "executor_unavailable"
			case "unsupported_side_effect":
				code = "side_effect_unavailable"
			}
			result = appendInvocationBlock(result, code, reason)
		}
	}
	if len(result) == 0 {
		result = appendInvocationBlock(result, "skill_unavailable", "没有兼容的 Skill")
	}
	return result
}

func invocationPackageBlocks(pkg SkillPackage, bindings []ResolvedArtifactBinding) []InvocationBlockReason {
	result := []InvocationBlockReason{}
	if pkg.Manifest.ExecutorKind != "text_model" {
		result = appendInvocationBlock(result, "executor_unavailable", "Phase 2 仅支持 text_model")
	}
	if len(pkg.Manifest.RequiredTools) > 0 {
		result = appendInvocationBlock(result, "tool_unavailable", "Phase 2 不支持外部工具")
	}
	for _, effect := range pkg.Manifest.SideEffects {
		if effect != "none" && effect != "read" {
			result = appendInvocationBlock(result, "side_effect_unavailable", "Phase 2 不支持该副作用")
		}
	}
	images, invalidImage := 0, false
	for _, binding := range bindings {
		if binding.Artifact.Artifact.ArtifactType != "asset_rendition" || binding.Artifact.Payload["mediaType"] != "image" {
			continue
		}
		mimeType := invocationImageMIME(binding.Artifact.Payload["mediaRef"])
		if mimeType == "" || !containsInvocationString(pkg.InputContract.ImagePolicy.AllowedTypes, mimeType) {
			invalidImage = true
			continue
		}
		images++
	}
	if invalidImage || (pkg.InputContract.ImagePolicy.Required && images < pkg.InputContract.ImagePolicy.Min) || images > pkg.InputContract.ImagePolicy.Max {
		result = appendInvocationBlock(result, "image_policy", "图片输入不符合 Skill 策略")
	}
	return result
}

func invocationImageMIME(raw any) string {
	mediaRef, ok := raw.(string)
	if !ok {
		return ""
	}
	mediaRef = strings.TrimSpace(mediaRef)
	if strings.HasPrefix(strings.ToLower(mediaRef), "data:") {
		value := mediaRef[len("data:"):]
		if index := strings.IndexAny(value, ";,"); index >= 0 {
			return strings.ToLower(strings.TrimSpace(value[:index]))
		}
		return ""
	}
	parsed, err := url.Parse(mediaRef)
	if err != nil {
		return ""
	}
	switch strings.ToLower(path.Ext(parsed.Path)) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	default:
		return ""
	}
}

func invocationConfirmationCodes(manifest SkillManifest, outputs []ArtifactOutputSpec, bindings []ResolvedArtifactBinding) []string {
	_ = bindings // Input media never implies generation.
	set := map[string]bool{"api_cost": manifest.ExecutorKind == "text_model"}
	switch manifest.ExecutorKind {
	case "image_model":
		set["image_generation"] = true
	case "video_model":
		set["video_generation"] = true
	}
	for _, effect := range manifest.SideEffects {
		switch effect {
		case "image_generation":
			set["image_generation"] = true
		case "video_generation":
			set["video_generation"] = true
		case "batch":
			set["batch"] = true
		case "external_tool":
			set["external_tool"] = true
		case "write":
			set["business_write"] = true
		}
	}
	for _, tool := range manifest.RequiredTools {
		if tool != "" {
			set["external_tool"] = true
		}
	}
	for _, output := range outputs {
		if output.Max > 1 {
			set["batch"] = true
		}
	}
	order := []string{"api_cost", "image_generation", "video_generation", "batch", "external_tool", "business_write"}
	result := []string{}
	for _, code := range order {
		if set[code] {
			result = append(result, code)
		}
	}
	return result
}

func resolveInvocationExecutionPolicy(request InvocationRequest, pkg SkillPackage, requiresConfirmation bool) (InvocationExecutionPolicy, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return InvocationExecutionPolicy{}, err
	}
	settings = normalizeSettings(settings)
	modelName := request.ExecutionPolicyOverride.Model
	if modelName == "" {
		modelName = settings.Public.ModelChannel.DefaultTextModel
	}
	if modelName == "" {
		modelName = settings.Public.ModelChannel.DefaultModel
	}
	if modelName == "" {
		return InvocationExecutionPolicy{ExecutorKind: pkg.Manifest.ExecutorKind, FallbackAllowed: false}, errors.New("没有可用文本模型")
	}
	channels := modelChannelsForModel(settings.Private.Channels, modelName)
	textChannels := channels[:0]
	for _, channel := range channels {
		if modelChannelSupportsCapability(channel, "text") {
			textChannels = append(textChannels, channel)
		}
	}
	channels = textChannels
	if channelID := request.ExecutionPolicyOverride.ChannelID; channelID != "" {
		filtered := channels[:0]
		for _, channel := range channels {
			if normalizeModelChannel(channel).ID == channelID {
				filtered = append(filtered, channel)
			}
		}
		channels = filtered
	}
	if len(channels) == 0 {
		return InvocationExecutionPolicy{ExecutorKind: pkg.Manifest.ExecutorKind, Model: modelName, FallbackAllowed: false}, errors.New("指定执行渠道不可用")
	}
	sort.Slice(channels, func(i, j int) bool {
		return normalizeModelChannel(channels[i]).ID < normalizeModelChannel(channels[j]).ID
	})
	channel := normalizeModelChannel(channels[0])
	timeout, attempts := request.ExecutionPolicyOverride.TimeoutSeconds, request.ExecutionPolicyOverride.MaxAttempts
	if timeout <= 0 {
		timeout = 120
	}
	timeout = normalizeAgentRunTimeout(timeout)
	if attempts <= 0 {
		attempts = 1
	}
	credits := 0
	for _, cost := range settings.Public.ModelChannel.ModelCosts {
		if cost.Model == modelName {
			credits = cost.Credits
		}
	}
	if credits < 0 {
		credits = 0
	}
	return InvocationExecutionPolicy{
		ExecutorKind: pkg.Manifest.ExecutorKind, AgentExecutor: AgentRunExecutorAPI, Model: modelName, ChannelID: channel.ID,
		FallbackAllowed: false, RequiresConfirmation: requiresConfirmation,
		Credits: credits, EstimatedCredits: credits, TimeoutSeconds: timeout, ConcurrencyLimit: normalizeAgentRunConcurrency(0), AllowBatch: false,
		MaxAttempts: attempts, WritePolicy: "preview_only", RequiresConfirm: true,
	}, nil
}

func invocationArtifactApproved(userID string, artifact model.Artifact) (bool, error) {
	if artifact.ArtifactType == "source_text" && artifact.ProducerInvocationID == nil {
		return true, nil
	}
	if artifact.ProducerInvocationID == nil {
		return false, nil
	}
	run, found, err := repository.GetUserInvocation(userID, *artifact.ProducerInvocationID)
	if err != nil {
		return false, err
	}
	if !found || (run.Status != model.InvocationStatusApproved && run.Status != model.InvocationStatusApplied) || run.ReviewedAttempt < 1 || strings.TrimSpace(run.ReviewedArtifactSetHash) == "" {
		return false, nil
	}
	refs, err := repository.ListInvocationArtifactRefs(userID, *artifact.ProducerInvocationID)
	if err != nil {
		return false, err
	}
	authoritative := false
	for _, ref := range refs {
		if ref.Direction == "output" && ref.Attempt == run.ReviewedAttempt && ref.ArtifactID == artifact.ID && ref.ArtifactHash == artifact.ContentHash && ref.ArtifactType == artifact.ArtifactType && ref.SchemaVersion == artifact.SchemaVersion && ref.SchemaContentHash == artifact.SchemaContentHash {
			authoritative = true
			break
		}
	}
	if !authoritative {
		return false, nil
	}
	setHash := invocationArtifactSetHash(refs, run.ReviewedAttempt)
	if setHash != run.ReviewedArtifactSetHash {
		return false, nil
	}
	reviews, err := repository.ListInvocationReviews(userID, *artifact.ProducerInvocationID)
	if err != nil {
		return false, err
	}
	for _, review := range reviews {
		if review.Decision == "approved" && review.Attempt == run.ReviewedAttempt && review.ArtifactSetHash == setHash {
			return true, nil
		}
	}
	return false, nil
}

func invocationArtifactSetHash(refs []model.InvocationArtifactRef, attempt int) string {
	values := []map[string]any{}
	for _, ref := range refs {
		if ref.Direction == "output" && ref.Attempt == attempt {
			values = append(values, map[string]any{"bindingName": ref.BindingName, "ordinal": ref.Ordinal, "artifactId": ref.ArtifactID, "artifactHash": ref.ArtifactHash})
		}
	}
	sort.Slice(values, func(i, j int) bool {
		left, right := values[i]["bindingName"].(string), values[j]["bindingName"].(string)
		if left != right {
			return left < right
		}
		return values[i]["ordinal"].(int) < values[j]["ordinal"].(int)
	})
	raw, _ := marshalInvocationCanonical(values)
	hash := sha256.Sum256(raw)
	return "sha256:" + hex.EncodeToString(hash[:])
}

func invocationPreflightStatus(blocks []InvocationBlockReason, confirmations []string) model.InvocationStatus {
	if len(blocks) > 0 {
		return model.InvocationStatusBlocked
	}
	if len(confirmations) > 0 {
		return model.InvocationStatusAwaitingConfirmation
	}
	return model.InvocationStatusPlanned
}

func invocationRevisionFromBuild(run model.InvocationRun, revisionNumber int, build invocationPreflightBuild, stamp string) model.InvocationPreflightRevision {
	resolved := build.resolved.Resolved
	return model.InvocationPreflightRevision{
		ID: newID("invocationrevision"), UserID: run.UserID, InvocationID: run.ID, Revision: revisionNumber, RequestHash: build.requestHash,
		SkillID: resolved.Skill.ID, SkillVersionID: resolved.Version.ID, SkillVersion: resolved.Version.Version, SkillContentHash: resolved.Version.ContentHash,
		SkillSnapshotJSON: build.skillJSON, CoreSchemaSnapshotJSON: build.coreSchemaJSON, SkillSchemaSnapshotJSON: build.skillSchemaJSON,
		InputSnapshotJSON: build.inputJSON, ParametersJSON: build.parametersJSON, ExecutionPolicyJSON: build.policyJSON,
		RouteTraceJSON: build.traceJSON, ConfirmationRequirementsJSON: build.confirmationJSON, BlockReasonsJSON: build.blocksJSON, CreatedAt: stamp,
	}
}

func invocationInputRefs(run model.InvocationRun, revision int, snapshots []ArtifactRefSnapshot, stamp string) []model.InvocationArtifactRef {
	refs := make([]model.InvocationArtifactRef, 0, len(snapshots))
	ordinals := map[string]int{}
	for _, snapshot := range snapshots {
		ordinal := ordinals[snapshot.BindingName]
		ordinals[snapshot.BindingName]++
		refs = append(refs, model.InvocationArtifactRef{ID: newID("invocationref"), UserID: run.UserID, InvocationID: run.ID, Direction: "input", BindingName: snapshot.BindingName, ArtifactID: snapshot.ArtifactID, ArtifactHash: snapshot.ArtifactHash, ArtifactType: snapshot.ArtifactType, SchemaVersion: snapshot.SchemaVersion, SchemaContentHash: snapshot.SchemaContentHash, Revision: revision, Attempt: 0, Ordinal: ordinal, CreatedAt: stamp})
	}
	return refs
}

func invocationPreflightEvent(run model.InvocationRun, revision int, status model.InvocationStatus, blocksJSON, stamp string) model.InvocationEvent {
	data, _ := marshalInvocationJSON(map[string]any{"status": status, "blockReasons": json.RawMessage(blocksJSON)})
	return model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: "preflight.completed", Level: "info", DataJSON: data, Revision: revision, Attempt: 0, CreatedAt: stamp}
}

func snapshotFromInvocationBuild(run model.InvocationRun, revision model.InvocationPreflightRevision, refs []model.InvocationArtifactRef, build invocationPreflightBuild) InvocationPreflightSnapshot {
	return InvocationPreflightSnapshot{Run: run, Revision: revision, InputArtifactRefs: refs, ExecutionPolicy: build.policy, RouteTrace: build.resolved.Trace, ConfirmationRequirements: build.confirmations, BlockReasons: build.blocks}
}

func loadInvocationPreflightSnapshot(userID string, run model.InvocationRun) (InvocationPreflightSnapshot, error) {
	revisions, err := repository.ListInvocationPreflightRevisions(userID, run.ID)
	if err != nil {
		return InvocationPreflightSnapshot{}, err
	}
	refs, err := repository.ListInvocationArtifactRefs(userID, run.ID)
	if err != nil {
		return InvocationPreflightSnapshot{}, err
	}
	var revision model.InvocationPreflightRevision
	for _, item := range revisions {
		if item.Revision == run.LatestRevision {
			revision = item
		}
	}
	latestRefs := []model.InvocationArtifactRef{}
	for _, ref := range refs {
		if ref.Revision == run.LatestRevision && ref.Attempt == 0 && ref.Direction == "input" {
			latestRefs = append(latestRefs, ref)
		}
	}
	var policy InvocationExecutionPolicy
	var trace InvocationRouteTrace
	var confirmations []string
	var blocks []InvocationBlockReason
	_ = json.Unmarshal([]byte(revision.ExecutionPolicyJSON), &policy)
	_ = json.Unmarshal([]byte(revision.RouteTraceJSON), &trace)
	_ = json.Unmarshal([]byte(revision.ConfirmationRequirementsJSON), &confirmations)
	_ = json.Unmarshal([]byte(revision.BlockReasonsJSON), &blocks)
	return InvocationPreflightSnapshot{Run: run, Revision: revision, InputArtifactRefs: latestRefs, ExecutionPolicy: policy, RouteTrace: trace, ConfirmationRequirements: confirmations, BlockReasons: blocks}, nil
}

func appendInvocationBlock(values []InvocationBlockReason, code, message string) []InvocationBlockReason {
	for _, value := range values {
		if value.Code == code {
			return values
		}
	}
	return append(values, InvocationBlockReason{Code: code, Message: message})
}

func marshalInvocationJSON(value any) (string, error) {
	raw, err := json.Marshal(value)
	return string(raw), err
}
