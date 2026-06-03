package repository

import (
	"os"
	"path/filepath"
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
	{Category: "system", Name: "系统", Description: "系统提示词分类"},
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
			&model.CreditLog{},
			&model.AITask{},
			&model.Prompt{},
			&model.Asset{},
			&model.Setting{},
		)
		if dbErr != nil {
			return
		}
		dbErr = cleanupLegacyBuiltinPrompts(db)
	})
	return db, dbErr
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
