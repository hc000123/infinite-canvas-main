package service

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestGetAdminUserOverviewReturnsScopedUsage(t *testing.T) {
	setupAITaskTestDB(t)
	user, err := saveAITaskTestUser("user-overview", 80)
	if err != nil {
		t.Fatalf("save user: %v", err)
	}
	user.Username = "overview-name"
	_, _ = repository.SaveUser(user)
	for i := 0; i < 2; i++ {
		saveAITaskForAdminTest(t, model.AITask{UserID: user.ID, Kind: "image", Status: model.AITaskStatusSucceeded, Credits: 5})
	}
	_, _ = repository.SaveCreditLog(model.CreditLog{ID: "overview-consume", UserID: user.ID, Type: model.CreditLogTypeAIConsume, Amount: -10, Balance: 90, CreatedAt: now()})
	result, err := GetAdminUserOverview(user.ID)
	if err != nil || result.User.Username != "overview-name" || result.AITaskCount != 2 || result.AICreditsConsumed != 10 {
		t.Fatalf("overview=%#v err=%v", result, err)
	}
}

func TestAdminUserUsageListsAreExactlyScoped(t *testing.T) {
	setupAITaskTestDB(t)
	_, _ = saveAITaskTestUser("user-scope-a", 20)
	_, _ = saveAITaskTestUser("user-scope-ab", 20)
	saveAITaskForAdminTest(t, model.AITask{UserID: "user-scope-a", Kind: "image", Status: model.AITaskStatusSucceeded})
	saveAITaskForAdminTest(t, model.AITask{UserID: "user-scope-ab", Kind: "image", Status: model.AITaskStatusSucceeded})
	tasks, err := ListAdminUserAITasks("user-scope-a", model.AITaskQuery{Page: 1, PageSize: 10})
	if err != nil || tasks.Total != 1 || tasks.Items[0].UserID != "user-scope-a" {
		t.Fatalf("tasks=%#v err=%v", tasks, err)
	}
}
