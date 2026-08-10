package service

import (
	"encoding/json"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestResolveInvocationSkillHonorsManualLockAndExplainsRejectedCandidates(t *testing.T) {
	setupInvocationServiceTest(t)
	input := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"test"}`)
	skill, manual := seedInvocationSkill(t, invocationSkillSeed{ID: "manual-skill", VersionID: "manual-v1", Version: "1.0.0", Recommended: true})
	_, other := seedInvocationSkillVersion(t, skill, invocationSkillSeed{VersionID: "manual-v2", Version: "2.0.0"})
	other.FilesJSON = `{broken`
	other.ContentHash = "corrupt-rejected-candidate"
	saveSkillVersionFixture(t, other)

	result, err := ResolveInvocationSkill("user-1", InvocationResolutionInput{
		ProjectID: "project-1", SkillVersionID: manual.ID, ExpectedOutputArtifactType: "production_script",
		Inputs: []ResolvedArtifactBinding{{BindingName: "source", Artifact: input}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Resolved.Version.ID != manual.ID || result.Trace.FinalSkillVersionID != manual.ID {
		t.Fatalf("manual lock was replaced: %+v", result)
	}
	if candidate := invocationTraceCandidate(result.Trace, manual.ID); candidate == nil || candidate.Score != 10000 || !candidate.Accepted {
		t.Fatalf("manual candidate=%+v", candidate)
	}
	if candidate := invocationTraceCandidate(result.Trace, other.ID); candidate == nil || candidate.Accepted {
		t.Fatalf("rejected candidate missing: %+v", result.Trace)
	}
}

func TestResolveInvocationSkillUsesSemverRankingTagsAndStableTieBreak(t *testing.T) {
	setupInvocationServiceTest(t)
	input := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"test"}`)
	projectSkill, projectV1 := seedInvocationSkill(t, invocationSkillSeed{ID: "z-project", VersionID: "z-v1", Version: "1.4.0", OwnerType: model.SkillOwnerProject, ProjectTags: []string{"short_drama"}})
	_, projectV2 := seedInvocationSkillVersion(t, projectSkill, invocationSkillSeed{VersionID: "z-v2", Version: "1.9.0"})
	seedInvocationSkill(t, invocationSkillSeed{ID: "a-system", VersionID: "a-v1", Version: "1.9.0", ProjectTags: []string{"other"}})

	byCapability, err := ResolveInvocationSkill("user-1", InvocationResolutionInput{
		ProjectID: "project-1", Capability: "script.create", ProjectTags: []string{"short_drama"},
		ExpectedOutputArtifactType: "production_script", Inputs: []ResolvedArtifactBinding{{BindingName: "source", Artifact: input}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if byCapability.Resolved.Skill.ID != projectSkill.ID || byCapability.Resolved.Skill.OwnerType != model.SkillOwnerProject {
		t.Fatalf("ranking winner=%+v trace=%+v", byCapability.Resolved, byCapability.Trace)
	}
	if len(byCapability.Trace.Candidates) < 2 || byCapability.Trace.Candidates[0].Score <= byCapability.Trace.Candidates[1].Score {
		t.Fatalf("scores do not explain ordering: %+v", byCapability.Trace.Candidates)
	}

	byConstraint, err := ResolveInvocationSkill("user-1", InvocationResolutionInput{
		ProjectID: "project-1", SkillID: projectSkill.ID, SkillVersionConstraint: ">=1.0 <2.0",
		ExpectedOutputArtifactType: "production_script", Inputs: []ResolvedArtifactBinding{{BindingName: "source", Artifact: input}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if byConstraint.Resolved.Version.ID != projectV2.ID || byConstraint.Resolved.Version.ID == projectV1.ID {
		t.Fatalf("highest compatible semver not selected: %+v", byConstraint)
	}
}

func TestResolveInvocationSkillEnforcesOwnerLegacyAndPersistedBindings(t *testing.T) {
	setupInvocationServiceTest(t)
	input := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"test"}`)
	_, projectVersion := seedInvocationSkill(t, invocationSkillSeed{ID: "private", VersionID: "private-v1", Version: "1.0.0", OwnerType: model.SkillOwnerProject})

	for _, selector := range []InvocationResolutionInput{
		{ProjectID: "project-1", SkillVersionID: projectVersion.ID},
		{ProjectID: "project-1", SkillID: projectVersion.SkillID},
		{ProjectID: "project-1", Capability: "script.create"},
	} {
		selector.ExpectedOutputArtifactType = "production_script"
		selector.Inputs = []ResolvedArtifactBinding{{BindingName: "source", Artifact: input}}
		result, err := ResolveInvocationSkill("foreign-user", selector)
		if err != nil {
			t.Fatal(err)
		}
		if result.Trace.FinalSkillVersionID != "" || !invocationTraceHasReason(result.Trace, "invisible_project_owner") {
			t.Fatalf("foreign owner visible for selector %+v: %+v", selector, result.Trace)
		}
	}

	legacySkill, _ := seedInvocationSkill(t, invocationSkillSeed{ID: "legacy", VersionID: "legacy-v1", Version: "3.0.1"})
	legacyVersion, ok, err := repository.GetSkillVersion(legacySkill.RecommendedVersionID)
	if err != nil || !ok {
		t.Fatal(err)
	}
	legacyVersion.InputContractJSON = `{"requiredInputs":["source"],"imagePolicy":{"required":false,"min":0,"max":0,"allowTextFallback":true,"allowedTypes":[]}}`
	legacyVersion.OutputContractJSON = `{"schemaVersion":"1.0.0","schema":{"type":"object"}}`
	var pkg SkillPackage
	_ = json.Unmarshal([]byte(legacyVersion.ManifestJSON), &pkg.Manifest)
	_ = json.Unmarshal([]byte(legacyVersion.FilesJSON), &pkg.Files)
	_ = json.Unmarshal([]byte(legacyVersion.InputContractJSON), &pkg.InputContract)
	_ = json.Unmarshal([]byte(legacyVersion.OutputContractJSON), &pkg.OutputContract)
	_ = json.Unmarshal([]byte(legacyVersion.QualityGateProfileJSON), &pkg.QualityGateProfile)
	normalized, normalizeErr := NormalizeSkillPackage(pkg)
	if normalizeErr != nil {
		t.Fatal(normalizeErr)
	}
	legacyVersion.ContentHash = normalized.ContentHash
	saveSkillVersionFixture(t, legacyVersion)
	result, err := ResolveInvocationSkill("user-1", InvocationResolutionInput{ProjectID: "project-1", SkillVersionID: legacyVersion.ID, Inputs: []ResolvedArtifactBinding{{BindingName: "source", Artifact: input}}})
	if err != nil {
		t.Fatal(err)
	}
	if !invocationTraceHasReason(result.Trace, "legacy_contract_unsupported") {
		t.Fatalf("legacy trace=%+v", result.Trace)
	}
}

func TestResolveInvocationSkillValidatesOptionalRepeatedCardinalitySchemaAndOutput(t *testing.T) {
	setupInvocationServiceTest(t)
	input := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"test"}`)
	_, version := seedInvocationSkill(t, invocationSkillSeed{ID: "contracts", VersionID: "contracts-v1", Version: "1.0.0", Mutate: func(pkg *SkillPackage) {
		pkg.InputContract.ArtifactInputs = []ArtifactInputSpec{
			{BindingName: "source", ArtifactType: "source_text", Required: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0"},
			{BindingName: "optional", ArtifactType: "source_text", Min: 0, Max: 1, SchemaConstraint: ">=1.0 <2.0"},
			{BindingName: "repeated", ArtifactType: "source_text", Min: 0, Max: 9, SchemaConstraint: ">=1.0 <2.0"},
		}
		pkg.OutputContract.ArtifactOutputs = []ArtifactOutputSpec{
			{BindingName: "primary", ArtifactType: "production_script", Min: 1, Max: 1, SchemaVersion: "1.0.0"},
			{BindingName: "report", ArtifactType: "delivery_report", Min: 0, Max: 2, SchemaVersion: "1.0.0"},
		}
		pkg.Manifest.OutputArtifactTypes = []string{"production_script", "delivery_report"}
	}})

	valid := InvocationResolutionInput{ProjectID: "project-1", SkillVersionID: version.ID, ExpectedOutputArtifactType: "production_script", Inputs: []ResolvedArtifactBinding{{BindingName: "source", Artifact: input}}}
	result, err := ResolveInvocationSkill("user-1", valid)
	if err != nil || result.Trace.FinalSkillVersionID != version.ID {
		t.Fatalf("optional/repeated zero rejected: result=%+v err=%v", result, err)
	}
	duplicate := valid
	duplicate.Inputs = append(append([]ResolvedArtifactBinding{}, valid.Inputs...), ResolvedArtifactBinding{BindingName: "source", Artifact: input})
	result, err = ResolveInvocationSkill("user-1", duplicate)
	if err != nil || !invocationTraceHasReason(result.Trace, "input_cardinality") {
		t.Fatalf("duplicate binding trace=%+v err=%v", result.Trace, err)
	}
	mismatch := valid
	mismatch.ExpectedOutputArtifactType = "asset_catalog"
	result, err = ResolveInvocationSkill("user-1", mismatch)
	if err != nil || !invocationTraceHasReason(result.Trace, "output_type_mismatch") {
		t.Fatalf("output trace=%+v err=%v", result.Trace, err)
	}
	incompatible := valid
	incompatible.Inputs = []ResolvedArtifactBinding{{BindingName: "source", Artifact: input}}
	incompatible.Inputs[0].Artifact.Artifact.SchemaVersion = "2.0.0"
	result, err = ResolveInvocationSkill("user-1", incompatible)
	if err != nil || !invocationTraceHasReason(result.Trace, "incompatible_schema_version") {
		t.Fatalf("schema trace=%+v err=%v", result.Trace, err)
	}
}

func TestResolveInvocationSkillKeepsRejectReasonOrderStable(t *testing.T) {
	setupInvocationServiceTest(t)
	skill, version := seedInvocationSkill(t, invocationSkillSeed{ID: "reason-order", VersionID: "reason-order-v1", Version: "1.0.0", OwnerType: model.SkillOwnerProject})
	skill.Enabled = false
	if err := repository.SaveSkillDefinition(skill); err != nil {
		t.Fatal(err)
	}
	version.Status = model.SkillVersionDraft
	version.ManifestJSON = `{`
	version.InputContractJSON = `{"requiredInputs":["source"],"imagePolicy":{"required":false,"min":0,"max":0,"allowTextFallback":true,"allowedTypes":[]}}`
	version.OutputContractJSON = `{"schemaVersion":"1.0.0","schema":{"type":"object"}}`
	saveSkillVersionFixture(t, version)
	result, err := ResolveInvocationSkill("foreign", InvocationResolutionInput{ProjectID: "project-1", Capability: "different.capability"})
	if err != nil {
		t.Fatal(err)
	}
	candidate := invocationTraceCandidate(result.Trace, version.ID)
	want := []string{"disabled_definition", "unpublished_version", "invisible_project_owner", "capability_mismatch", "legacy_contract_unsupported"}
	if candidate == nil || len(candidate.Reasons) < len(want) {
		t.Fatalf("candidate=%+v", candidate)
	}
	for index := range want {
		if candidate.Reasons[index] != want[index] {
			t.Fatalf("reasons=%v want prefix=%v", candidate.Reasons, want)
		}
	}
}

func TestResolveInvocationSkillArtifactContractsRejectExternalAndMalformedSchemas(t *testing.T) {
	setupInvocationServiceTest(t)
	for _, schema := range []map[string]any{
		{"$ref": "https://evil.invalid/schema.json"},
		{"type": "definitely-not-a-json-schema-type"},
	} {
		pkg := validSkillTestPackage()
		pkg.OutputContract.Schema = schema
		if err := ValidateSkillArtifactContracts(pkg); err == nil {
			t.Fatalf("schema accepted: %+v", schema)
		}
	}
}

func TestResolveInvocationSkillRejectsUnregisteredOutputBeforeRankingWinner(t *testing.T) {
	setupInvocationServiceTest(t)
	input := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"test"}`)
	_, invalid := seedInvocationSkill(t, invocationSkillSeed{ID: "a-invalid-output", VersionID: "a-invalid-output-v1", Version: "1.0.0", Mutate: func(pkg *SkillPackage) {
		pkg.OutputContract.ArtifactOutputs[0].SchemaVersion = "9.9.9"
	}})
	_, valid := seedInvocationSkill(t, invocationSkillSeed{ID: "z-valid-output", VersionID: "z-valid-output-v1", Version: "1.0.0"})
	result, err := ResolveInvocationSkill("user-1", InvocationResolutionInput{ProjectID: "project-1", Capability: "script.create", ExpectedOutputArtifactType: "production_script", Inputs: []ResolvedArtifactBinding{{BindingName: "source", Artifact: input}}})
	if err != nil {
		t.Fatal(err)
	}
	if result.Resolved.Version.ID != valid.ID || result.Resolved.Version.ID == invalid.ID {
		t.Fatalf("invalid output contract won: %+v", result)
	}
	if candidate := invocationTraceCandidate(result.Trace, invalid.ID); candidate == nil || candidate.Accepted || !containsInvocationString(candidate.Reasons, "artifact_contract_invalid") {
		t.Fatalf("invalid candidate trace=%+v", candidate)
	}
}

func TestResolveInvocationSkillFallsBackAfterFullPackageFailure(t *testing.T) {
	setupInvocationServiceTest(t)
	input := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"test"}`)
	_, corrupt := seedInvocationSkill(t, invocationSkillSeed{ID: "a-corrupt-package", VersionID: "a-corrupt-package-v1", Version: "1.0.0"})
	corrupt.FilesJSON = `{broken`
	saveSkillVersionFixture(t, corrupt)
	_, valid := seedInvocationSkill(t, invocationSkillSeed{ID: "z-valid-package", VersionID: "z-valid-package-v1", Version: "1.0.0"})
	result, err := ResolveInvocationSkill("user-1", InvocationResolutionInput{ProjectID: "project-1", Capability: "script.create", ExpectedOutputArtifactType: "production_script", Inputs: []ResolvedArtifactBinding{{BindingName: "source", Artifact: input}}})
	if err != nil {
		t.Fatal(err)
	}
	if result.Resolved.Version.ID != valid.ID {
		t.Fatalf("fallback winner=%+v", result)
	}
	if candidate := invocationTraceCandidate(result.Trace, corrupt.ID); candidate == nil || candidate.Accepted || !containsInvocationString(candidate.Reasons, "package_invalid") {
		t.Fatalf("corrupt trace=%+v", candidate)
	}
}

func TestResolveInvocationSkillConstraintFallsBackAfterHighestPackageFailure(t *testing.T) {
	setupInvocationServiceTest(t)
	input := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"test"}`)
	skill, lower := seedInvocationSkill(t, invocationSkillSeed{ID: "constraint-fallback", VersionID: "constraint-v1", Version: "1.0.0"})
	_, highest := seedInvocationSkillVersion(t, skill, invocationSkillSeed{VersionID: "constraint-v2", Version: "1.9.0"})
	highest.FilesJSON = `{broken`
	saveSkillVersionFixture(t, highest)
	result, err := ResolveInvocationSkill("user-1", InvocationResolutionInput{ProjectID: "project-1", SkillID: skill.ID, SkillVersionConstraint: ">=1.0 <2.0", ExpectedOutputArtifactType: "production_script", Inputs: []ResolvedArtifactBinding{{BindingName: "source", Artifact: input}}})
	if err != nil {
		t.Fatal(err)
	}
	if result.Resolved.Version.ID != lower.ID {
		t.Fatalf("constraint fallback=%+v", result)
	}
}

func TestResolveInvocationSkillFiltersRequiredToolsBeforeRanking(t *testing.T) {
	setupInvocationServiceTest(t)
	input := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"test"}`)
	_, tool := seedInvocationSkill(t, invocationSkillSeed{ID: "a-tool", VersionID: "a-tool-v1", Version: "1.0.0", Mutate: func(pkg *SkillPackage) { pkg.Manifest.RequiredTools = []string{"asset.lookup"} }})
	_, free := seedInvocationSkill(t, invocationSkillSeed{ID: "z-free", VersionID: "z-free-v1", Version: "1.0.0"})
	result, err := ResolveInvocationSkill("user-1", InvocationResolutionInput{ProjectID: "project-1", Capability: "script.create", ExpectedOutputArtifactType: "production_script", Inputs: []ResolvedArtifactBinding{{BindingName: "source", Artifact: input}}})
	if err != nil {
		t.Fatal(err)
	}
	if result.Resolved.Version.ID != free.ID {
		t.Fatalf("tool candidate prevented fallback: %+v", result)
	}
	if candidate := invocationTraceCandidate(result.Trace, tool.ID); candidate == nil || !containsInvocationString(candidate.Reasons, "tool_unavailable") {
		t.Fatalf("tool trace=%+v", candidate)
	}
}

func TestResolveInvocationSkillRoutesImageModelExecutorByPolicy(t *testing.T) {
	setupInvocationServiceTest(t)
	input := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"test"}`)
	_, version := seedInvocationSkill(t, invocationSkillSeed{ID: "image-executor", VersionID: "image-executor-v1", Version: "1.0.0", Mutate: func(pkg *SkillPackage) {
		pkg.Manifest.ExecutorKind = "image_model"
	}})

	base := InvocationResolutionInput{
		ProjectID: "project-1", SkillVersionID: version.ID, ExpectedOutputArtifactType: "production_script",
		Inputs: []ResolvedArtifactBinding{{BindingName: "source", Artifact: input}},
	}
	allowed := base
	allowed.AllowedExecutors = []string{"image_model"}
	result, err := ResolveInvocationSkill("user-1", allowed)
	if err != nil || result.Resolved.Version.ID != version.ID {
		t.Fatalf("image executor was not selected: result=%+v err=%v", result, err)
	}
	rejected := base
	rejected.AllowedExecutors = []string{"text_model"}
	result, err = ResolveInvocationSkill("user-1", rejected)
	if err != nil || !invocationTraceHasReason(result.Trace, "unsupported_executor") {
		t.Fatalf("image executor policy was not enforced: trace=%+v err=%v", result.Trace, err)
	}
}

func invocationTraceCandidate(trace InvocationRouteTrace, versionID string) *InvocationRouteCandidate {
	for index := range trace.Candidates {
		if trace.Candidates[index].SkillVersionID == versionID {
			return &trace.Candidates[index]
		}
	}
	return nil
}

func invocationTraceHasReason(trace InvocationRouteTrace, reason string) bool {
	for _, candidate := range trace.Candidates {
		for _, value := range candidate.Reasons {
			if value == reason {
				return true
			}
		}
	}
	return false
}
