package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"path"
	"sort"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const (
	WorkflowSkillStageScript     = "script"
	WorkflowSkillStageArt        = "art"
	WorkflowSkillStageAssets     = "assets"
	WorkflowSkillStageStoryboard = "storyboard"
	WorkflowSkillStageVideo      = "video"
	WorkflowSkillStageDelivery   = "delivery"
)

var workflowSkillStages = map[string]bool{
	WorkflowSkillStageScript: true, WorkflowSkillStageArt: true, WorkflowSkillStageAssets: true,
	WorkflowSkillStageStoryboard: true, WorkflowSkillStageVideo: true, WorkflowSkillStageDelivery: true,
}

type WorkflowSkillContract struct {
	RequiredInputs []string `json:"requiredInputs"`
	ImagePolicy    struct {
		Required          bool     `json:"required"`
		Min               int      `json:"min"`
		Max               int      `json:"max"`
		AllowTextFallback bool     `json:"allowTextFallback"`
		AllowedTypes      []string `json:"allowedTypes"`
	} `json:"imagePolicy"`
	OutputSchemaVersion string         `json:"outputSchemaVersion"`
	OutputSchema        map[string]any `json:"outputSchema"`
	QualityGateProfile  []string       `json:"qualityGateProfile"`
	ApplyTargets        []string       `json:"applyTargets"`
}

type WorkflowSkillPackage struct {
	Files       map[string]string     `json:"files"`
	Contract    WorkflowSkillContract `json:"contract"`
	ContentHash string                `json:"contentHash"`
}

type ResolvedWorkflowSkill struct {
	Skill   model.WorkflowSkill             `json:"skill"`
	Version model.WorkflowSkillVersion      `json:"version"`
	Package WorkflowSkillPackage            `json:"package"`
	Binding model.WorkflowStageSkillBinding `json:"binding"`
}

type WorkflowSkillPublishInput struct {
	Scope   string `json:"scope"`
	ScopeID string `json:"scopeId"`
}

func NormalizeWorkflowSkillPackage(files map[string]string, contract WorkflowSkillContract) (WorkflowSkillPackage, error) {
	if strings.TrimSpace(files["SKILL.md"]) == "" {
		return WorkflowSkillPackage{}, safeMessageError{message: "Skill 必须包含非空 SKILL.md"}
	}
	if contract.ImagePolicy.Min < 0 || contract.ImagePolicy.Max < contract.ImagePolicy.Min || contract.ImagePolicy.Max > 9 {
		return WorkflowSkillPackage{}, safeMessageError{message: "图片契约必须限制在 0–9 张"}
	}
	if !strings.HasPrefix(strings.TrimSpace(contract.OutputSchemaVersion), "1.") {
		return WorkflowSkillPackage{}, safeMessageError{message: "当前仅支持 1.x 输出契约"}
	}
	allowedGates := map[string]bool{"schema": true, "script": true, "art": true, "storyboard": true, "media": true, "delivery": true}
	for _, gate := range contract.QualityGateProfile {
		if !allowedGates[strings.TrimSpace(gate)] {
			return WorkflowSkillPackage{}, safeMessageError{message: "存在未知质量门"}
		}
	}
	for _, target := range contract.ApplyTargets {
		if !workflowSkillStages[strings.TrimSpace(target)] {
			return WorkflowSkillPackage{}, safeMessageError{message: "存在未知写入目标"}
		}
	}
	normalizedFiles := make(map[string]string, len(files))
	for logicalPath, content := range files {
		logicalPath = strings.ReplaceAll(strings.TrimSpace(logicalPath), "\\", "/")
		cleaned := path.Clean(logicalPath)
		ext := strings.ToLower(path.Ext(cleaned))
		if logicalPath == "" || strings.HasPrefix(logicalPath, "/") || cleaned != logicalPath || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
			return WorkflowSkillPackage{}, safeMessageError{message: "Skill 文件路径不安全"}
		}
		if map[string]bool{".sh": true, ".exe": true, ".bat": true, ".cmd": true, ".com": true, ".ps1": true}[ext] {
			return WorkflowSkillPackage{}, safeMessageError{message: "Skill 不允许包含可执行文件"}
		}
		normalizedFiles[cleaned] = normalizeWorkflowSkillText(content)
	}
	if len(normalizedFiles) > 32 {
		return WorkflowSkillPackage{}, safeMessageError{message: "Skill 文件不能超过 32 个"}
	}
	packageValue := WorkflowSkillPackage{Files: normalizedFiles, Contract: contract}
	packageValue.ContentHash = workflowSkillPackageHash(packageValue)
	return packageValue, nil
}

func DecodeWorkflowSkillPackage(version model.WorkflowSkillVersion) (WorkflowSkillPackage, error) {
	var files map[string]string
	var contract WorkflowSkillContract
	if json.Unmarshal([]byte(version.FilesJSON), &files) != nil || json.Unmarshal([]byte(version.ContractJSON), &contract) != nil {
		return WorkflowSkillPackage{}, safeMessageError{message: "Skill 版本内容损坏"}
	}
	packageValue, err := NormalizeWorkflowSkillPackage(files, contract)
	if err != nil {
		return WorkflowSkillPackage{}, err
	}
	if packageValue.ContentHash != version.ContentHash {
		return WorkflowSkillPackage{}, safeMessageError{message: "Skill 内容哈希不一致"}
	}
	return packageValue, nil
}

func ResolvePublishedWorkflowSkill(stageKey string, projectID string) (ResolvedWorkflowSkill, error) {
	stageKey = strings.TrimSpace(stageKey)
	if !workflowSkillStages[stageKey] {
		return ResolvedWorkflowSkill{}, safeMessageError{message: "未知工作流阶段"}
	}
	binding, ok, err := repository.ResolveWorkflowStageSkillBinding(stageKey, projectID)
	if err != nil {
		return ResolvedWorkflowSkill{}, err
	}
	if !ok {
		return ResolvedWorkflowSkill{}, safeMessageError{message: "工作流阶段尚未绑定 Skill"}
	}
	skill, version, ok, err := repository.GetWorkflowSkillWithVersion(binding.SkillVersionID)
	if err != nil {
		return ResolvedWorkflowSkill{}, err
	}
	if !ok || !skill.Enabled || version.Status != model.WorkflowSkillVersionPublished || skill.StageKey != stageKey {
		return ResolvedWorkflowSkill{}, safeMessageError{message: "当前 Skill 绑定不可用"}
	}
	packageValue, err := DecodeWorkflowSkillPackage(version)
	return ResolvedWorkflowSkill{Skill: skill, Version: version, Package: packageValue, Binding: binding}, err
}

func PublishWorkflowSkillVersion(adminID string, versionID string, input WorkflowSkillPublishInput) (ResolvedWorkflowSkill, error) {
	skill, version, ok, err := repository.GetWorkflowSkillWithVersion(versionID)
	if err != nil {
		return ResolvedWorkflowSkill{}, err
	}
	if !ok {
		return ResolvedWorkflowSkill{}, safeMessageError{message: "Skill 版本不存在"}
	}
	if version.Status != model.WorkflowSkillVersionDraft {
		return ResolvedWorkflowSkill{}, safeMessageError{message: "只有草稿版本可以发布"}
	}
	if _, err := DecodeWorkflowSkillPackage(version); err != nil {
		return ResolvedWorkflowSkill{}, err
	}
	if workflowSkillRequiresEvaluation(skill.StageKey) {
		passed, err := repository.HasPassingWorkflowSkillEvaluation(version.ID, version.ContentHash)
		if err != nil {
			return ResolvedWorkflowSkill{}, err
		}
		if !passed {
			return ResolvedWorkflowSkill{}, safeMessageError{message: "该版本尚未通过评测，或评测内容哈希不一致"}
		}
	}
	scope := strings.TrimSpace(input.Scope)
	scopeID := strings.TrimSpace(input.ScopeID)
	if scope != model.WorkflowSkillScopeGlobal && scope != model.WorkflowSkillScopeProject {
		return ResolvedWorkflowSkill{}, safeMessageError{message: "Skill 发布范围无效"}
	}
	if scope == model.WorkflowSkillScopeGlobal {
		scopeID = ""
	} else if scopeID == "" {
		return ResolvedWorkflowSkill{}, safeMessageError{message: "项目灰度发布必须指定项目"}
	}
	stamp := now()
	version.Status = model.WorkflowSkillVersionPublished
	version.PublishedAt = stamp
	version.UpdatedAt = stamp
	binding := model.WorkflowStageSkillBinding{
		ID: newID("skillbinding"), StageKey: skill.StageKey, Scope: scope, ScopeID: scopeID,
		SkillVersionID: version.ID, CreatedAt: stamp, UpdatedAt: stamp,
	}
	if err := repository.PublishWorkflowSkillVersionBinding(version, binding); err != nil {
		return ResolvedWorkflowSkill{}, err
	}
	_ = adminID
	return ResolvePublishedWorkflowSkill(skill.StageKey, scopeID)
}

func RollbackWorkflowSkillBinding(stageKey string, scope string, scopeID string, versionID string) (ResolvedWorkflowSkill, error) {
	skill, version, ok, err := repository.GetWorkflowSkillWithVersion(versionID)
	if err != nil || !ok {
		return ResolvedWorkflowSkill{}, safeMessageError{message: "回滚版本不存在"}
	}
	if version.Status != model.WorkflowSkillVersionPublished || skill.StageKey != stageKey {
		return ResolvedWorkflowSkill{}, safeMessageError{message: "只能回滚到该阶段已发布版本"}
	}
	if scope == model.WorkflowSkillScopeGlobal {
		scopeID = ""
	} else if scope != model.WorkflowSkillScopeProject || strings.TrimSpace(scopeID) == "" {
		return ResolvedWorkflowSkill{}, safeMessageError{message: "回滚范围无效"}
	}
	stamp := now()
	if err := repository.UpsertWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{
		ID: newID("skillbinding"), StageKey: stageKey, Scope: scope, ScopeID: scopeID,
		SkillVersionID: versionID, CreatedAt: stamp, UpdatedAt: stamp,
	}); err != nil {
		return ResolvedWorkflowSkill{}, err
	}
	return ResolvePublishedWorkflowSkill(stageKey, scopeID)
}

func normalizeWorkflowSkillText(value string) string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	lines := strings.Split(value, "\n")
	for index := range lines {
		lines[index] = strings.TrimRight(lines[index], " \t")
	}
	return strings.TrimSpace(strings.Join(lines, "\n")) + "\n"
}

func workflowSkillPackageHash(packageValue WorkflowSkillPackage) string {
	keys := make([]string, 0, len(packageValue.Files))
	for key := range packageValue.Files {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	ordered := make([][2]string, 0, len(keys))
	for _, key := range keys {
		ordered = append(ordered, [2]string{key, packageValue.Files[key]})
	}
	payload, _ := json.Marshal(struct {
		Files    [][2]string           `json:"files"`
		Contract WorkflowSkillContract `json:"contract"`
	}{Files: ordered, Contract: packageValue.Contract})
	hash := sha256.Sum256(payload)
	return hex.EncodeToString(hash[:])
}

func workflowSkillRequiresEvaluation(stageKey string) bool {
	return stageKey == WorkflowSkillStageScript || stageKey == WorkflowSkillStageArt || stageKey == WorkflowSkillStageStoryboard
}

func workflowSkillStageForRun(stageID string) string {
	switch stageID {
	case WorkflowStageScriptAdaptation:
		return WorkflowSkillStageScript
	case WorkflowStageArtDesign:
		return WorkflowSkillStageArt
	case WorkflowStageSeedanceStoryboard:
		return WorkflowSkillStageStoryboard
	default:
		return strings.TrimSpace(stageID)
	}
}

func workflowSkillSnapshotJSON(resolved ResolvedWorkflowSkill) string {
	payload, _ := json.Marshal(map[string]any{
		"skillId": resolved.Skill.ID, "name": resolved.Skill.Name, "stageKey": resolved.Skill.StageKey,
		"versionId": resolved.Version.ID, "version": resolved.Version.Version, "contentHash": resolved.Version.ContentHash,
		"files": resolved.Package.Files, "contract": resolved.Package.Contract,
	})
	return string(payload)
}

func workflowSkillInstructions(resolved ResolvedWorkflowSkill) string {
	return fmt.Sprintf("\n\n【当前阶段 Skill %s@%s，内容哈希 %s】\n%s", resolved.Skill.Name, resolved.Version.Version, resolved.Version.ContentHash, strings.TrimSpace(resolved.Package.Files["SKILL.md"]))
}
