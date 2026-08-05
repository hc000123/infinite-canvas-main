package service

import (
	"fmt"
	"io/fs"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const capabilitySkillSeedVersion = "1.0.0"

type capabilitySkillSeed struct {
	Key                string
	Name               string
	Summary            string
	Capabilities       []string
	ProjectTags        []string
	Inputs             []ArtifactInputSpec
	Output             ArtifactOutputSpec
	ExecutorKind       string
	SideEffects        []string
	EstimatedCostClass string
}

func ensureCapabilitySkillSeeds() error {
	for _, seed := range capabilitySkillSeeds() {
		if err := ensureCapabilitySkillSeed(seed); err != nil {
			return err
		}
	}
	return nil
}

func capabilitySkillSeeds() []capabilitySkillSeed {
	return []capabilitySkillSeed{
		{
			Key: "content-classifier", Name: "内容标签分类", Summary: "从已批准生产剧本提取受众、题材、叙事机制与制作路由标签。",
			Capabilities: []string{"content.classify"}, Inputs: []ArtifactInputSpec{capabilitySeedInput("production_script")}, Output: capabilitySeedOutput("content_profile", 1),
		},
		{
			Key: "asset-brief-character", Name: "角色资产设定图 Brief", Summary: "把角色与服装事实编译为身份稳定的角色设定图制作 Brief。",
			Capabilities: []string{"asset.brief.compose", "asset.character.brief"}, ProjectTags: []string{"character"}, Inputs: []ArtifactInputSpec{capabilitySeedInput("asset_catalog")}, Output: capabilitySeedOutput("asset_brief", 300),
		},
		{
			Key: "asset-brief-scene", Name: "场景资产主参考图 Brief", Summary: "把场景事实编译为空间清晰、可复用的场景主参考图制作 Brief。",
			Capabilities: []string{"asset.brief.compose", "asset.scene.brief"}, ProjectTags: []string{"scene"}, Inputs: []ArtifactInputSpec{capabilitySeedInput("asset_catalog")}, Output: capabilitySeedOutput("asset_brief", 300),
		},
		{
			Key: "asset-brief-prop", Name: "道具资产结构图 Brief", Summary: "把道具事实编译为结构、材质与尺度明确的道具制作 Brief。",
			Capabilities: []string{"asset.brief.compose", "asset.prop.brief"}, ProjectTags: []string{"prop"}, Inputs: []ArtifactInputSpec{capabilitySeedInput("asset_catalog")}, Output: capabilitySeedOutput("asset_brief", 300),
		},
		{
			Key: "asset-rendition-character", Name: "角色资产成图", Summary: "把已批准的角色资产 Brief 生成为可复用的角色设定图资产。",
			Capabilities: []string{"asset.rendition.generate", "asset.character.rendition"}, ProjectTags: []string{"character"}, Inputs: []ArtifactInputSpec{capabilitySeedInput("asset_brief")}, Output: capabilitySeedOutput("asset_rendition", 4),
			ExecutorKind: "image_model", SideEffects: []string{"image_generation"}, EstimatedCostClass: "image",
		},
		{
			Key: "asset-rendition-scene", Name: "场景资产成图", Summary: "把已批准的场景资产 Brief 生成为空间稳定的场景主参考图资产。",
			Capabilities: []string{"asset.rendition.generate", "asset.scene.rendition"}, ProjectTags: []string{"scene"}, Inputs: []ArtifactInputSpec{capabilitySeedInput("asset_brief")}, Output: capabilitySeedOutput("asset_rendition", 4),
			ExecutorKind: "image_model", SideEffects: []string{"image_generation"}, EstimatedCostClass: "image",
		},
		{
			Key: "asset-rendition-prop", Name: "道具资产成图", Summary: "把已批准的道具资产 Brief 生成为结构和材质明确的道具参考图资产。",
			Capabilities: []string{"asset.rendition.generate", "asset.prop.rendition"}, ProjectTags: []string{"prop"}, Inputs: []ArtifactInputSpec{capabilitySeedInput("asset_brief")}, Output: capabilitySeedOutput("asset_rendition", 4),
			ExecutorKind: "image_model", SideEffects: []string{"image_generation"}, EstimatedCostClass: "image",
		},
		{
			Key: "storyboard-vertical-short", Name: "竖屏短剧分镜", Summary: "面向 9:16 短剧节奏、近景表演和移动端信息密度制作分镜。",
			Capabilities: []string{"storyboard.compose", "storyboard.vertical.short"}, ProjectTags: []string{"short_drama", "vertical"}, Inputs: capabilityStoryboardInputs(), Output: capabilitySeedOutput("storyboard_package", 1),
		},
		{
			Key: "storyboard-horizontal-long", Name: "横屏中长剧分镜", Summary: "面向 16:9 中长剧的空间调度、场面连续性和叙事留白制作分镜。",
			Capabilities: []string{"storyboard.compose", "storyboard.horizontal.long"}, ProjectTags: []string{"horizontal", "long_form"}, Inputs: capabilityStoryboardInputs(), Output: capabilitySeedOutput("storyboard_package", 1),
		},
	}
}

func capabilitySeedInput(artifactType string) ArtifactInputSpec {
	return ArtifactInputSpec{BindingName: artifactType, ArtifactType: artifactType, Required: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0", RequiresApproval: true}
}

func capabilitySeedOutput(artifactType string, maxOutputs int) ArtifactOutputSpec {
	return ArtifactOutputSpec{BindingName: artifactType, ArtifactType: artifactType, Min: 1, Max: maxOutputs, SchemaVersion: coreArtifactSchemaVersion}
}

func capabilityStoryboardInputs() []ArtifactInputSpec {
	return []ArtifactInputSpec{capabilitySeedInput("production_script"), capabilitySeedInput("asset_catalog"), capabilitySeedInput("content_profile")}
}

func ensureCapabilitySkillSeed(seed capabilitySkillSeed) error {
	files, err := loadCapabilitySkillSeedFiles(seed.Key)
	if err != nil {
		return err
	}
	packageValue, err := buildCapabilitySkillPackage(seed, files)
	if err != nil {
		return fmt.Errorf("normalize capability skill %s: %w", seed.Key, err)
	}
	if err := validateWorkflowSkillSeedExample(packageValue); err != nil {
		return fmt.Errorf("evaluate capability skill %s: %w", seed.Key, err)
	}
	stamp := now()
	skillID := "skill-system-" + seed.Key
	versionID := "skill-version-system-" + seed.Key + "-" + capabilitySkillSeedVersion
	version := publishedSeedSkillVersion(versionID, skillID, capabilitySkillSeedVersion, stamp, packageValue)
	skill, exists, err := repository.GetSkillDefinition(skillID)
	if err != nil {
		return err
	}
	createdDefinition := !exists
	if !exists {
		skill = model.SkillDefinition{ID: skillID, Name: seed.Name, Summary: seed.Summary, OwnerType: model.SkillOwnerSystem, Enabled: true, CreatedAt: stamp, UpdatedAt: stamp}
		if err := repository.CreateSkillAggregate(skill, version); err != nil {
			return err
		}
	} else if _, ok, err := repository.GetSkillVersion(versionID); err != nil {
		return err
	} else if !ok {
		if err := repository.CreateSkillVersion(version); err != nil {
			return err
		}
	}
	evaluationID := "skill-evaluation-system-" + seed.Key + "-" + capabilitySkillSeedVersion
	if _, ok, err := repository.GetSkillEvaluation(evaluationID); err != nil {
		return err
	} else if !ok {
		evaluation := model.SkillEvaluation{ID: evaluationID, SkillVersionID: versionID, ContentHash: packageValue.ContentHash, InputHash: "embedded-good-output", ResultJSON: `{"source":"embedded-good-output"}`, GateJSON: `{"schema":"passed"}`, Status: "passed", CreatedBy: "system", CreatedAt: stamp, UpdatedAt: stamp}
		if err := repository.CreateSkillEvaluation(evaluation); err != nil {
			return err
		}
	}
	if createdDefinition {
		skill.Name, skill.Summary, skill.OwnerUserID, skill.Enabled, skill.RecommendedVersionID, skill.UpdatedAt = seed.Name, seed.Summary, "", true, versionID, stamp
		return repository.SaveSkillDefinition(skill)
	}
	return nil
}

func buildCapabilitySkillPackage(seed capabilitySkillSeed, files map[string]string) (SkillPackage, error) {
	if seed.ExecutorKind == "" {
		seed.ExecutorKind = "text_model"
	}
	if len(seed.SideEffects) == 0 {
		seed.SideEffects = []string{"none"}
	}
	if seed.EstimatedCostClass == "" {
		seed.EstimatedCostClass = "text_high"
	}
	coreSchema, err := loadCoreArtifactSchema(seed.Output.ArtifactType)
	if err != nil {
		return SkillPackage{}, err
	}
	inputTypes, compatibility := make([]string, 0, len(seed.Inputs)), map[string]string{}
	for _, input := range seed.Inputs {
		inputTypes = append(inputTypes, input.ArtifactType)
		compatibility[input.ArtifactType] = input.SchemaConstraint
	}
	return ValidateInvocableSkillPackage(SkillPackage{
		Manifest: SkillManifest{
			Capabilities: seed.Capabilities, InputArtifactTypes: inputTypes, OutputArtifactTypes: []string{seed.Output.ArtifactType}, ProjectTags: seed.ProjectTags,
			SchemaCompatibility: compatibility, SideEffects: seed.SideEffects, EstimatedCostClass: seed.EstimatedCostClass, ExecutorKind: seed.ExecutorKind, RequiredTools: []string{},
		},
		Files:              files,
		InputContract:      SkillInputContract{RequiredInputs: []string{"artifacts"}, ArtifactInputs: seed.Inputs, ImagePolicy: SkillImagePolicy{AllowTextFallback: true}},
		OutputContract:     SkillOutputContract{SchemaVersion: coreSchema.Version, Schema: coreSchema.Schema, ArtifactOutputs: []ArtifactOutputSpec{seed.Output}},
		QualityGateProfile: capabilitySeedGates(seed.Output.ArtifactType),
	})
}

func capabilitySeedGates(artifactType string) []string {
	switch artifactType {
	case "asset_brief", "asset_rendition":
		return []string{"schema", "asset"}
	case "storyboard_package":
		return []string{"schema", "storyboard"}
	default:
		return []string{"schema"}
	}
}

func loadCapabilitySkillSeedFiles(key string) (map[string]string, error) {
	prefix := "capability_skill_seeds/" + key
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
