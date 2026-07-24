package service

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type workflowSkillSeed struct {
	StageKey    string
	Name        string
	Description string
	Gate        string
}

//go:embed workflow_skill_seeds/*
var workflowSkillSeedFS embed.FS

const workflowSkillSeedVersion = "3.0.0"

var workflowSkillSeedStageKeys = []string{
	WorkflowSkillStageScript,
	WorkflowSkillStageArt,
	WorkflowSkillStageAssets,
	WorkflowSkillStageStoryboard,
	WorkflowSkillStageVideo,
	WorkflowSkillStageDelivery,
}

func EnsureWorkflowSkillSeeds() error {
	seeds := []workflowSkillSeed{
		{WorkflowSkillStageScript, "剧本整理", "确认生产剧本并形成稳定输入。", "script"},
		{WorkflowSkillStageArt, "资产提取", "从剧本证据提取角色、场景、道具和角色外观马甲。", "art"},
		{WorkflowSkillStageAssets, "资产生图提示词", "把已批准资产转成一致、可执行的生图提示词。", "media"},
		{WorkflowSkillStageStoryboard, "分镜拆解", "把生产剧本拆成 4–15 秒的可编辑结构化镜头。", "storyboard"},
		{WorkflowSkillStageVideo, "镜头提示词", "结合已确认分镜与实际参考图生成单镜头最终提示词。", "media"},
		{WorkflowSkillStageDelivery, "成片交付", "审计生成结果、失败项、重试建议与导出清单。", "delivery"},
	}
	for _, seed := range seeds {
		skill, exists, err := repository.FindWorkflowSkillByStage(seed.StageKey)
		if err != nil {
			return err
		}
		files, err := loadWorkflowSkillSeedFiles(seed.StageKey)
		if err != nil {
			return err
		}
		contract := workflowSkillSeedContract(seed.StageKey)
		contract.QualityGateProfile = []string{"schema", seed.Gate}
		packageValue, err := NormalizeWorkflowSkillPackage(files, contract)
		if err != nil {
			return fmt.Errorf("normalize workflow skill %s: %w", seed.StageKey, err)
		}
		filesJSON, _ := json.Marshal(packageValue.Files)
		contractJSON, _ := json.Marshal(packageValue.Contract)
		stamp := now()
		versionID := "workflow-skill-version-" + seed.StageKey + "-" + workflowSkillSeedVersion
		version := model.WorkflowSkillVersion{ID: versionID, Version: workflowSkillSeedVersion, Status: model.WorkflowSkillVersionPublished, FilesJSON: string(filesJSON), ContractJSON: string(contractJSON), ContentHash: packageValue.ContentHash, CreatedBy: "system", PublishedAt: stamp, CreatedAt: stamp, UpdatedAt: stamp}
		if !exists {
			skill = model.WorkflowSkill{ID: "workflow-skill-" + seed.StageKey, Name: seed.Name, Description: seed.Description, StageKey: seed.StageKey, Enabled: true, CreatedAt: stamp, UpdatedAt: stamp}
			version.SkillID = skill.ID
			if err := repository.CreateWorkflowSkillAggregate(skill, version); err != nil {
				return fmt.Errorf("seed workflow skill %s: %w", seed.StageKey, err)
			}
		} else if _, ok, err := repository.GetWorkflowSkillVersion(versionID); err != nil {
			return err
		} else if !ok {
			version.SkillID = skill.ID
			if err := repository.CreateWorkflowSkillVersion(version); err != nil {
				return fmt.Errorf("seed workflow skill version %s: %w", seed.StageKey, err)
			}
		}
		binding, bound, err := repository.ResolveWorkflowStageSkillBinding(seed.StageKey, "")
		if err != nil {
			return err
		}
		if bound {
			boundVersion, ok, err := repository.GetWorkflowSkillVersion(binding.SkillVersionID)
			if err != nil {
				return err
			}
			builtIn := ok && boundVersion.CreatedBy == "system" && strings.HasPrefix(boundVersion.ID, "workflow-skill-version-"+seed.StageKey+"-")
			if !builtIn {
				continue
			}
		}
		if err := repository.UpsertWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{ID: "workflow-skill-binding-global-" + seed.StageKey, StageKey: seed.StageKey, Scope: model.WorkflowSkillScopeGlobal, SkillVersionID: versionID, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
			return err
		}
	}
	return nil
}

func loadWorkflowSkillSeedFiles(stageKey string) (map[string]string, error) {
	if !workflowSkillStages[stageKey] {
		return nil, fmt.Errorf("未知 Workflow Skill 阶段 %q", stageKey)
	}
	prefix := "workflow_skill_seeds/" + stageKey
	files := map[string]string{}
	err := fs.WalkDir(workflowSkillSeedFS, prefix, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		content, err := workflowSkillSeedFS.ReadFile(path)
		if err != nil {
			return err
		}
		files[strings.TrimPrefix(path, prefix+"/")] = string(content)
		return nil
	})
	return files, err
}

func workflowSkillSeedContract(stageKey string) WorkflowSkillContract {
	contract := WorkflowSkillContract{
		RequiredInputs:      []string{"workflow", "script", "upstreamArtifact"},
		OutputSchemaVersion: "1.0.0",
		ApplyTargets:        []string{stageKey},
	}
	contract.ImagePolicy.AllowTextFallback = true
	switch stageKey {
	case WorkflowSkillStageScript:
		contract.RequiredInputs = []string{"workflow", "script"}
		contract.OutputSchema = workflowScriptOutputSchema()
	case WorkflowSkillStageArt:
		contract.OutputSchema = workflowAssetOutputSchema(false)
	case WorkflowSkillStageAssets:
		contract.OutputSchema = workflowAssetOutputSchema(true)
	case WorkflowSkillStageStoryboard:
		contract.OutputSchema = workflowStoryboardOutputSchema()
	case WorkflowSkillStageVideo:
		contract.RequiredInputs = []string{"workflow", "script", "upstreamArtifact", "shotContext"}
		contract.ImagePolicy.Max = 9
		contract.ImagePolicy.AllowedTypes = []string{"image/png", "image/jpeg", "image/webp"}
		contract.OutputSchema = workflowVideoOutputSchema()
	case WorkflowSkillStageDelivery:
		contract.OutputSchema = workflowDeliveryOutputSchema()
	}
	return contract
}

func workflowScriptOutputSchema() map[string]any {
	return map[string]any{"type": "object", "additionalProperties": false, "required": []string{"productionScript"}, "properties": map[string]any{"productionScript": map[string]any{"type": "string", "minLength": 1}}}
}

func workflowAssetOutputSchema(withPrompt bool) map[string]any {
	properties := map[string]any{
		"logicalAssetId":       map[string]any{"type": "string", "pattern": `^(CHAR|SCENE|PROP|COSTUME)-\d{3}$`},
		"kind":                 map[string]any{"type": "string", "enum": []string{"character", "scene", "prop", "costume"}},
		"name":                 map[string]any{"type": "string", "minLength": 1},
		"scriptEvidence":       map[string]any{"type": "string", "minLength": 1},
		"description":          map[string]any{"type": "string", "minLength": 1},
		"parentLogicalAssetId": map[string]any{"type": "string", "pattern": `^CHAR-\d{3}$`},
		"variantType":          map[string]any{"type": "string", "enum": []string{"costume", "hair", "makeup", "age", "injury", "other"}},
		"variantName":          map[string]any{"type": "string", "minLength": 1},
	}
	required := []string{"logicalAssetId", "kind", "name", "scriptEvidence", "description"}
	if withPrompt {
		properties["imagePrompt"] = map[string]any{"type": "string", "minLength": 1}
		properties["status"] = map[string]any{"const": "ready"}
		required = append(required, "imagePrompt", "status")
	}
	item := map[string]any{
		"type": "object", "additionalProperties": false, "required": required, "properties": properties,
		"allOf": []any{map[string]any{"if": map[string]any{"properties": map[string]any{"kind": map[string]any{"const": "costume"}}, "required": []string{"kind"}}, "then": map[string]any{"required": []string{"parentLogicalAssetId", "variantType", "variantName"}}}},
	}
	return map[string]any{"type": "object", "additionalProperties": false, "required": []string{"items"}, "properties": map[string]any{"items": map[string]any{"type": "array", "minItems": 1, "maxItems": 300, "items": item}}}
}

func workflowStoryboardOutputSchema() map[string]any {
	draft := map[string]any{
		"type": "object", "additionalProperties": false,
		"required": []string{"shotSize", "camera", "movement", "action", "performance", "dialogue", "durationSeconds", "continuityMode"},
		"properties": map[string]any{
			"shotSize": map[string]any{"type": "string", "minLength": 1}, "camera": map[string]any{"type": "string", "minLength": 1},
			"movement": map[string]any{"type": "string", "minLength": 1}, "action": map[string]any{"type": "string", "minLength": 1},
			"performance": map[string]any{"type": "string", "minLength": 1}, "dialogue": map[string]any{"type": "string"},
			"durationSeconds": map[string]any{"type": "number", "minimum": 4, "maximum": 15},
			"continuityMode":  map[string]any{"type": "string", "enum": []string{"continuous", "cut"}},
		},
	}
	shot := map[string]any{
		"type": "object", "additionalProperties": false, "required": []string{"shotId", "sceneKey", "sourceScript", "shotDraft"},
		"properties": map[string]any{
			"shotId": map[string]any{"type": "string", "pattern": `^shot-\d{3,}$`}, "sceneKey": map[string]any{"type": "string", "pattern": `^scene-\d{3,}$`},
			"sourceScript": map[string]any{"type": "string", "minLength": 1}, "shotDraft": draft,
		},
	}
	return map[string]any{"type": "object", "additionalProperties": false, "required": []string{"shots"}, "properties": map[string]any{"shots": map[string]any{"type": "array", "minItems": 1, "maxItems": 2000, "items": shot}}}
}

func workflowVideoOutputSchema() map[string]any {
	evidence := map[string]any{
		"type": "object", "additionalProperties": false, "required": []string{"imageRef", "observations", "appliedTo"},
		"properties": map[string]any{
			"imageRef":     map[string]any{"type": "string", "pattern": `^@图[1-9]$`},
			"observations": map[string]any{"type": "array", "minItems": 1, "items": map[string]any{"type": "string", "minLength": 1}},
			"appliedTo":    map[string]any{"type": "array", "minItems": 1, "items": map[string]any{"type": "string", "minLength": 1}},
		},
	}
	return map[string]any{
		"type": "object", "additionalProperties": false, "required": []string{"shotId", "prompt", "promptInputHash", "referenceEvidence"},
		"properties": map[string]any{
			"shotId": map[string]any{"type": "string", "minLength": 1}, "prompt": map[string]any{"type": "string", "minLength": 20},
			"promptInputHash": map[string]any{"type": "string", "minLength": 1}, "referenceEvidence": map[string]any{"type": "array", "maxItems": 9, "items": evidence},
		},
	}
}

func workflowDeliveryOutputSchema() map[string]any {
	row := func(required []string, properties map[string]any) map[string]any {
		return map[string]any{"type": "object", "additionalProperties": false, "required": required, "properties": properties}
	}
	text := map[string]any{"type": "string", "minLength": 1}
	return map[string]any{
		"type": "object", "additionalProperties": false, "required": []string{"summary", "succeeded", "failed", "retrySuggestions", "exportManifest"},
		"properties": map[string]any{
			"summary":          text,
			"succeeded":        map[string]any{"type": "array", "items": row([]string{"shotId", "output"}, map[string]any{"shotId": text, "output": text})},
			"failed":           map[string]any{"type": "array", "items": row([]string{"shotId", "reason"}, map[string]any{"shotId": text, "reason": text})},
			"retrySuggestions": map[string]any{"type": "array", "items": row([]string{"shotId", "suggestion"}, map[string]any{"shotId": text, "suggestion": text})},
			"exportManifest":   map[string]any{"type": "array", "items": row([]string{"shotId", "file", "status"}, map[string]any{"shotId": text, "file": text, "status": map[string]any{"type": "string", "enum": []string{"ready", "failed"}}})},
		},
	}
}
