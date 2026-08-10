package repository

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrSkillReferenceTargetUnavailable  = errors.New("Skill 引用目标不可用")
	ErrSkillEvaluationTargetUnavailable = errors.New("Skill 评测目标不可用")
)

type persistedSkillReference struct {
	SkillID        string `json:"skillId"`
	SkillVersionID string `json:"skillVersionId"`
}

func parseWorkflowSkillReferences(packageJSON string) ([]persistedSkillReference, error) {
	if strings.TrimSpace(packageJSON) == "" {
		return nil, nil
	}
	var value struct {
		Nodes []struct {
			SkillBinding *persistedSkillReference `json:"skillBinding"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal([]byte(packageJSON), &value); err != nil {
		return nil, err
	}
	refs := make([]persistedSkillReference, 0, len(value.Nodes))
	for _, node := range value.Nodes {
		if node.SkillBinding != nil {
			refs = append(refs, *node.SkillBinding)
		}
	}
	return refs, nil
}

func parseAgentSkillReferences(defaultRefsJSON string) ([]persistedSkillReference, error) {
	if strings.TrimSpace(defaultRefsJSON) == "" {
		return nil, nil
	}
	var refs []persistedSkillReference
	if err := json.Unmarshal([]byte(defaultRefsJSON), &refs); err != nil {
		return nil, err
	}
	return refs, nil
}

func parseAgentAllowedSkillIDs(accessPolicyJSON string) ([]string, error) {
	if strings.TrimSpace(accessPolicyJSON) == "" {
		return nil, nil
	}
	var policy struct {
		AllowedSkillIDs []string `json:"allowedSkillIds"`
	}
	if err := json.Unmarshal([]byte(accessPolicyJSON), &policy); err != nil {
		return nil, err
	}
	return policy.AllowedSkillIDs, nil
}

func validatePublishedSystemSkillVersion(tx *gorm.DB, versionID string) (model.SkillDefinition, error) {
	var version model.SkillVersion
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&version, "id = ?", strings.TrimSpace(versionID)).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.SkillDefinition{}, ErrSkillReferenceTargetUnavailable
		}
		return model.SkillDefinition{}, err
	}
	skill, err := validateSystemSkillDefinition(tx, version.SkillID, true)
	if err != nil {
		return model.SkillDefinition{}, err
	}
	if version.Status != model.SkillVersionPublished {
		return model.SkillDefinition{}, ErrSkillReferenceTargetUnavailable
	}
	return skill, nil
}

func validateSystemSkillDefinition(tx *gorm.DB, skillID string, requireEnabled bool) (model.SkillDefinition, error) {
	var skill model.SkillDefinition
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&skill, "id = ?", strings.TrimSpace(skillID)).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return skill, ErrSkillReferenceTargetUnavailable
		}
		return skill, err
	}
	if skill.OwnerType != model.SkillOwnerSystem || requireEnabled && !skill.Enabled {
		return skill, ErrSkillReferenceTargetUnavailable
	}
	return skill, nil
}

func validateEvaluationSkillVersion(tx *gorm.DB, versionID string) error {
	var version model.SkillVersion
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&version, "id = ?", strings.TrimSpace(versionID)).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrSkillEvaluationTargetUnavailable
		}
		return err
	}
	skill, err := validateSystemSkillDefinition(tx, version.SkillID, false)
	if errors.Is(err, ErrSkillReferenceTargetUnavailable) {
		return ErrSkillEvaluationTargetUnavailable
	}
	if err != nil {
		return err
	}
	if skill.OwnerType != model.SkillOwnerSystem || version.Status != model.SkillVersionDraft && version.Status != model.SkillVersionPublished {
		return ErrSkillEvaluationTargetUnavailable
	}
	return nil
}

func validateWorkflowSkillReferences(tx *gorm.DB, packageJSON string) error {
	refs, err := parseWorkflowSkillReferences(packageJSON)
	if err != nil {
		return err
	}
	for _, ref := range refs {
		if strings.TrimSpace(ref.SkillVersionID) != "" {
			skill, err := validatePublishedSystemSkillVersion(tx, ref.SkillVersionID)
			if err != nil {
				return err
			}
			if strings.TrimSpace(ref.SkillID) != "" && skill.ID != strings.TrimSpace(ref.SkillID) {
				return ErrSkillReferenceTargetUnavailable
			}
			continue
		}
		if strings.TrimSpace(ref.SkillID) != "" {
			if _, err := validateSystemSkillDefinition(tx, ref.SkillID, true); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateAgentSkillReferences(tx *gorm.DB, defaultRefsJSON, accessPolicyJSON string) error {
	refs, err := parseAgentSkillReferences(defaultRefsJSON)
	if err != nil {
		return err
	}
	for _, ref := range refs {
		if strings.TrimSpace(ref.SkillVersionID) != "" {
			skill, err := validatePublishedSystemSkillVersion(tx, ref.SkillVersionID)
			if err != nil {
				return err
			}
			if strings.TrimSpace(ref.SkillID) != "" && skill.ID != strings.TrimSpace(ref.SkillID) {
				return ErrSkillReferenceTargetUnavailable
			}
			continue
		}
		if strings.TrimSpace(ref.SkillID) != "" {
			if _, err := validateSystemSkillDefinition(tx, ref.SkillID, true); err != nil {
				return err
			}
		}
	}
	allowedSkillIDs, err := parseAgentAllowedSkillIDs(accessPolicyJSON)
	if err != nil {
		return err
	}
	for _, skillID := range allowedSkillIDs {
		if _, err := validateSystemSkillDefinition(tx, skillID, true); err != nil {
			return err
		}
	}
	return nil
}
