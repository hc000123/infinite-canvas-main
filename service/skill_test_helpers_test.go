package service

import (
	"encoding/json"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func createSkillTestDraft(t *testing.T, capability, versionName string) model.SkillVersion {
	t.Helper()
	packageValue := validSkillTestPackage()
	packageValue.Manifest.Capabilities = []string{capability}
	if capability == "workflow.stage.art" {
		packageValue.Manifest.InputArtifactTypes = []string{"production_script"}
		packageValue.Manifest.OutputArtifactTypes = []string{"asset_catalog"}
		packageValue.Manifest.SchemaCompatibility = map[string]string{"production_script": ">=1.0 <2.0"}
		packageValue.InputContract.ArtifactInputs = []ArtifactInputSpec{{
			BindingName: "production_script", ArtifactType: "production_script", Required: true,
			Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0",
		}}
		packageValue.OutputContract.ArtifactOutputs = []ArtifactOutputSpec{{
			BindingName: "asset_catalog", ArtifactType: "asset_catalog", Min: 1, Max: 1, SchemaVersion: "1.0.0",
		}}
		packageValue.OutputContract.Schema = workflowAssetOutputSchema(false)
	}
	normalized, err := ValidateInvocableSkillPackage(packageValue)
	if err != nil {
		t.Fatal(err)
	}
	manifestJSON, _ := json.Marshal(normalized.Manifest)
	filesJSON, _ := json.Marshal(normalized.Files)
	inputJSON, _ := json.Marshal(normalized.InputContract)
	outputJSON, _ := json.Marshal(normalized.OutputContract)
	gatesJSON, _ := json.Marshal(normalized.QualityGateProfile)
	stamp := now()
	skill := model.SkillDefinition{ID: newID("skill"), Name: capability + " test", OwnerType: model.SkillOwnerSystem, Enabled: true, CreatedAt: stamp, UpdatedAt: stamp}
	version := model.SkillVersion{ID: newID("skillversion"), SkillID: skill.ID, Version: versionName, Status: model.SkillVersionDraft, ManifestJSON: string(manifestJSON), FilesJSON: string(filesJSON), InputContractJSON: string(inputJSON), OutputContractJSON: string(outputJSON), QualityGateProfileJSON: string(gatesJSON), ContentHash: normalized.ContentHash, CreatedBy: "admin-1", CreatedAt: stamp, UpdatedAt: stamp}
	if err := repository.CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	return version
}
