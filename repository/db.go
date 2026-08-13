package repository

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var promptCategories = []model.PromptCategory{
	{Category: "scene", Name: "场景", Description: "场景与空间环境提示词"},
	{Category: "prop", Name: "道具", Description: "道具与通用图片资产提示词"},
	{Category: "character", Name: "角色", Description: "角色设定与人物修复提示词"},
	{Category: "video", Name: "视频", Description: "视频镜头与动态生成提示词"},
	{Category: "text", Name: "文本", Description: "文本创作与分析提示词"},
}

var legacyBuiltinPromptCategories = []string{
	"gpt-image-2-prompts",
	"awesome-gpt-image",
	"awesome-gpt4o-image-prompts",
	"youmind-gpt-image-2",
	"youmind-nano-banana-pro",
	"davidwu-gpt-image2-prompts",
}

var (
	db     *gorm.DB
	dbOnce sync.Once
	dbErr  error
	dbMu   sync.Mutex
)

// DB 初始化并返回全局数据库连接。
func DB() (*gorm.DB, error) {
	dbMu.Lock()
	defer dbMu.Unlock()
	dbOnce.Do(func() {
		driver := strings.ToLower(strings.TrimSpace(config.Cfg.StorageDriver))
		if driver == "" {
			driver = "sqlite"
		}
		dsn := config.Cfg.DatabaseDSN
		if driver == "sqlite" && dsn != ":memory:" {
			_ = os.MkdirAll(filepath.Dir(dsn), 0755)
		}
		db, dbErr = gorm.Open(dialector(driver, dsn), &gorm.Config{})
		if dbErr != nil {
			return
		}
		dbErr = db.AutoMigrate(
			&model.User{},
			&model.LoginSession{},
			&model.CreditLog{},
			&model.AITask{},
			&model.UserActivityLog{},
			&model.UserAllowedIP{},
			&model.LoginApproval{},
			&model.AgentConfigRecord{},
			&model.AgentRun{},
			&model.AgentDefinition{},
			&model.AgentVersion{},
			&model.AgentPlan{},
			&model.AgentPlanRevision{},
			&model.AgentPlanStep{},
			&model.AgentPlanConfirmation{},
			&model.WorkflowDefinition{},
			&model.WorkflowVersion{},
			&model.WorkflowExecution{},
			&model.WorkflowExecutionRevision{},
			&model.WorkflowNodeExecution{},
			&model.WorkflowExecutionConfirmation{},
			&model.WorkflowRun{},
			&model.WorkflowStageRun{},
			&model.WorkflowEvent{},
			&model.SkillDefinition{},
			&model.SkillVersion{},
			&model.SkillEvaluation{},
			&model.SkillAuditLog{},
			&model.WorkflowStageSkillBinding{},
			&model.ArtifactSchema{},
			&model.Artifact{},
			&model.InvocationRun{},
			&model.InvocationPreflightRevision{},
			&model.InvocationAttempt{},
			&model.InvocationArtifactRef{},
			&model.InvocationEvent{},
			&model.InvocationGateResult{},
			&model.InvocationReview{},
			&model.InvocationApplyAttempt{},
			&model.InvocationTestSinkReceipt{},
			&model.WorkflowLocalApplyReceipt{},
			&model.WorkflowMediaBatch{},
			&model.WorkflowMediaItem{},
			&model.Prompt{},
			&model.ImageUpscaleJob{},
			&model.VideoUpscaleJob{},
			&model.Setting{},
		)
		if dbErr != nil {
			return
		}
		dbErr = ensureSkillOwnerNameIndex(db)
		if dbErr != nil {
			return
		}
		dbErr = ensureInvocationArtifactRefIndex(db)
		if dbErr != nil {
			return
		}
		dbErr = ensureInvocationGateIndex(db)
		if dbErr != nil {
			return
		}
		dbErr = cleanupLegacyBuiltinPrompts(db)
		if dbErr != nil {
			return
		}
		dbErr = seedSystemPrompts(db)
	})
	return db, dbErr
}

func ensureInvocationArtifactRefIndex(database *gorm.DB) error {
	const indexName = "idx_invocation_artifact_ref"
	want := []string{"invocation_id", "direction", "revision", "attempt", "binding_name", "ordinal"}
	indexes, err := database.Migrator().GetIndexes(&model.InvocationArtifactRef{})
	if err != nil {
		return err
	}
	for _, index := range indexes {
		if index.Name() != indexName {
			continue
		}
		unique, known := index.Unique()
		if sameIndexColumns(index.Columns(), want) && known && unique {
			return nil
		}
		if err := database.Migrator().DropIndex(&model.InvocationArtifactRef{}, indexName); err != nil {
			return err
		}
		break
	}
	return database.Migrator().CreateIndex(&model.InvocationArtifactRef{}, indexName)
}

func ensureInvocationGateIndex(database *gorm.DB) error {
	const indexName = "idx_invocation_gate"
	want := []string{"invocation_id", "attempt", "execution_ordinal", "layer", "validator_id", "binding_name", "output_ordinal", "artifact_hash"}
	indexes, err := database.Migrator().GetIndexes(&model.InvocationGateResult{})
	if err != nil {
		return err
	}
	for _, index := range indexes {
		if index.Name() != indexName {
			continue
		}
		unique, known := index.Unique()
		if slices.Equal(index.Columns(), want) && known && unique {
			return nil
		}
		if err := database.Migrator().DropIndex(&model.InvocationGateResult{}, indexName); err != nil {
			return err
		}
		break
	}
	return database.Migrator().CreateIndex(&model.InvocationGateResult{}, indexName)
}

func ensureSkillOwnerNameIndex(database *gorm.DB) error {
	const indexName = "idx_skill_owner_name"
	want := []string{"owner_type", "owner_user_id", "owner_project_id", "name"}
	indexes, err := database.Migrator().GetIndexes(&model.SkillDefinition{})
	if err != nil {
		return err
	}
	for _, index := range indexes {
		if index.Name() != indexName {
			continue
		}
		unique, uniqueKnown := index.Unique()
		if sameIndexColumns(index.Columns(), want) && uniqueKnown && !unique {
			return nil
		}
		if err := database.Migrator().DropIndex(&model.SkillDefinition{}, indexName); err != nil {
			return err
		}
		break
	}
	return database.Migrator().CreateIndex(&model.SkillDefinition{}, indexName)
}

func sameIndexColumns(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	leftCopy, rightCopy := slices.Clone(left), slices.Clone(right)
	slices.Sort(leftCopy)
	slices.Sort(rightCopy)
	return slices.Equal(leftCopy, rightCopy)
}

// ResetForTest resets the process-wide repository connection for cross-package tests.
func ResetForTest() {
	dbMu.Lock()
	defer dbMu.Unlock()
	if db != nil {
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	}
	db = nil
	dbErr = nil
	dbOnce = sync.Once{}
}

func dialector(driver string, dsn string) gorm.Dialector {
	switch driver {
	case "mysql":
		return mysql.Open(dsn)
	case "postgres", "postgresql":
		return postgres.Open(dsn)
	default:
		return sqlite.Open(dsn)
	}
}
