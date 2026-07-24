package service

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/santhosh-tekuri/jsonschema/v5"
)

var workflowSkillRequiredInputs = map[string]bool{
	"workflow": true, "script": true, "upstreamArtifact": true, "shotContext": true, "referenceImages": true,
}

var workflowSkillAllowedGates = map[string]bool{
	"schema": true, "script": true, "art": true, "storyboard": true, "media": true, "delivery": true,
}

var workflowSkillRequiredGateByTarget = map[string]string{
	WorkflowSkillStageScript: "script", WorkflowSkillStageArt: "art", WorkflowSkillStageAssets: "media",
	WorkflowSkillStageStoryboard: "storyboard", WorkflowSkillStageVideo: "media", WorkflowSkillStageDelivery: "delivery",
}

var workflowSkillAllowedImageTypes = map[string]bool{
	"image/png": true, "image/jpeg": true, "image/webp": true,
}

func validateWorkflowSkillContract(contract WorkflowSkillContract) error {
	if len(contract.RequiredInputs) == 0 {
		return safeMessageError{message: "Skill 必须声明必需输入"}
	}
	if contract.ImagePolicy.Min < 0 || contract.ImagePolicy.Max < contract.ImagePolicy.Min || contract.ImagePolicy.Max > 9 {
		return safeMessageError{message: "图片契约必须限制在 0–9 张"}
	}
	if contract.ImagePolicy.Required && (contract.ImagePolicy.Min == 0 || contract.ImagePolicy.AllowTextFallback) {
		return safeMessageError{message: "必需图片契约必须设置最少图片且禁止无图降级"}
	}
	seenInputs := map[string]bool{}
	for _, name := range contract.RequiredInputs {
		name = strings.TrimSpace(name)
		if !workflowSkillRequiredInputs[name] || seenInputs[name] {
			return safeMessageError{message: "存在未知或重复的必需输入"}
		}
		seenInputs[name] = true
	}
	if seenInputs["referenceImages"] && (contract.ImagePolicy.Min == 0 || contract.ImagePolicy.AllowTextFallback) {
		return safeMessageError{message: "必需参考图输入必须设置最少图片且禁止无图降级"}
	}
	seenTypes := map[string]bool{}
	for _, mimeType := range contract.ImagePolicy.AllowedTypes {
		mimeType = strings.TrimSpace(mimeType)
		if !workflowSkillAllowedImageTypes[mimeType] || seenTypes[mimeType] {
			return safeMessageError{message: "存在未知或重复的图片格式"}
		}
		seenTypes[mimeType] = true
	}
	if contract.ImagePolicy.Max > 0 && len(seenTypes) == 0 {
		return safeMessageError{message: "允许图片时必须声明图片格式"}
	}
	if !strings.HasPrefix(strings.TrimSpace(contract.OutputSchemaVersion), "1.") {
		return safeMessageError{message: "当前仅支持 1.x 输出契约"}
	}
	if _, err := compileWorkflowSkillSchema(contract); err != nil {
		return safeMessageError{message: "输出 Schema 无效：" + err.Error()}
	}
	seenGates := map[string]bool{}
	for _, gate := range contract.QualityGateProfile {
		gate = strings.TrimSpace(gate)
		if !workflowSkillAllowedGates[gate] || seenGates[gate] {
			return safeMessageError{message: "存在未知或重复的质量门"}
		}
		seenGates[gate] = true
	}
	if !seenGates["schema"] {
		return safeMessageError{message: "Skill 必须启用 Schema 质量门"}
	}
	if len(contract.ApplyTargets) == 0 {
		return safeMessageError{message: "Skill 必须声明写入目标"}
	}
	seenTargets := map[string]bool{}
	for _, target := range contract.ApplyTargets {
		target = strings.TrimSpace(target)
		if !workflowSkillStages[target] || seenTargets[target] {
			return safeMessageError{message: "存在未知或重复的写入目标"}
		}
		seenTargets[target] = true
		if !seenGates[workflowSkillRequiredGateByTarget[target]] {
			return safeMessageError{message: "Skill 不能关闭当前阶段硬质量门"}
		}
	}
	return nil
}

func compileWorkflowSkillSchema(contract WorkflowSkillContract) (*jsonschema.Schema, error) {
	if len(contract.OutputSchema) == 0 {
		return nil, fmt.Errorf("缺少输出 Schema")
	}
	raw, err := json.Marshal(contract.OutputSchema)
	if err != nil {
		return nil, err
	}
	return jsonschema.CompileString("workflow-skill-schema.json", string(raw))
}

func appendWorkflowSkillSchemaIssues(content []byte, contract WorkflowSkillContract, report *WorkflowGateReport) {
	schema, err := compileWorkflowSkillSchema(contract)
	if err != nil {
		report.add("output_schema", "输出 Schema 无效："+err.Error(), "")
		return
	}
	var value any
	if err := json.Unmarshal(content, &value); err != nil {
		report.add("output_schema", "产物无法按输出 Schema 校验："+err.Error(), "")
		return
	}
	if err := schema.Validate(value); err != nil {
		report.add("output_schema", "产物不符合输出 Schema："+err.Error(), "")
	}
}

func validateWorkflowSkillRuntimeInput(userID string, detail WorkflowRunDetail, stageID string, inputArtifact model.WorkflowArtifact, input WorkflowStageStartInput, contract WorkflowSkillContract) error {
	for _, name := range contract.RequiredInputs {
		switch name {
		case "workflow":
			if strings.TrimSpace(detail.Run.ID) == "" {
				return safeMessageError{message: "当前 Skill 缺少工作流输入"}
			}
		case "script":
			if strings.TrimSpace(detail.Run.ScriptSnapshot) == "" {
				return safeMessageError{message: "当前 Skill 缺少剧本输入"}
			}
		case "upstreamArtifact":
			if strings.TrimSpace(inputArtifact.ID) == "" || strings.TrimSpace(inputArtifact.ContentJSON) == "" {
				return safeMessageError{message: "当前 Skill 缺少上游产物"}
			}
		case "shotContext":
			context := strings.TrimSpace(string(input.Context))
			if context == "" || context == "null" {
				return safeMessageError{message: "当前 Skill 缺少镜头上下文"}
			}
		case "referenceImages":
			if strings.TrimSpace(input.MediaBatchID) == "" {
				return safeMessageError{message: "当前 Skill 缺少参考图片输入"}
			}
		}
	}
	batchID := strings.TrimSpace(input.MediaBatchID)
	if batchID == "" {
		if contract.ImagePolicy.Required || contract.ImagePolicy.Min > 0 {
			minimum := contract.ImagePolicy.Min
			if minimum < 1 {
				minimum = 1
			}
			return safeMessageError{message: fmt.Sprintf("当前 Skill 至少需要 %d 张参考图片", minimum)}
		}
		if contract.ImagePolicy.Max > 0 && !contract.ImagePolicy.AllowTextFallback {
			return safeMessageError{message: "当前 Skill 不允许无图降级"}
		}
		return nil
	}
	batch, err := GetUserWorkflowMediaBatch(userID, batchID)
	if err != nil {
		return err
	}
	if batch.Batch.WorkflowRunID != detail.Run.ID || batch.Batch.StageID != stageID || batch.Batch.Status != model.WorkflowMediaBatchOpen {
		return safeMessageError{message: "参考图片批次与当前工作流阶段不匹配"}
	}
	count := len(batch.Items)
	if count < contract.ImagePolicy.Min {
		return safeMessageError{message: fmt.Sprintf("当前 Skill 至少需要 %d 张参考图片", contract.ImagePolicy.Min)}
	}
	if count > contract.ImagePolicy.Max {
		return safeMessageError{message: fmt.Sprintf("当前 Skill 最多允许 %d 张参考图片", contract.ImagePolicy.Max)}
	}
	allowedTypes := map[string]bool{}
	for _, mimeType := range contract.ImagePolicy.AllowedTypes {
		allowedTypes[mimeType] = true
	}
	for _, item := range batch.Items {
		if !allowedTypes[item.MIME] {
			return safeMessageError{message: "参考图片包含当前 Skill 不允许的格式"}
		}
	}
	return nil
}

func workflowSkillContractFromSnapshot(snapshotJSON string) (WorkflowSkillContract, error) {
	var snapshot struct {
		Contract WorkflowSkillContract `json:"contract"`
	}
	if json.Unmarshal([]byte(snapshotJSON), &snapshot) != nil {
		return WorkflowSkillContract{}, safeMessageError{message: "原任务 Skill 快照损坏"}
	}
	if err := validateWorkflowSkillContract(snapshot.Contract); err != nil {
		return WorkflowSkillContract{}, err
	}
	return snapshot.Contract, nil
}
