package service

import (
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

func TestBuildAIUsageExportDataGroupsDayWeekAndMonth(t *testing.T) {
	shanghai := time.FixedZone("Asia/Shanghai", 8*60*60)
	user := model.UserSummary{ID: "user-1", Username: "alice", DisplayName: "阿丽"}
	records := []model.AIUsageRecord{
		{ID: "video-1", UserID: user.ID, User: user, Kind: "video", Model: "video-model", Status: "succeeded", NetCredits: 12, GeneratedSeconds: 6, CreatedAt: "2026-08-30T10:00:00+08:00"},
		{ID: "video-2", UserID: user.ID, User: user, Kind: "video", Model: "video-model", Status: "succeeded", NetCredits: 16, GeneratedSeconds: 8, CreatedAt: "2026-08-31T10:00:00+08:00"},
		{ID: "image-1", UserID: user.ID, User: user, Kind: "image", Model: "image-model", Status: "succeeded", NetCredits: 4, CreatedAt: "2026-09-01T10:00:00+08:00"},
	}
	data, err := buildAIUsageExportData(records, model.AIUsageExportQuery{StartAt: "2026-08-30T00:00:00+08:00", EndAt: "2026-10-01T00:00:00+08:00"}, time.Date(2026, 10, 1, 9, 0, 0, 0, shanghai), shanghai)
	if err != nil {
		t.Fatal(err)
	}
	if len(data.Overview) != 1 || len(data.Daily) != 3 || len(data.Weekly) != 3 || len(data.Monthly) != 2 {
		t.Fatalf("groups overview=%d daily=%d weekly=%d monthly=%d", len(data.Overview), len(data.Daily), len(data.Weekly), len(data.Monthly))
	}
	if data.Overview[0].NetCredits != 32 || data.Overview[0].SuccessfulVideoCount != 2 || data.Overview[0].GeneratedSeconds != 14 {
		t.Fatalf("overview = %#v", data.Overview[0])
	}
}
