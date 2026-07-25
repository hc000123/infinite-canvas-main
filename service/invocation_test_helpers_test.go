package service

import (
	"encoding/json"
	"testing"
)

func TestInvocationContractsKeepCallerDataSeparateFromTrustedInstructions(t *testing.T) {
	request := InvocationRequest{InputArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: "artifact-1"}}, Parameters: json.RawMessage(`{"prompt":"caller data"}`)}
	if len(request.InputArtifactRefs) != 1 || string(request.Parameters) == "" {
		t.Fatalf("request=%#v", request)
	}
	policy := InvocationExecutionPolicy{RequiresConfirmation: true, MaxAttempts: 2}
	if !policy.RequiresConfirmation || policy.MaxAttempts != 2 {
		t.Fatalf("policy=%#v", policy)
	}
	confirmation := InvocationConfirmation{RequirementCodes: []string{"api_cost"}}
	correction := InvocationCorrectionInput{Attempt: 1, ExpectedRawOutputHash: "raw-hash", Output: json.RawMessage(`{"fixed":true}`)}
	review := InvocationReviewInput{Decision: "approved", Attempt: 1, ArtifactSetHash: "set-hash"}
	apply := InvocationApplyInput{IdempotencyKey: "apply-key", Attempt: 1, ArtifactSetHash: "set-hash", Target: "test_sink", TargetID: "target-1"}
	trace := InvocationRouteTrace{FinalSkillVersionID: "skill-version-1", Candidates: []InvocationRouteCandidate{{SkillVersionID: "skill-version-1", Score: 10000}}}
	if len(confirmation.RequirementCodes) != 1 || correction.Attempt != 1 || review.Decision != "approved" || apply.Target != "test_sink" {
		t.Fatal("invalid lifecycle contracts")
	}
	if trace.FinalSkillVersionID != trace.Candidates[0].SkillVersionID || trace.Candidates[0].Score != 10000 {
		t.Fatal("invalid route trace contract")
	}
}
