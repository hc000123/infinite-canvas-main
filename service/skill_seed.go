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

type skillSeed struct {
	StageKey string
	Name     string
	Summary  string
}

//go:embed skill_seeds/* skill_invocation_seed_overlays/* capability_skill_seeds/*
var skillSeedFS embed.FS

const skillSeedVersion = "3.0.1"
const skillInvocationSeedVersion = "3.1.0"
const dynamicScriptSkillVersion = "3.2.0"

var systemSkillSeedStageKeys = []string{
	WorkflowSkillStageScript,
	WorkflowSkillStageArt,
	WorkflowSkillStageAssets,
	WorkflowSkillStageStoryboard,
	WorkflowSkillStageVideo,
	WorkflowSkillStageDelivery,
}

var workflowSkillSeedArtifacts = map[string]struct {
	Inputs  []string
	Outputs []string
}{
	WorkflowSkillStageScript:     {Inputs: []string{"source_text"}, Outputs: []string{"production_script"}},
	WorkflowSkillStageArt:        {Inputs: []string{"production_script"}, Outputs: []string{"asset_catalog"}},
	WorkflowSkillStageAssets:     {Inputs: []string{"asset_catalog"}, Outputs: []string{"asset_brief"}},
	WorkflowSkillStageStoryboard: {Inputs: []string{"production_script", "asset_catalog"}, Outputs: []string{"storyboard_package"}},
	WorkflowSkillStageVideo:      {Inputs: []string{"storyboard_package", "asset_catalog", "asset_rendition"}, Outputs: []string{"video_prompt_package"}},
	WorkflowSkillStageDelivery:   {Inputs: []string{"video_prompt_package"}, Outputs: []string{"delivery_report"}},
}

func EnsureSkillSeeds() error {
	seeds := []skillSeed{
		{WorkflowSkillStageScript, "剧本整理", "确认生产剧本并形成稳定输入。"},
		{WorkflowSkillStageArt, "资产提取", "从剧本证据提取角色、场景、道具和角色外观马甲。"},
		{WorkflowSkillStageAssets, "资产生图提示词", "把已批准资产转成一致、可执行的生图提示词。"},
		{WorkflowSkillStageStoryboard, "分镜拆解", "把生产剧本拆成 4–15 秒的可编辑结构化镜头。"},
		{WorkflowSkillStageVideo, "镜头提示词", "结合已确认分镜与实际参考图生成单镜头最终提示词。"},
		{WorkflowSkillStageDelivery, "成片交付", "审计生成结果、失败项、重试建议与导出清单。"},
	}
	for _, seed := range seeds {
		if err := ensureSkillSeed(seed); err != nil {
			return err
		}
	}
	return ensureCapabilitySkillSeeds()
}

func ensureSkillSeed(seed skillSeed) error {
	files, err := loadSkillSeedFiles(seed.StageKey)
	if err != nil {
		return err
	}
	legacyPackage, err := buildWorkflowSkillSeedPackage(seed.StageKey, files)
	if err != nil {
		return fmt.Errorf("normalize skill %s: %w", seed.StageKey, err)
	}
	invocationPackage, err := buildInvocationWorkflowSkillSeedPackage(seed.StageKey, files)
	if err != nil {
		return fmt.Errorf("normalize invocation skill %s: %w", seed.StageKey, err)
	}
	if err := validateWorkflowSkillSeedExample(invocationPackage); err != nil {
		return fmt.Errorf("evaluate invocation skill %s: %w", seed.StageKey, err)
	}
	stamp := now()
	skillID := "skill-system-workflow-" + seed.StageKey
	legacyVersionID := "skill-version-system-workflow-" + seed.StageKey + "-" + skillSeedVersion
	invocationVersionID := "skill-version-system-workflow-" + seed.StageKey + "-" + skillInvocationSeedVersion
	skill, exists, err := repository.GetSkillDefinition(skillID)
	if err != nil {
		return err
	}
	legacyVersion := publishedSeedSkillVersion(legacyVersionID, skillID, skillSeedVersion, stamp, legacyPackage)
	invocationVersion := publishedSeedSkillVersion(invocationVersionID, skillID, skillInvocationSeedVersion, stamp, invocationPackage)
	createdDefinition := !exists
	if !exists {
		skill = model.SkillDefinition{
			ID: skillID, Name: seed.Name, Summary: seed.Summary, OwnerType: model.SkillOwnerSystem,
			Enabled: true, CreatedAt: stamp, UpdatedAt: stamp,
		}
		if err := repository.CreateSkillAggregate(skill, legacyVersion); err != nil {
			return fmt.Errorf("seed skill %s: %w", seed.StageKey, err)
		}
	} else {
		if _, ok, err := repository.GetSkillVersion(legacyVersionID); err != nil {
			return err
		} else if !ok {
			if err := repository.CreateSkillVersion(legacyVersion); err != nil {
				return fmt.Errorf("seed skill version %s: %w", seed.StageKey, err)
			}
		}
	}
	if _, ok, err := repository.GetSkillVersion(invocationVersionID); err != nil {
		return err
	} else if !ok {
		if err := repository.CreateSkillVersion(invocationVersion); err != nil {
			return fmt.Errorf("seed invocation skill version %s: %w", seed.StageKey, err)
		}
	}
	if err := ensureSeedSkillEvaluation("skill-evaluation-system-workflow-"+seed.StageKey+"-"+skillInvocationSeedVersion, invocationVersionID, invocationPackage.ContentHash, stamp); err != nil {
		return fmt.Errorf("seed invocation skill evaluation %s: %w", seed.StageKey, err)
	}
	if seed.StageKey == WorkflowSkillStageScript {
		if err := ensureDynamicScriptSkillVersion(skillID, invocationPackage, stamp); err != nil {
			return fmt.Errorf("seed dynamic script skill: %w", err)
		}
	}
	passed, err := repository.HasPassingSkillEvaluation(invocationVersionID, invocationPackage.ContentHash)
	if err != nil {
		return err
	}
	if passed && createdDefinition {
		skill.Name = seed.Name
		skill.Summary = seed.Summary
		skill.OwnerUserID = ""
		skill.Enabled = true
		skill.RecommendedVersionID = invocationVersionID
		skill.UpdatedAt = stamp
		if err := repository.SaveSkillDefinition(skill); err != nil {
			return err
		}
	}
	binding, bound, err := repository.ResolveWorkflowStageSkillBinding(seed.StageKey, "")
	if err != nil {
		return err
	}
	if bound && !strings.HasPrefix(binding.SkillVersionID, "skill-version-system-workflow-"+seed.StageKey+"-") {
		return nil
	}
	return repository.UpsertWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{
		ID: "workflow-skill-binding-global-" + seed.StageKey, StageKey: seed.StageKey, Scope: model.WorkflowStageSkillScopeGlobal,
		SkillVersionID: legacyVersionID, CreatedAt: stamp, UpdatedAt: stamp,
	})
}

func ensureDynamicScriptSkillVersion(skillID string, base SkillPackage, stamp string) error {
	content, err := skillSeedFS.ReadFile("skill_seeds/script/dynamic-script-3.2.0.md")
	if err != nil {
		return err
	}
	files := make(map[string]string, len(base.Files))
	for path, value := range base.Files {
		files[path] = value
	}
	files["SKILL.md"] = string(content)
	base.Files = files
	packageValue, err := ValidateInvocableSkillPackage(base)
	if err != nil {
		return err
	}
	versionID := "skill-version-system-workflow-script-" + dynamicScriptSkillVersion
	if _, exists, err := repository.GetSkillVersion(versionID); err != nil {
		return err
	} else if !exists {
		if err := repository.CreateSkillVersion(publishedSeedSkillVersion(versionID, skillID, dynamicScriptSkillVersion, stamp, packageValue)); err != nil {
			return err
		}
	}
	return ensureSeedSkillEvaluation("skill-evaluation-system-workflow-script-"+dynamicScriptSkillVersion, versionID, packageValue.ContentHash, stamp)
}

func ensureSeedSkillEvaluation(evaluationID, versionID, contentHash, stamp string) error {
	if _, ok, err := repository.GetSkillEvaluation(evaluationID); err != nil {
		return err
	} else if ok {
		return nil
	}
	return repository.CreateSkillEvaluation(model.SkillEvaluation{
		ID: evaluationID, SkillVersionID: versionID, ContentHash: contentHash,
		InputHash: "embedded-good-output", ResultJSON: `{"source":"embedded-good-output"}`,
		GateJSON: `{"schema":"passed"}`, Status: "passed", CreatedBy: "system", CreatedAt: stamp, UpdatedAt: stamp,
	})
}

func publishedSeedSkillVersion(id, skillID, versionName, stamp string, packageValue SkillPackage) model.SkillVersion {
	version := skillVersionFromPackage(id, skillID, versionName, "system", stamp, packageValue)
	version.Status = model.SkillVersionPublished
	version.PublishedAt = stamp
	return version
}

func validateWorkflowSkillSeedExample(packageValue SkillPackage) error {
	example := strings.TrimSpace(packageValue.Files["examples/good-output.json"])
	if example == "" {
		return fmt.Errorf("缺少 good-output 示例")
	}
	schema, err := compileSkillOutputSchema(packageValue.OutputContract)
	if err != nil {
		return err
	}
	var value any
	if err := json.Unmarshal([]byte(example), &value); err != nil {
		return err
	}
	return schema.Validate(value)
}

func loadSkillSeedFiles(stageKey string) (map[string]string, error) {
	if !workflowSkillStages[stageKey] {
		return nil, fmt.Errorf("未知 Workflow Skill 阶段 %q", stageKey)
	}
	prefix := "skill_seeds/" + stageKey
	files := map[string]string{}
	err := fs.WalkDir(skillSeedFS, prefix, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		if stageKey == WorkflowSkillStageScript && path == prefix+"/dynamic-script-3.2.0.md" {
			return nil
		}
		content, err := skillSeedFS.ReadFile(path)
		if err != nil {
			return err
		}
		files[strings.TrimPrefix(path, prefix+"/")] = string(content)
		return nil
	})
	return files, err
}

func buildWorkflowSkillSeedPackage(stageKey string, files map[string]string) (SkillPackage, error) {
	return buildWorkflowSkillSeedPackageForSource(stageKey, files, "")
}

func buildWorkflowSkillSeedPackageForSource(stageKey string, files map[string]string, sourceKind string) (SkillPackage, error) {
	legacy := workflowSkillSeedContract(stageKey)
	artifacts := workflowSkillSeedArtifacts[stageKey]
	gate := map[string]string{
		WorkflowSkillStageScript: "script", WorkflowSkillStageArt: "art", WorkflowSkillStageAssets: "media",
		WorkflowSkillStageStoryboard: "storyboard", WorkflowSkillStageVideo: "media", WorkflowSkillStageDelivery: "delivery",
	}[stageKey]
	compatibility := make(map[string]string, len(artifacts.Inputs))
	for _, artifactType := range artifacts.Inputs {
		compatibility[artifactType] = ">=1.0 <2.0"
	}
	costClass := "text_high"
	if stageKey == WorkflowSkillStageDelivery {
		costClass = "none"
	}
	return NormalizeSkillPackage(SkillPackage{
		Manifest: SkillManifest{
			Capabilities: []string{"workflow.stage." + stageKey}, InputArtifactTypes: artifacts.Inputs,
			OutputArtifactTypes: artifacts.Outputs, SchemaCompatibility: compatibility,
			SideEffects: []string{"none"}, EstimatedCostClass: costClass,
		},
		Files: files,
		InputContract: SkillInputContract{
			RequiredInputs: legacy.RequiredInputs,
			ImagePolicy: SkillImagePolicy{
				Required: legacy.ImagePolicy.Required, Min: legacy.ImagePolicy.Min, Max: legacy.ImagePolicy.Max,
				AllowTextFallback: legacy.ImagePolicy.AllowTextFallback, AllowedTypes: legacy.ImagePolicy.AllowedTypes,
			},
		},
		OutputContract:     SkillOutputContract{SchemaVersion: legacy.OutputSchemaVersion, Schema: legacy.OutputSchema},
		QualityGateProfile: []string{"schema", gate},
		sourceKind:         sourceKind,
	})
}

func buildInvocationWorkflowSkillSeedPackage(stageKey string, files map[string]string) (SkillPackage, error) {
	return buildInvocationWorkflowSkillSeedPackageForSource(stageKey, files, "")
}

func buildInvocationWorkflowSkillSeedPackageForSource(stageKey string, files map[string]string, sourceKind string) (SkillPackage, error) {
	packageValue, err := buildWorkflowSkillSeedPackageForSource(stageKey, files, sourceKind)
	if err != nil {
		return SkillPackage{}, err
	}
	packageValue.Files, err = loadInvocationSkillSeedFiles(stageKey, packageValue.Files)
	if err != nil {
		return SkillPackage{}, err
	}
	packageValue.Manifest.ExecutorKind = "text_model"
	packageValue.Manifest.RequiredTools = []string{}
	packageValue.InputContract.ArtifactInputs = make([]ArtifactInputSpec, 0, len(packageValue.Manifest.InputArtifactTypes))
	for _, artifactType := range packageValue.Manifest.InputArtifactTypes {
		spec := ArtifactInputSpec{
			BindingName: artifactType, ArtifactType: artifactType, Required: true,
			Min: 1, Max: 1, SchemaConstraint: packageValue.Manifest.SchemaCompatibility[artifactType],
		}
		if stageKey == WorkflowSkillStageVideo && artifactType == "asset_rendition" {
			spec.Required, spec.Min, spec.Max = false, 0, 9
		}
		packageValue.InputContract.ArtifactInputs = append(packageValue.InputContract.ArtifactInputs, spec)
	}
	packageValue.OutputContract.ArtifactOutputs = make([]ArtifactOutputSpec, 0, len(packageValue.Manifest.OutputArtifactTypes))
	for _, artifactType := range packageValue.Manifest.OutputArtifactTypes {
		coreSchema, err := loadCoreArtifactSchema(artifactType)
		if err != nil {
			return SkillPackage{}, err
		}
		packageValue.OutputContract.SchemaVersion = coreSchema.Version
		packageValue.OutputContract.Schema = coreSchema.Schema
		maxOutputs := 1
		if stageKey == WorkflowSkillStageAssets && artifactType == "asset_brief" {
			maxOutputs = 300
		}
		packageValue.OutputContract.ArtifactOutputs = append(packageValue.OutputContract.ArtifactOutputs, ArtifactOutputSpec{
			BindingName: artifactType, ArtifactType: artifactType, Min: 1, Max: maxOutputs,
			SchemaVersion: coreSchema.Version,
		})
	}
	return ValidateInvocableSkillPackage(packageValue)
}

func loadInvocationSkillSeedFiles(stageKey string, base map[string]string) (map[string]string, error) {
	files := make(map[string]string, len(base))
	for path, content := range base {
		files[path] = content
	}
	if stageKey != WorkflowSkillStageArt && stageKey != WorkflowSkillStageAssets && stageKey != WorkflowSkillStageVideo {
		return files, nil
	}
	prefix := "skill_invocation_seed_overlays/" + stageKey
	err := fs.WalkDir(skillSeedFS, prefix, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		content, err := skillSeedFS.ReadFile(path)
		if err != nil {
			return err
		}
		files[strings.TrimPrefix(path, prefix+"/")] = string(content)
		return nil
	})
	return files, err
}
