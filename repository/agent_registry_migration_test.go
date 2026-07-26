package repository

import "testing"

func TestAgentRegistryAndPlanTablesMigrate(t *testing.T) {
	setupRepositoryTestDB(t)
	database, _ := DB()
	for _, table := range []string{
		"agent_definitions",
		"agent_versions",
		"agent_plans",
		"agent_plan_revisions",
		"agent_plan_steps",
		"agent_plan_confirmations",
	} {
		if !database.Migrator().HasTable(table) {
			t.Fatalf("missing table %s", table)
		}
	}
}
