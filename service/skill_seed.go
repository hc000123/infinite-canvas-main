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

//go:embed skill_seeds/*
var skillSeedFS embed.FS

const skillSeedVersion = "3.0.1"

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
	return nil
}

func ensureSkillSeed(seed skillSeed) error {
	files, err := loadSkillSeedFiles(seed.StageKey)
	if err != nil {
		return err
	}
	packageValue, err := buildWorkflowSkillSeedPackage(seed.StageKey, files)
	if err != nil {
		return fmt.Errorf("normalize skill %s: %w", seed.StageKey, err)
	}
	manifestJSON, _ := json.Marshal(packageValue.Manifest)
	filesJSON, _ := json.Marshal(packageValue.Files)
	inputJSON, _ := json.Marshal(packageValue.InputContract)
	outputJSON, _ := json.Marshal(packageValue.OutputContract)
	gatesJSON, _ := json.Marshal(packageValue.QualityGateProfile)
	stamp := now()
	skillID := "skill-system-workflow-" + seed.StageKey
	versionID := "skill-version-system-workflow-" + seed.StageKey + "-" + skillSeedVersion
	skill, exists, err := repository.GetSkillDefinition(skillID)
	if err != nil {
		return err
	}
	version := model.SkillVersion{
		ID: versionID, SkillID: skillID, Version: skillSeedVersion, Status: model.SkillVersionPublished,
		ManifestJSON: string(manifestJSON), FilesJSON: string(filesJSON), InputContractJSON: string(inputJSON),
		OutputContractJSON: string(outputJSON), QualityGateProfileJSON: string(gatesJSON), ContentHash: packageValue.ContentHash,
		CreatedBy: "system", PublishedAt: stamp, CreatedAt: stamp, UpdatedAt: stamp,
	}
	if !exists {
		skill = model.SkillDefinition{ID: skillID, Name: seed.Name, Summary: seed.Summary, OwnerType: model.SkillOwnerSystem, Enabled: true, RecommendedVersionID: versionID, CreatedAt: stamp, UpdatedAt: stamp}
		if err := repository.CreateSkillAggregate(skill, version); err != nil {
			return fmt.Errorf("seed skill %s: %w", seed.StageKey, err)
		}
	} else {
		if _, ok, err := repository.GetSkillVersion(versionID); err != nil {
			return err
		} else if !ok {
			if err := repository.CreateSkillVersion(version); err != nil {
				return fmt.Errorf("seed skill version %s: %w", seed.StageKey, err)
			}
		}
		if skill.RecommendedVersionID == "" || strings.HasPrefix(skill.RecommendedVersionID, "skill-version-system-workflow-"+seed.StageKey+"-") {
			skill.Name = seed.Name
			skill.Summary = seed.Summary
			skill.Enabled = true
			skill.RecommendedVersionID = versionID
			skill.UpdatedAt = stamp
			if err := repository.SaveSkillDefinition(skill); err != nil {
				return err
			}
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
		ID: "workflow-skill-binding-global-" + seed.StageKey, StageKey: seed.StageKey, Scope: model.WorkflowSkillScopeGlobal,
		SkillVersionID: versionID, CreatedAt: stamp, UpdatedAt: stamp,
	})
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
	})
}
