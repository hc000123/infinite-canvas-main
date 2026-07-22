package service

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type workflowSkillSeed struct {
	StageKey    string
	Name        string
	Description string
	Instruction string
	Gate        string
}

const workflowSkillSeedVersion = "2.0.1"

func EnsureWorkflowSkillSeeds() error {
	seeds := []workflowSkillSeed{
		{WorkflowSkillStageScript, "剧本整理", "确认生产剧本并形成稳定输入。", "保持剧情事实、人物关系和场次顺序，输出可审核的生产剧本结构。", "script"},
		{WorkflowSkillStageArt, "资产提取", "只从剧本提取角色、场景、道具和服装描述。", "只提取剧本已有资产事实和证据，为每项生成稳定 logicalAssetId；ID 必须严格使用 CHAR-001/SCENE-001/PROP-001/COSTUME-001 格式，连字符不得省略；kind 只能是 character/scene/prop/costume。不生成生图提示词，不猜测剧本未提供的外观。", "art"},
		{WorkflowSkillStageAssets, "资产生图提示词", "把已批准资产描述转成逐项可执行生图提示词。", "逐项保留 logicalAssetId、kind、name、scriptEvidence 和 description，新增 imagePrompt 与 status=ready，不得遗漏、合并或重编号。", "media"},
		{WorkflowSkillStageStoryboard, "分镜拆解", "把原剧本拆成可编辑、可确认的结构化镜头。", "只生成 shots[].shotId/sceneKey/sourceScript/shotDraft，不生成最终视频提示词；每镜必须保留对应原剧本和可编辑镜头字段。", "storyboard"},
		{WorkflowSkillStageVideo, "镜头提示词", "结合已确认分镜与实际参考图生成单镜头视频提示词。", "先理解参考图片，再结合原剧本和已确认 shotDraft 生成单镜头最终提示词；上一镜尾帧只能作为 continuity_reference，不得当作首帧复刻。", "media"},
		{WorkflowSkillStageDelivery, "成片交付", "检查生成结果、失败项与导出清单。", "汇总视频结果、失败原因、重试建议和导出清单，不绕过人工确认与质量门。", "delivery"},
	}
	for _, seed := range seeds {
		skill, exists, err := repository.FindWorkflowSkillByStage(seed.StageKey)
		if err != nil {
			return err
		}
		contract := WorkflowSkillContract{
			RequiredInputs: []string{"workflow", "upstreamArtifact"}, OutputSchemaVersion: "1.0.0",
			OutputSchema: map[string]any{"type": "object"}, QualityGateProfile: []string{"schema", seed.Gate},
			ApplyTargets: []string{seed.StageKey},
		}
		contract.ImagePolicy.Max = 9
		contract.ImagePolicy.AllowedTypes = []string{"image/png", "image/jpeg", "image/webp"}
		contract.ImagePolicy.AllowTextFallback = true
		packageValue, err := NormalizeWorkflowSkillPackage(map[string]string{"SKILL.md": seed.Instruction}, contract)
		if err != nil {
			return err
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
