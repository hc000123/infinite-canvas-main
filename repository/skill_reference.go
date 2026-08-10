package repository

import (
	"encoding/json"
	"errors"
	"sort"
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
	SkillID           string   `json:"skillId"`
	SkillVersionID    string   `json:"skillVersionId"`
	CandidateSkillIDs []string `json:"candidateSkillIds"`
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
	skill, version, err := lockSkillVersionTarget(tx, versionID)
	if err != nil {
		return model.SkillDefinition{}, err
	}
	if skill.OwnerType != model.SkillOwnerSystem || !skill.Enabled || version.Status != model.SkillVersionPublished {
		return model.SkillDefinition{}, ErrSkillReferenceTargetUnavailable
	}
	return skill, nil
}

func validateEvaluationSkillVersions(tx *gorm.DB, versionIDs []string) error {
	skills, versions, err := lockSkillTargets(tx, nil, versionIDs)
	if errors.Is(err, ErrSkillReferenceTargetUnavailable) {
		return ErrSkillEvaluationTargetUnavailable
	}
	if err != nil {
		return err
	}
	for _, version := range versions {
		skill := skills[version.SkillID]
		if skill.OwnerType != model.SkillOwnerSystem || version.Status != model.SkillVersionDraft && version.Status != model.SkillVersionPublished {
			return ErrSkillEvaluationTargetUnavailable
		}
	}
	return nil
}

func lockSkillDefinitionTarget(tx *gorm.DB, skillID string) (model.SkillDefinition, error) {
	var skill model.SkillDefinition
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&skill, "id = ?", strings.TrimSpace(skillID)).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return skill, ErrSkillReferenceTargetUnavailable
		}
		return skill, err
	}
	return skill, nil
}

func lockSkillVersionTarget(tx *gorm.DB, versionID string) (model.SkillDefinition, model.SkillVersion, error) {
	versionID = strings.TrimSpace(versionID)
	skills, versions, err := lockSkillTargets(tx, nil, []string{versionID})
	version := versions[versionID]
	return skills[version.SkillID], version, err
}

func lockSkillTargets(tx *gorm.DB, skillIDs, versionIDs []string) (map[string]model.SkillDefinition, map[string]model.SkillVersion, error) {
	skillIDSet, versionIDSet := map[string]bool{}, map[string]bool{}
	for _, skillID := range skillIDs {
		if skillID = strings.TrimSpace(skillID); skillID != "" {
			skillIDSet[skillID] = true
		}
	}
	for _, versionID := range versionIDs {
		if versionID = strings.TrimSpace(versionID); versionID != "" {
			versionIDSet[versionID] = true
		}
	}
	orderedVersionIDs := make([]string, 0, len(versionIDSet))
	for versionID := range versionIDSet {
		orderedVersionIDs = append(orderedVersionIDs, versionID)
	}
	sort.Strings(orderedVersionIDs)
	identities := make(map[string]model.SkillVersion, len(orderedVersionIDs))
	for _, versionID := range orderedVersionIDs {
		var identity model.SkillVersion
		if err := tx.Select("id, skill_id").First(&identity, "id = ?", versionID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, nil, ErrSkillReferenceTargetUnavailable
			}
			return nil, nil, err
		}
		identities[versionID] = identity
		skillIDSet[identity.SkillID] = true
	}
	orderedSkillIDs := make([]string, 0, len(skillIDSet))
	for skillID := range skillIDSet {
		orderedSkillIDs = append(orderedSkillIDs, skillID)
	}
	sort.Strings(orderedSkillIDs)
	skills := make(map[string]model.SkillDefinition, len(orderedSkillIDs))
	for _, skillID := range orderedSkillIDs {
		skill, err := lockSkillDefinitionTarget(tx, skillID)
		if err != nil {
			return nil, nil, err
		}
		skills[skillID] = skill
	}
	versions := make(map[string]model.SkillVersion, len(orderedVersionIDs))
	for _, versionID := range orderedVersionIDs {
		var version model.SkillVersion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&version, "id = ?", versionID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, nil, ErrSkillReferenceTargetUnavailable
			}
			return nil, nil, err
		}
		if version.SkillID != identities[versionID].SkillID {
			return nil, nil, ErrSkillReferenceTargetUnavailable
		}
		versions[versionID] = version
	}
	return skills, versions, nil
}

func validateWorkflowSkillReferences(tx *gorm.DB, packageJSON string) error {
	refs, err := parseWorkflowSkillReferences(packageJSON)
	if err != nil {
		return err
	}
	skillIDs, versionIDs := []string{}, []string{}
	for _, ref := range refs {
		skillIDs = append(skillIDs, ref.SkillID)
		skillIDs = append(skillIDs, ref.CandidateSkillIDs...)
		versionIDs = append(versionIDs, ref.SkillVersionID)
	}
	skills, versions, err := lockSkillTargets(tx, skillIDs, versionIDs)
	if err != nil {
		return err
	}
	for _, ref := range refs {
		if strings.TrimSpace(ref.SkillVersionID) != "" {
			version := versions[strings.TrimSpace(ref.SkillVersionID)]
			skill := skills[version.SkillID]
			if skill.OwnerType != model.SkillOwnerSystem || !skill.Enabled || version.Status != model.SkillVersionPublished {
				return ErrSkillReferenceTargetUnavailable
			}
			if strings.TrimSpace(ref.SkillID) != "" && skill.ID != strings.TrimSpace(ref.SkillID) {
				return ErrSkillReferenceTargetUnavailable
			}
		} else if strings.TrimSpace(ref.SkillID) != "" {
			skill := skills[strings.TrimSpace(ref.SkillID)]
			if skill.OwnerType != model.SkillOwnerSystem || !skill.Enabled {
				return ErrSkillReferenceTargetUnavailable
			}
		}
		for _, skillID := range ref.CandidateSkillIDs {
			if skillID = strings.TrimSpace(skillID); skillID != "" {
				skill := skills[skillID]
				if skill.OwnerType != model.SkillOwnerSystem || !skill.Enabled {
					return ErrSkillReferenceTargetUnavailable
				}
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
	allowedSkillIDs, err := parseAgentAllowedSkillIDs(accessPolicyJSON)
	if err != nil {
		return err
	}
	skillIDs, versionIDs := append([]string{}, allowedSkillIDs...), []string{}
	for _, ref := range refs {
		skillIDs = append(skillIDs, ref.SkillID)
		versionIDs = append(versionIDs, ref.SkillVersionID)
	}
	skills, versions, err := lockSkillTargets(tx, skillIDs, versionIDs)
	if err != nil {
		return err
	}
	for _, ref := range refs {
		if strings.TrimSpace(ref.SkillVersionID) != "" {
			version := versions[strings.TrimSpace(ref.SkillVersionID)]
			skill := skills[version.SkillID]
			if skill.OwnerType != model.SkillOwnerSystem || !skill.Enabled || version.Status != model.SkillVersionPublished {
				return ErrSkillReferenceTargetUnavailable
			}
			if strings.TrimSpace(ref.SkillID) != "" && skill.ID != strings.TrimSpace(ref.SkillID) {
				return ErrSkillReferenceTargetUnavailable
			}
			continue
		}
		if strings.TrimSpace(ref.SkillID) != "" {
			skill := skills[strings.TrimSpace(ref.SkillID)]
			if skill.OwnerType != model.SkillOwnerSystem || !skill.Enabled {
				return ErrSkillReferenceTargetUnavailable
			}
		}
	}
	for _, skillID := range allowedSkillIDs {
		if skillID = strings.TrimSpace(skillID); skillID != "" {
			skill := skills[skillID]
			if skill.OwnerType != model.SkillOwnerSystem || !skill.Enabled {
				return ErrSkillReferenceTargetUnavailable
			}
		}
	}
	return nil
}
