package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestNormalizeSkillPackageProducesStableHash(t *testing.T) {
	input := validSkillTestPackage()
	input.Manifest.Capabilities = []string{" asset.character.rendition ", "asset.character.rendition"}
	input.Files = map[string]string{"rules/domain-rules.md": "规则", "SKILL.md": "主说明"}
	first, err := NormalizeSkillPackage(input)
	if err != nil {
		t.Fatal(err)
	}
	second, err := NormalizeSkillPackage(input)
	if err != nil {
		t.Fatal(err)
	}
	if first.ContentHash == "" || first.ContentHash != second.ContentHash {
		t.Fatalf("first=%q second=%q", first.ContentHash, second.ContentHash)
	}
	if len(first.Manifest.Capabilities) != 1 || first.Manifest.Capabilities[0] != "asset.character.rendition" {
		t.Fatalf("capabilities=%v", first.Manifest.Capabilities)
	}
}

func TestNormalizeSkillPackageRejectsInvalidManifest(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*SkillPackage)
		want   string
	}{
		{name: "capabilities", mutate: func(value *SkillPackage) { value.Manifest.Capabilities = nil }, want: "capabilities"},
		{name: "compatibility", mutate: func(value *SkillPackage) {
			value.Manifest.SchemaCompatibility = map[string]string{"asset_record": "latest"}
		}, want: "兼容范围"},
		{name: "cost", mutate: func(value *SkillPackage) { value.Manifest.EstimatedCostClass = "mystery" }, want: "成本等级"},
		{name: "side effects", mutate: func(value *SkillPackage) { value.Manifest.SideEffects = []string{"none", "write"} }, want: "none"},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			input := validSkillTestPackage()
			item.mutate(&input)
			if _, err := NormalizeSkillPackage(input); err == nil || !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(item.want)) {
				t.Fatalf("err=%v", err)
			}
		})
	}
}

func TestNormalizeSkillPackageRejectsUnsafeFilesAndInvalidSchema(t *testing.T) {
	input := validSkillTestPackage()
	input.Files["../run.sh"] = "bad"
	if _, err := NormalizeSkillPackage(input); err == nil || !strings.Contains(err.Error(), "路径") {
		t.Fatalf("err=%v", err)
	}
	input = validSkillTestPackage()
	input.OutputContract.Schema = map[string]any{"type": "definitely-not-a-json-schema-type"}
	if _, err := NormalizeSkillPackage(input); err == nil || !strings.Contains(err.Error(), "Schema") {
		t.Fatalf("err=%v", err)
	}
}

func TestDecodeSkillPackageRejectsHashMismatch(t *testing.T) {
	packageValue, err := NormalizeSkillPackage(validSkillTestPackage())
	if err != nil {
		t.Fatal(err)
	}
	manifestJSON, _ := json.Marshal(packageValue.Manifest)
	filesJSON, _ := json.Marshal(packageValue.Files)
	inputJSON, _ := json.Marshal(packageValue.InputContract)
	outputJSON, _ := json.Marshal(packageValue.OutputContract)
	gatesJSON, _ := json.Marshal(packageValue.QualityGateProfile)
	version := model.SkillVersion{
		ManifestJSON: string(manifestJSON), FilesJSON: string(filesJSON), InputContractJSON: string(inputJSON),
		OutputContractJSON: string(outputJSON), QualityGateProfileJSON: string(gatesJSON), ContentHash: "wrong",
	}
	if _, err := DecodeSkillPackage(version); err == nil || !strings.Contains(err.Error(), "哈希") {
		t.Fatalf("err=%v", err)
	}
}

func TestSkillPackageInstructionsUsesStableFileOrder(t *testing.T) {
	files := map[string]string{
		"examples/good-output.json":    `{"items":[]}`,
		"SKILL.md":                     "主说明",
		"templates/output-template.md": "模板",
		"rules/domain-rules.md":        "规则",
	}
	instructions := SkillPackageInstructions(files)
	previous := -1
	for _, name := range []string{"SKILL.md", "rules/domain-rules.md", "templates/output-template.md", "examples/good-output.json"} {
		index := strings.Index(instructions, name)
		if index <= previous {
			t.Fatalf("unstable order in %q", instructions)
		}
		previous = index
	}
}

func validSkillTestPackage() SkillPackage {
	return SkillPackage{
		Manifest: SkillManifest{
			Capabilities:        []string{"asset.character.rendition"},
			InputArtifactTypes:  []string{"asset_record"},
			OutputArtifactTypes: []string{"asset_brief"},
			ProjectTags:         []string{"vertical", "short_drama"},
			SchemaCompatibility: map[string]string{"asset_record": ">=1.0 <2.0"},
			SideEffects:         []string{"none"},
			EstimatedCostClass:  "text_low",
		},
		Files: map[string]string{"SKILL.md": "生成结构化资产简报。"},
		InputContract: SkillInputContract{
			RequiredInputs: []string{"assetRecord"},
			ImagePolicy:    SkillImagePolicy{AllowTextFallback: true},
		},
		OutputContract: SkillOutputContract{
			SchemaVersion: "1.0.0",
			Schema:        map[string]any{"type": "object", "additionalProperties": false, "properties": map[string]any{}},
		},
		QualityGateProfile: []string{"schema", "asset"},
	}
}
