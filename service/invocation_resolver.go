package service

import (
	"encoding/json"
	"errors"
	"sort"
	"strings"

	"github.com/Masterminds/semver/v3"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type InvocationResolutionInput struct {
	ProjectID                  string                    `json:"projectId"`
	EpisodeID                  string                    `json:"episodeId"`
	SkillVersionID             string                    `json:"skillVersionId"`
	SkillID                    string                    `json:"skillId"`
	Capability                 string                    `json:"capability"`
	SkillVersionConstraint     string                    `json:"skillVersionConstraint"`
	ExpectedOutputArtifactType string                    `json:"expectedOutputArtifactType"`
	Inputs                     []ResolvedArtifactBinding `json:"inputs"`
	ProjectTags                []string                  `json:"projectTags"`
	AllowedCostClasses         []string                  `json:"allowedCostClasses"`
	AllowedSideEffects         []string                  `json:"allowedSideEffects"`
	AllowedExecutors           []string                  `json:"allowedExecutors"`
}

type ResolvedArtifactBinding struct {
	BindingName string              `json:"bindingName"`
	Artifact    ArtifactEnvelope    `json:"artifact"`
	Snapshot    ArtifactRefSnapshot `json:"snapshot"`
	Approved    bool                `json:"approved"`
}

type InvocationResolutionResult struct {
	Resolved ResolvedSkill              `json:"resolved"`
	Trace    InvocationRouteTrace       `json:"trace"`
	Facts    *InvocationResolutionFacts `json:"-"`
}

type InvocationResolutionFacts struct {
	SkillID        string
	SkillVersionID string
	Manifest       SkillManifest
	Outputs        []ArtifactOutputSpec
}

type invocationCandidate struct {
	skill                   model.SkillDefinition
	version                 model.SkillVersion
	manifest                SkillManifest
	input                   SkillInputContract
	output                  SkillOutputContract
	trace                   InvocationRouteCandidate
	semver                  *semver.Version
	invalidManifest         bool
	invalidContract         bool
	invalidArtifactContract bool
}

func ResolveInvocationSkill(userID string, raw InvocationResolutionInput) (InvocationResolutionResult, error) {
	input := normalizeInvocationResolutionInput(raw)
	if selectorCount(input) != 1 {
		return InvocationResolutionResult{}, errors.New("Skill selector 必须且只能指定一个")
	}
	trace := InvocationRouteTrace{Capability: input.Capability, Candidates: []InvocationRouteCandidate{}}
	candidates, err := loadInvocationCandidates(input)
	if err != nil {
		return InvocationResolutionResult{}, err
	}
	for index := range candidates {
		evaluateInvocationCandidate(userID, input, &candidates[index])
	}
	applyInvocationSelectorRules(input, candidates)
	sortInvocationCandidates(input, candidates)
	var facts *InvocationResolutionFacts
	if input.SkillVersionID != "" {
		for index := range candidates {
			if candidates[index].version.ID == input.SkillVersionID && !candidates[index].invalidManifest {
				facts = invocationCandidateFacts(candidates[index])
				break
			}
		}
	}
	var resolved ResolvedSkill
	for index := range candidates {
		candidate := &candidates[index]
		if !candidate.trace.Accepted {
			continue
		}
		packageValue, decodeErr := DecodeSkillPackage(candidate.version)
		if decodeErr != nil {
			reason := "package_invalid"
			if strings.Contains(decodeErr.Error(), "哈希") {
				reason = "content_hash_mismatch"
			}
			rejectInvocationCandidate(candidate, reason)
			continue
		}
		packageValue, validateErr := ValidateInvocableSkillPackage(packageValue)
		if validateErr != nil {
			rejectInvocationCandidate(candidate, "package_invalid")
			continue
		}
		if validateErr = ValidateSkillArtifactContracts(packageValue); validateErr != nil {
			if !isInvocationDataError(validateErr) {
				return InvocationResolutionResult{}, validateErr
			}
			rejectInvocationCandidate(candidate, "artifact_contract_invalid")
			continue
		}
		resolved = ResolvedSkill{Skill: candidate.skill, Version: candidate.version, Package: packageValue}
		facts = &InvocationResolutionFacts{SkillID: candidate.skill.ID, SkillVersionID: candidate.version.ID, Manifest: packageValue.Manifest, Outputs: packageValue.OutputContract.ArtifactOutputs}
		trace.FinalSkillVersionID = candidate.version.ID
		break
	}
	sortInvocationCandidates(input, candidates)
	for _, candidate := range candidates {
		trace.Candidates = append(trace.Candidates, candidate.trace)
	}
	return InvocationResolutionResult{Resolved: resolved, Trace: trace, Facts: facts}, nil
}

func invocationCandidateFacts(candidate invocationCandidate) *InvocationResolutionFacts {
	return &InvocationResolutionFacts{SkillID: candidate.skill.ID, SkillVersionID: candidate.version.ID, Manifest: candidate.manifest, Outputs: append([]ArtifactOutputSpec(nil), candidate.output.ArtifactOutputs...)}
}

func normalizeInvocationResolutionInput(input InvocationResolutionInput) InvocationResolutionInput {
	input.ProjectID = strings.TrimSpace(input.ProjectID)
	input.EpisodeID = strings.TrimSpace(input.EpisodeID)
	input.SkillVersionID = strings.TrimSpace(input.SkillVersionID)
	input.SkillID = strings.TrimSpace(input.SkillID)
	input.Capability = strings.ToLower(strings.TrimSpace(input.Capability))
	input.SkillVersionConstraint = strings.Join(strings.Fields(input.SkillVersionConstraint), " ")
	input.ExpectedOutputArtifactType = strings.ToLower(strings.TrimSpace(input.ExpectedOutputArtifactType))
	input.ProjectTags = normalizedStringSet(input.ProjectTags, true)
	input.AllowedCostClasses = normalizedStringSet(input.AllowedCostClasses, true)
	input.AllowedSideEffects = normalizedStringSet(input.AllowedSideEffects, true)
	input.AllowedExecutors = normalizedStringSet(input.AllowedExecutors, true)
	for index := range input.Inputs {
		input.Inputs[index].BindingName = strings.ToLower(strings.TrimSpace(input.Inputs[index].BindingName))
	}
	return input
}

func selectorCount(input InvocationResolutionInput) int {
	count := 0
	for _, value := range []string{input.SkillVersionID, input.SkillID, input.Capability} {
		if value != "" {
			count++
		}
	}
	return count
}

func loadInvocationCandidates(input InvocationResolutionInput) ([]invocationCandidate, error) {
	var definitions []model.SkillDefinition
	if input.SkillVersionID != "" {
		skill, version, ok, err := repository.GetSkillWithVersion(input.SkillVersionID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return []invocationCandidate{}, nil
		}
		definitions = []model.SkillDefinition{skill}
		versions, err := repository.ListSkillVersions(skill.ID)
		if err != nil {
			return nil, err
		}
		return decodeInvocationCandidateRows(definitions, map[string][]model.SkillVersion{skill.ID: appendMissingVersion(versions, version)})
	}
	if input.SkillID != "" {
		skill, ok, err := repository.GetSkillDefinition(input.SkillID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return []invocationCandidate{}, nil
		}
		definitions = []model.SkillDefinition{skill}
	} else {
		var err error
		definitions, err = repository.ListSkillDefinitions()
		if err != nil {
			return nil, err
		}
	}
	bySkill := make(map[string][]model.SkillVersion, len(definitions))
	for _, skill := range definitions {
		versions, err := repository.ListSkillVersions(skill.ID)
		if err != nil {
			return nil, err
		}
		bySkill[skill.ID] = versions
	}
	return decodeInvocationCandidateRows(definitions, bySkill)
}

func appendMissingVersion(versions []model.SkillVersion, exact model.SkillVersion) []model.SkillVersion {
	for _, version := range versions {
		if version.ID == exact.ID {
			return versions
		}
	}
	return append(versions, exact)
}

func decodeInvocationCandidateRows(definitions []model.SkillDefinition, versions map[string][]model.SkillVersion) ([]invocationCandidate, error) {
	result := []invocationCandidate{}
	for _, skill := range definitions {
		for _, version := range versions[skill.ID] {
			manifest, err := DecodeSkillManifest(version)
			candidate := invocationCandidate{skill: skill, version: version, manifest: manifest, trace: InvocationRouteCandidate{SkillID: skill.ID, SkillVersionID: version.ID, Reasons: []string{}}}
			candidate.semver, _ = semver.StrictNewVersion(version.Version)
			if err != nil {
				candidate.invalidManifest = true
				result = append(result, candidate)
				continue
			}
			if json.Unmarshal([]byte(version.InputContractJSON), &candidate.input) != nil || json.Unmarshal([]byte(version.OutputContractJSON), &candidate.output) != nil {
				candidate.invalidContract = true
			} else {
				candidate.input, err = normalizeSkillInputContract(candidate.input)
				if err == nil {
					candidate.output, err = normalizeSkillOutputContract(candidate.output)
				}
				candidate.invalidContract = err != nil
				if err == nil && len(candidate.input.ArtifactInputs) > 0 && len(candidate.output.ArtifactOutputs) > 0 {
					contractErr := ValidateSkillArtifactContracts(SkillPackage{Manifest: candidate.manifest, InputContract: candidate.input, OutputContract: candidate.output})
					if contractErr != nil && !isInvocationDataError(contractErr) {
						return nil, contractErr
					}
					candidate.invalidArtifactContract = contractErr != nil
				}
			}
			result = append(result, candidate)
		}
	}
	return result, nil
}

func isInvocationDataError(err error) bool {
	var safe interface{ SafeMessage() string }
	return errors.As(err, &safe)
}

func evaluateInvocationCandidate(userID string, input InvocationResolutionInput, candidate *invocationCandidate) {
	add := func(condition bool, reason string) {
		if condition && !containsInvocationString(candidate.trace.Reasons, reason) {
			candidate.trace.Reasons = append(candidate.trace.Reasons, reason)
		}
	}
	add(!candidate.skill.Enabled, "disabled_definition")
	add(candidate.version.Status != model.SkillVersionPublished, "unpublished_version")
	add(!skillVisibleTo(candidate.skill, userID, input.ProjectID), "invisible_project_owner")
	add(input.Capability != "" && !containsSkillToken(candidate.manifest.Capabilities, input.Capability), "capability_mismatch")
	add(candidate.invalidManifest || candidate.invalidContract || len(candidate.input.ArtifactInputs) == 0 || len(candidate.output.ArtifactOutputs) == 0 || candidate.manifest.ExecutorKind == "", "legacy_contract_unsupported")
	add(candidate.invalidArtifactContract, "artifact_contract_invalid")
	evaluateInvocationInputs(input, candidate, add)
	if input.ExpectedOutputArtifactType != "" {
		found := false
		for _, output := range candidate.output.ArtifactOutputs {
			found = found || output.ArtifactType == input.ExpectedOutputArtifactType
		}
		add(!found, "output_type_mismatch")
	}
	allowedEffects := input.AllowedSideEffects
	if len(allowedEffects) == 0 {
		allowedEffects = []string{"none", "read", "image_generation"}
	}
	for _, effect := range candidate.manifest.SideEffects {
		add(!containsInvocationString(allowedEffects, effect), "unsupported_side_effect")
	}
	allowedExecutors := input.AllowedExecutors
	if len(allowedExecutors) == 0 {
		allowedExecutors = []string{"text_model", "image_model"}
	}
	add(!containsInvocationString(allowedExecutors, candidate.manifest.ExecutorKind), "unsupported_executor")
	add(len(candidate.manifest.RequiredTools) > 0, "tool_unavailable")
	add(len(input.AllowedCostClasses) > 0 && !containsInvocationString(input.AllowedCostClasses, candidate.manifest.EstimatedCostClass), "cost_policy")
	if len(candidate.trace.Reasons) == 0 {
		candidate.trace.Accepted = true
		candidate.trace.Score = invocationCandidateScore(input, *candidate)
	}
}

func evaluateInvocationInputs(input InvocationResolutionInput, candidate *invocationCandidate, add func(bool, string)) {
	counts := map[string]int{}
	for _, binding := range input.Inputs {
		counts[binding.BindingName]++
	}
	for _, spec := range candidate.input.ArtifactInputs {
		count := counts[spec.BindingName]
		if count < spec.Min || (spec.Required && count == 0) {
			add(true, "missing_input_binding")
		}
		if count > spec.Max {
			add(true, "input_cardinality")
		}
		for _, binding := range input.Inputs {
			if binding.BindingName != spec.BindingName {
				continue
			}
			artifact := binding.Artifact.Artifact
			add(artifact.ArtifactType != spec.ArtifactType, "missing_input_type")
			add(!ArtifactSchemaVersionMatches(artifact.SchemaVersion, spec.SchemaConstraint), "incompatible_schema_version")
			add(input.ProjectID != "" && artifact.ProjectID != input.ProjectID, "input_project_mismatch")
			add(input.EpisodeID != "" && artifact.EpisodeID != input.EpisodeID, "input_episode_mismatch")
			manualSource := artifact.ArtifactType == "source_text" && artifact.ProducerInvocationID == nil
			add(spec.RequiresApproval && !manualSource && !binding.Approved, "input_approval_required")
		}
	}
	for name := range counts {
		found := false
		for _, spec := range candidate.input.ArtifactInputs {
			found = found || spec.BindingName == name
		}
		add(!found, "missing_input_binding")
	}
}

func applyInvocationSelectorRules(input InvocationResolutionInput, candidates []invocationCandidate) {
	if input.SkillVersionID != "" {
		for index := range candidates {
			if candidates[index].version.ID != input.SkillVersionID {
				rejectInvocationCandidate(&candidates[index], "manual_lock_not_selected")
			} else if candidates[index].trace.Accepted {
				candidates[index].trace.Score = 10000
			}
		}
		return
	}
	if input.SkillID != "" && input.SkillVersionConstraint == "" {
		for index := range candidates {
			if candidates[index].version.ID != candidates[index].skill.RecommendedVersionID {
				rejectInvocationCandidate(&candidates[index], "not_recommended")
			}
		}
		return
	}
	if input.SkillID != "" {
		constraint, err := semver.NewConstraint(input.SkillVersionConstraint)
		for index := range candidates {
			if err != nil || candidates[index].semver == nil || !constraint.Check(candidates[index].semver) {
				rejectInvocationCandidate(&candidates[index], "version_constraint_mismatch")
			}
		}
	}
}

func rejectInvocationCandidate(candidate *invocationCandidate, reason string) {
	if !containsInvocationString(candidate.trace.Reasons, reason) {
		candidate.trace.Reasons = append(candidate.trace.Reasons, reason)
	}
	candidate.trace.Accepted = false
	candidate.trace.Score = 0
}

func invocationCandidateScore(input InvocationResolutionInput, candidate invocationCandidate) int {
	score := 0
	for _, tag := range input.ProjectTags {
		if containsInvocationString(candidate.manifest.ProjectTags, tag) {
			score += 100
		}
	}
	if candidate.skill.OwnerType == model.SkillOwnerProject {
		score += 50
	}
	if candidate.version.ID == candidate.skill.RecommendedVersionID {
		score += 20
	}
	if candidate.skill.OwnerType == model.SkillOwnerSystem {
		score += 10
	}
	return score
}

func sortInvocationCandidates(input InvocationResolutionInput, candidates []invocationCandidate) {
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].trace.Accepted != candidates[j].trace.Accepted {
			return candidates[i].trace.Accepted
		}
		if candidates[i].trace.Accepted && input.SkillID != "" && input.SkillVersionConstraint != "" && candidates[i].semver != nil && candidates[j].semver != nil && !candidates[i].semver.Equal(candidates[j].semver) {
			return candidates[i].semver.GreaterThan(candidates[j].semver)
		}
		if candidates[i].trace.Score != candidates[j].trace.Score {
			return candidates[i].trace.Score > candidates[j].trace.Score
		}
		if candidates[i].skill.ID != candidates[j].skill.ID {
			return candidates[i].skill.ID < candidates[j].skill.ID
		}
		return candidates[i].version.ID < candidates[j].version.ID
	})
}

func normalizedStringSet(values []string, lower bool) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if lower {
			value = strings.ToLower(value)
		}
		if value != "" && !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	sort.Strings(result)
	return result
}

func containsInvocationString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
