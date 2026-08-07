package service

import (
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestListAIUsageRecordsPairsRefundsAndEnrichesSources(t *testing.T) {
	setupAITaskTestDB(t)
	seedUsageUser(t, "usage-user-1", "alice", 90)
	seedUsageUser(t, "usage-user-2", "bob", 70)
	seedUsageTask(t, model.AITask{
		ID:        "task-1",
		UserID:    "usage-user-1",
		Kind:      "image",
		Model:     "image-model",
		Provider:  "cloud",
		Status:    model.AITaskStatusSucceeded,
		Credits:   8,
		CreatedAt: "2026-08-07T01:00:00Z",
	})
	seedUsageAgentRun(t, model.AgentRun{
		ID:        "agent-1",
		UserID:    "usage-user-1",
		AgentKind: "director",
		Model:     "agent-model",
		Provider:  "cloud",
		Status:    model.AgentRunStatusApplied,
		Credits:   5,
		CreatedAt: "2026-08-07T02:00:00Z",
	})
	seedUsageLog(t, model.CreditLog{ID: "consume-task", UserID: "usage-user-1", Type: model.CreditLogTypeAIConsume, Amount: -8, RelatedID: "task-1", CreatedAt: "2026-08-07T01:00:00Z"})
	seedUsageLog(t, model.CreditLog{ID: "refund-task", UserID: "usage-user-1", Type: model.CreditLogTypeAIRefund, Amount: 3, RelatedID: "task-1", CreatedAt: "2026-08-07T03:00:00Z"})
	seedUsageLog(t, model.CreditLog{ID: "consume-agent", UserID: "usage-user-1", Type: model.CreditLogTypeAIConsume, Amount: -5, RelatedID: "agent-1", CreatedAt: "2026-08-07T02:00:00Z"})
	seedUsageLog(t, model.CreditLog{ID: "consume-unknown", UserID: "usage-user-1", Type: model.CreditLogTypeAIConsume, Amount: -2, RelatedID: "missing-1", CreatedAt: "2026-08-07T04:00:00Z"})
	seedUsageLog(t, model.CreditLog{ID: "consume-foreign", UserID: "usage-user-2", Type: model.CreditLogTypeAIConsume, Amount: -30, RelatedID: "foreign-1", CreatedAt: "2026-08-07T05:00:00Z"})

	result, err := ListAIUsageRecords(model.AIUsageRecordQuery{
		ExactUserID: "usage-user-1",
		StartAt:     "2026-08-07T00:00:00Z",
		EndAt:       "2026-08-08T00:00:00Z",
		Page:        1,
		PageSize:    20,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Total != 3 || len(result.Items) != 3 {
		t.Fatalf("result = %#v", result)
	}
	byID := usageRecordsByRelatedID(result.Items)
	if byID["task-1"].SourceType != model.AIUsageSourceAITask || byID["task-1"].NetCredits != 5 || byID["task-1"].Kind != "image" {
		t.Fatalf("task record = %#v", byID["task-1"])
	}
	if byID["agent-1"].SourceType != model.AIUsageSourceAgentRun || byID["agent-1"].Kind != "agent" {
		t.Fatalf("agent record = %#v", byID["agent-1"])
	}
	if byID["missing-1"].SourceType != model.AIUsageSourceUnknown || byID["missing-1"].Kind != "other" {
		t.Fatalf("unknown record = %#v", byID["missing-1"])
	}
}

func seedUsageUser(t *testing.T, id, username string, credits int) {
	t.Helper()
	stamp := "2026-08-07T00:00:00Z"
	_, err := repository.SaveUser(model.User{ID: id, Username: username, DisplayName: username, Role: model.UserRoleUser, Status: model.UserStatusActive, Credits: credits, AffCode: strings.ToUpper(id), CreatedAt: stamp, UpdatedAt: stamp})
	if err != nil {
		t.Fatal(err)
	}
}

func seedUsageTask(t *testing.T, item model.AITask) {
	t.Helper()
	if _, err := repository.SaveAITask(item); err != nil {
		t.Fatal(err)
	}
}

func seedUsageAgentRun(t *testing.T, item model.AgentRun) {
	t.Helper()
	if _, err := repository.SaveAgentRun(item); err != nil {
		t.Fatal(err)
	}
}

func seedUsageLog(t *testing.T, item model.CreditLog) {
	t.Helper()
	if _, err := repository.SaveCreditLog(item); err != nil {
		t.Fatal(err)
	}
}

func usageRecordsByRelatedID(items []model.AIUsageRecord) map[string]model.AIUsageRecord {
	result := make(map[string]model.AIUsageRecord, len(items))
	for _, item := range items {
		result[item.RelatedID] = item
	}
	return result
}
