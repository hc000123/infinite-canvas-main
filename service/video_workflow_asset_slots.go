package service

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const agentAssetSlotsExtension = "agent.asset-slots"

type agentAssetSlotsExtensionValue struct {
	Version int              `json:"version"`
	Slots   []AgentAssetSlot `json:"slots"`
}

func ValidateAgentAssetSlots(slots []AgentAssetSlot) error {
	if len(slots) > 1000 {
		return errors.New("资产槽位不能超过 1000 个")
	}
	seen := make(map[string]struct{}, len(slots))
	for _, slot := range slots {
		id := strings.TrimSpace(slot.SlotID)
		if id == "" || strings.TrimSpace(slot.Name) == "" {
			return errors.New("资产槽位缺少稳定 ID 或名称")
		}
		if _, exists := seen[id]; exists {
			return errors.New("资产槽位 ID 重复")
		}
		seen[id] = struct{}{}
		switch slot.Category {
		case AgentAssetCategoryCharacter, AgentAssetCategoryScene, AgentAssetCategoryProp, AgentAssetCategoryBlocking:
		default:
			return errors.New("资产槽位类别无效")
		}
		switch slot.Status {
		case AgentAssetSlotPlaceholder, AgentAssetSlotIgnored:
		case AgentAssetSlotCandidate:
			if strings.TrimSpace(slot.CandidateID) == "" {
				return errors.New("候选资产槽位缺少 candidateId")
			}
		case AgentAssetSlotBound:
			if strings.TrimSpace(slot.AssetID) == "" {
				return errors.New("已绑定资产槽位缺少 assetId")
			}
		default:
			return errors.New("资产槽位状态无效")
		}
	}
	return nil
}

func GetWorkflowAssetSlots(userID, stageRunID string) (WorkflowAssetSlotArtifact, error) {
	stage, ok, err := repository.GetUserWorkflowStageRun(userID, stageRunID)
	if err != nil {
		return WorkflowAssetSlotArtifact{}, err
	}
	if !ok || stage.StageID != WorkflowStageAssetExtraction {
		return WorkflowAssetSlotArtifact{}, safeMessageError{message: "资产解析阶段不存在"}
	}
	switch stage.Status {
	case model.WorkflowStageRunStatusNeedsReview, model.WorkflowStageRunStatusApproved, model.WorkflowStageRunStatusApplied:
	default:
		return WorkflowAssetSlotArtifact{}, safeMessageError{message: "资产解析结果尚未生成"}
	}
	base, err := GetArtifact(userID, stage.OutputArtifactID)
	if err != nil || base.Artifact.ArtifactType != "asset_catalog" {
		return WorkflowAssetSlotArtifact{}, safeMessageError{message: "资产解析结果缺少标准产物"}
	}
	current, version, slots, err := latestAgentAssetSlotArtifact(userID, base)
	if err != nil {
		return WorkflowAssetSlotArtifact{}, err
	}
	if version == 0 {
		slots = agentAssetSlotsFromCatalog(base.Payload)
	}
	return WorkflowAssetSlotArtifact{Artifact: current, Version: version, Slots: slots}, nil
}

func SaveWorkflowAssetSlots(userID, stageRunID string, input SaveWorkflowAssetSlotsInput) (WorkflowAssetSlotArtifact, error) {
	stage, ok, err := repository.GetUserWorkflowStageRun(userID, stageRunID)
	if err != nil {
		return WorkflowAssetSlotArtifact{}, err
	}
	if !ok || stage.StageID != WorkflowStageAssetExtraction {
		return WorkflowAssetSlotArtifact{}, safeMessageError{message: "资产解析阶段不存在"}
	}
	if err := ValidateAgentAssetSlots(input.Slots); err != nil {
		return WorkflowAssetSlotArtifact{}, err
	}
	detail, err := GetWorkflowRunDetail(userID, stage.WorkflowRunID)
	if err != nil {
		return WorkflowAssetSlotArtifact{}, err
	}
	loaded, err := GetWorkflowAssetSlots(userID, stageRunID)
	if err != nil {
		return WorkflowAssetSlotArtifact{}, err
	}
	current, version := loaded.Artifact, loaded.Version
	baseHash := strings.TrimSpace(input.BaseArtifactHash)
	if baseHash != current.Artifact.ContentHash {
		return WorkflowAssetSlotArtifact{}, safeMessageError{message: "资产槽位已被更新，请刷新后重试"}
	}
	slots := normalizeAgentAssetSlots(input.Slots)
	payload, err := json.Marshal(map[string]any{"items": agentAssetCatalogItems(slots)})
	if err != nil {
		return WorkflowAssetSlotArtifact{}, err
	}
	extension, err := json.Marshal(agentAssetSlotsExtensionValue{Version: version + 1, Slots: slots})
	if err != nil {
		return WorkflowAssetSlotArtifact{}, err
	}
	items, envelopes, err := buildArtifacts(userID, []CreateArtifactInput{{
		ArtifactType: "asset_catalog", SchemaVersion: coreArtifactSchemaVersion, ProjectID: detail.Run.ProjectID, EpisodeID: detail.Run.EpisodeID,
		ParentArtifactRefs: []ArtifactRefInput{{BindingName: "previous_asset_catalog", ArtifactID: current.Artifact.ID, ContentHash: current.Artifact.ContentHash}},
		Payload:            payload, Extensions: map[string]json.RawMessage{agentAssetSlotsExtension: extension},
	}}, false)
	if err != nil {
		return WorkflowAssetSlotArtifact{}, err
	}
	if _, err := repository.CreateArtifact(items[0]); err != nil {
		return WorkflowAssetSlotArtifact{}, err
	}
	return WorkflowAssetSlotArtifact{Artifact: envelopes[0], Version: version + 1, Slots: slots}, nil
}

func latestAgentAssetSlotArtifact(userID string, base ArtifactEnvelope) (ArtifactEnvelope, int, []AgentAssetSlot, error) {
	items, _, err := repository.ListUserArtifacts(userID, repository.ArtifactQuery{ProjectID: base.Artifact.ProjectID, EpisodeID: base.Artifact.EpisodeID, ArtifactType: "asset_catalog", Page: 1, PageSize: 100})
	if err != nil {
		return ArtifactEnvelope{}, 0, nil, err
	}
	current, version, slots := base, 0, []AgentAssetSlot(nil)
	for _, item := range items {
		envelope, err := GetArtifact(userID, item.ID)
		if err != nil {
			return ArtifactEnvelope{}, 0, nil, err
		}
		extension, ok := agentAssetSlotsFromEnvelope(envelope)
		if !ok || extension.Version <= version {
			continue
		}
		descends, err := artifactDescendsFrom(userID, envelope, base.Artifact.ID, map[string]bool{})
		if err != nil {
			return ArtifactEnvelope{}, 0, nil, err
		}
		if descends {
			current, version, slots = envelope, extension.Version, extension.Slots
		}
	}
	return current, version, slots, nil
}

func artifactDescendsFrom(userID string, artifact ArtifactEnvelope, ancestorID string, visiting map[string]bool) (bool, error) {
	if artifact.Artifact.ID == ancestorID {
		return true, nil
	}
	if visiting[artifact.Artifact.ID] {
		return false, errors.New("资产槽位 Artifact 父链存在循环")
	}
	visiting[artifact.Artifact.ID] = true
	defer delete(visiting, artifact.Artifact.ID)
	for _, parentID := range artifact.ParentArtifactIds {
		parent, err := GetArtifact(userID, parentID)
		if err != nil {
			return false, err
		}
		if found, err := artifactDescendsFrom(userID, parent, ancestorID, visiting); err != nil || found {
			return found, err
		}
	}
	return false, nil
}

func agentAssetSlotsFromEnvelope(envelope ArtifactEnvelope) (agentAssetSlotsExtensionValue, bool) {
	raw, ok := envelope.Extensions[agentAssetSlotsExtension]
	if !ok {
		return agentAssetSlotsExtensionValue{}, false
	}
	data, err := json.Marshal(raw)
	if err != nil {
		return agentAssetSlotsExtensionValue{}, false
	}
	var extension agentAssetSlotsExtensionValue
	if json.Unmarshal(data, &extension) != nil || extension.Version < 1 || ValidateAgentAssetSlots(extension.Slots) != nil {
		return agentAssetSlotsExtensionValue{}, false
	}
	return extension, true
}

func normalizeAgentAssetSlots(slots []AgentAssetSlot) []AgentAssetSlot {
	result := make([]AgentAssetSlot, 0, len(slots))
	for _, slot := range slots {
		slot.SlotID, slot.Name, slot.Description = strings.TrimSpace(slot.SlotID), strings.TrimSpace(slot.Name), strings.TrimSpace(slot.Description)
		slot.SubjectID, slot.VariantID, slot.AssetID, slot.CandidateID = strings.TrimSpace(slot.SubjectID), strings.TrimSpace(slot.VariantID), strings.TrimSpace(slot.AssetID), strings.TrimSpace(slot.CandidateID)
		slot.SourceSceneIDs = uniqueTrimmedStrings(slot.SourceSceneIDs)
		slot.SourceEvidence = uniqueTrimmedStrings(slot.SourceEvidence)
		result = append(result, slot)
	}
	return result
}

func agentAssetSlotsFromCatalog(payload map[string]any) []AgentAssetSlot {
	items, _ := payload["items"].([]any)
	slots := make([]AgentAssetSlot, 0, len(items))
	for _, raw := range items {
		item, _ := raw.(map[string]any)
		assetID, _ := item["assetId"].(string)
		name, _ := item["name"].(string)
		kind, _ := item["kind"].(string)
		category := AgentAssetCategory(kind)
		if kind == "costume" {
			category = AgentAssetCategoryProp
		}
		slots = append(slots, AgentAssetSlot{
			SlotID:         "slot-" + strings.TrimSpace(assetID),
			Category:       category,
			Name:           strings.TrimSpace(name),
			Description:    strings.Join(agentAssetStringList(item["coreFacts"]), "；"),
			Status:         AgentAssetSlotPlaceholder,
			SourceSceneIDs: []string{},
			SourceEvidence: agentAssetStringList(item["sourceEvidence"]),
		})
	}
	return slots
}

func agentAssetStringList(value any) []string {
	items, _ := value.([]any)
	result := make([]string, 0, len(items))
	for _, item := range items {
		if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
			result = append(result, strings.TrimSpace(text))
		}
	}
	return result
}

func agentAssetCatalogItems(slots []AgentAssetSlot) []map[string]any {
	items := make([]map[string]any, 0, len(slots))
	for _, slot := range slots {
		if slot.Status == AgentAssetSlotIgnored {
			continue
		}
		kind := string(slot.Category)
		if slot.Category == AgentAssetCategoryBlocking {
			kind = "scene"
		}
		evidence := slot.SourceEvidence
		if len(evidence) == 0 {
			evidence = []string{"人工校正资产槽位"}
		}
		fact := slot.Description
		if fact == "" {
			fact = slot.Name
		}
		items = append(items, map[string]any{"assetId": slot.SlotID, "kind": kind, "name": slot.Name, "sourceEvidence": evidence, "coreFacts": []string{fact}})
	}
	return items
}

func uniqueTrimmedStrings(values []string) []string {
	result := make([]string, 0, len(values))
	seen := make(map[string]bool, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" && !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	return result
}
