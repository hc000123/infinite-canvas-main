package repository

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestSaveUserActivityIsIdempotentPerUser(t *testing.T) {
	setupRepositoryTestDB(t)
	item := model.UserActivityLog{ID: "activity-1", UserID: "user-1", Category: model.ActivityCategoryProject, Action: model.ActivityActionProjectCreated, Result: model.ActivityResultSuccess, ClientEventID: "client-1", CreatedAt: "2026-07-24T10:00:00Z"}
	if _, err := SaveUserActivity(item); err != nil {
		t.Fatalf("first save: %v", err)
	}
	item.ID = "activity-2"
	saved, err := SaveUserActivity(item)
	if err != nil || saved.ID != "activity-1" {
		t.Fatalf("second save=%#v err=%v", saved, err)
	}
}

func TestListUserActivitiesScopesAndFilters(t *testing.T) {
	setupRepositoryTestDB(t)
	db, _ := DB()
	items := []model.UserActivityLog{
		{ID: "activity-ai", UserID: "user-a", Category: model.ActivityCategoryAI, Action: model.ActivityActionAISucceeded, Result: model.ActivityResultSuccess, IPAddress: "203.0.113.1", IPAllowed: false, ClientEventID: "server:ai", CreatedAt: "2026-07-24T11:00:00Z"},
		{ID: "activity-project", UserID: "user-a", Category: model.ActivityCategoryProject, Action: model.ActivityActionProjectCreated, Result: model.ActivityResultSuccess, IPAddress: "10.0.0.1", IPAllowed: true, ClientEventID: "server:project", CreatedAt: "2026-07-24T10:00:00Z"},
		{ID: "activity-other", UserID: "user-b", Category: model.ActivityCategoryAI, Action: model.ActivityActionAISucceeded, Result: model.ActivityResultSuccess, IPAddress: "203.0.113.2", IPAllowed: false, ClientEventID: "server:other", CreatedAt: "2026-07-24T09:00:00Z"},
	}
	if err := db.Create(&items).Error; err != nil {
		t.Fatalf("create activities: %v", err)
	}
	logs, total, err := ListUserActivities(model.UserActivityQuery{ExactUserID: "user-a", Category: string(model.ActivityCategoryAI), OutsideIPOnly: true, Query: model.Query{Page: 1, PageSize: 10}})
	if err != nil || total != 1 || len(logs) != 1 || logs[0].ID != "activity-ai" {
		t.Fatalf("logs=%#v total=%d err=%v", logs, total, err)
	}
}
