package service

import (
	"encoding/json"
	"fmt"

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

func EnsureWorkflowSkillSeeds() error {
	seeds := []workflowSkillSeed{
		{WorkflowSkillStageScript, "剧本整理", "确认生产剧本并形成稳定输入。", "保持剧情事实、人物关系和场次顺序，输出可审核的生产剧本结构。", "script"},
		{WorkflowSkillStageArt, "美术设计", "提取角色、场景和道具视觉设定。", "从已确认剧本提取角色、场景、道具；为每项生成稳定 ID、名称、类型和可执行图像提示词。", "art"},
		{WorkflowSkillStageAssets, "素材准备", "检查参考素材完整性和版本。", "按角色、场景、道具顺序核对素材，保留资产 ID、版本和哈希；缺图时明确阻断或标注文本降级。", "media"},
		{WorkflowSkillStageStoryboard, "分镜提示词", "结合剧本和参考图片制作视频提示词。", "先理解输入图片中的人物外观、空间关系、光线和关键道具，再结合剧本制作结构化分镜与 Seedance 提示词；引用图片必须从 @图1 开始。", "storyboard"},
		{WorkflowSkillStageVideo, "视频生成", "校验最小视频生成参数和提交条件。", "根据已审核分镜形成视频任务参数；模型、时长、分辨率、声音和费用必须在提交前明确展示。", "media"},
		{WorkflowSkillStageDelivery, "成片交付", "检查生成结果、失败项与导出清单。", "汇总视频结果、失败原因、重试建议和导出清单，不绕过人工确认与质量门。", "delivery"},
	}
	for _, seed := range seeds {
		if _, ok, err := repository.FindWorkflowSkillByStage(seed.StageKey); err != nil {
			return err
		} else if ok {
			continue
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
		skill := model.WorkflowSkill{ID: "workflow-skill-" + seed.StageKey, Name: seed.Name, Description: seed.Description, StageKey: seed.StageKey, Enabled: true, CreatedAt: stamp, UpdatedAt: stamp}
		version := model.WorkflowSkillVersion{ID: "workflow-skill-version-" + seed.StageKey + "-1.0.0", SkillID: skill.ID, Version: "1.0.0", Status: model.WorkflowSkillVersionPublished, FilesJSON: string(filesJSON), ContractJSON: string(contractJSON), ContentHash: packageValue.ContentHash, CreatedBy: "system", PublishedAt: stamp, CreatedAt: stamp, UpdatedAt: stamp}
		if err := repository.CreateWorkflowSkillAggregate(skill, version); err != nil {
			return fmt.Errorf("seed workflow skill %s: %w", seed.StageKey, err)
		}
		if err := repository.UpsertWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{ID: "workflow-skill-binding-global-" + seed.StageKey, StageKey: seed.StageKey, Scope: model.WorkflowSkillScopeGlobal, SkillVersionID: version.ID, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
			return err
		}
	}
	return nil
}
