package service

import (
	"encoding/json"
	"testing"
)

func TestWorkflowReferenceEvidenceIsRequiredForEveryAttachedImage(t *testing.T) {
	report := ValidateArtDesignArtifact(json.RawMessage(`{"directorSummary":"室内","items":[{"id":"scene-1","kind":"scene","name":"教室","prompt":"旧教室"}]}`))
	validateWorkflowReferenceEvidence(json.RawMessage(`{"directorSummary":"室内","items":[{"id":"scene-1","kind":"scene","name":"教室","prompt":"旧教室"}]}`), `{"items":[{"order":0}]}`, &report)
	if report.Passed || len(report.Issues) == 0 || report.Issues[len(report.Issues)-1].Code != "missing_reference_evidence" {
		t.Fatalf("report=%+v", report)
	}
}

func TestWorkflowReferenceEvidencePassesWithVisualFactsAndUsage(t *testing.T) {
	raw := json.RawMessage(`{"directorSummary":"室内","referenceEvidence":[{"imageRef":"@图1","observations":["右侧窗户形成侧逆光","人物位于床边"],"appliedTo":["scene-1","character-1"]}],"items":[{"id":"scene-1","kind":"scene","name":"教室","prompt":"旧教室"}]}`)
	report := ValidateArtDesignArtifact(raw)
	validateWorkflowReferenceEvidence(raw, `{"items":[{"order":0}]}`, &report)
	if !report.Passed || len(report.Issues) != 0 {
		t.Fatalf("report=%+v", report)
	}
}
