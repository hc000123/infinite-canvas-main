package service

import (
	"encoding/json"
	"testing"
)

func TestWorkflowReferenceEvidenceIsRequiredForEveryAttachedImage(t *testing.T) {
	report := ValidateAssetExtractionArtifact(json.RawMessage(`{"items":[{"logicalAssetId":"SCENE-001","kind":"scene","name":"教室","scriptEvidence":"旧教室内","description":"旧教室"}]}`))
	validateWorkflowReferenceEvidence(json.RawMessage(`{"items":[{"logicalAssetId":"SCENE-001","kind":"scene","name":"教室","scriptEvidence":"旧教室内","description":"旧教室"}]}`), `{"items":[{"order":0}]}`, &report)
	if report.Passed || len(report.Issues) == 0 || report.Issues[len(report.Issues)-1].Code != "missing_reference_evidence" {
		t.Fatalf("report=%+v", report)
	}
}

func TestWorkflowReferenceEvidencePassesWithVisualFactsAndUsage(t *testing.T) {
	raw := json.RawMessage(`{"referenceEvidence":[{"imageRef":"@图1","observations":["右侧窗户形成侧逆光","人物位于床边"],"appliedTo":["SCENE-001"]}],"items":[{"logicalAssetId":"SCENE-001","kind":"scene","name":"教室","scriptEvidence":"旧教室内","description":"旧教室"}]}`)
	report := ValidateAssetExtractionArtifact(raw)
	validateWorkflowReferenceEvidence(raw, `{"items":[{"order":0}]}`, &report)
	if !report.Passed || len(report.Issues) != 0 {
		t.Fatalf("report=%+v", report)
	}
}
