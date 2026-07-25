package service

import (
	"context"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestReportUserActivityUsesServerIdentityAndSanitizesPayload(t *testing.T) {
	setupAITaskTestDB(t)
	_, _ = saveAITaskTestUser("user-activity", 20)
	ctx := WithUser(context.Background(), model.AuthUser{ID: "user-activity", Username: "activity", Role: model.UserRoleUser})
	ctx = WithRequestMeta(ctx, RequestMeta{IPAddress: "203.0.113.8", UserAgent: strings.Repeat("x", 800), SessionID: "session-1"})
	item, err := ReportUserActivity(ctx, UserActivityReport{Action: string(model.ActivityActionProjectCreated), TargetType: "project", TargetID: "project-1", TargetName: strings.Repeat("项", 300), Summary: "创建项目", ClientEventID: "client-event-1", Metadata: map[string]any{"projectId": "project-1", "apiKey": "secret"}})
	if err != nil {
		t.Fatalf("ReportUserActivity: %v", err)
	}
	if item.UserID != "user-activity" || item.IPAddress != "203.0.113.8" || item.SessionID != "session-1" {
		t.Fatalf("server fields=%#v", item)
	}
	if strings.Contains(item.Metadata, "secret") || len([]rune(item.TargetName)) > 120 || len(item.UserAgent) > 512 {
		t.Fatalf("unsanitized=%#v", item)
	}
}

func TestReportUserActivityRejectsHighFrequencyOrUnknownAction(t *testing.T) {
	ctx := WithUser(context.Background(), model.AuthUser{ID: "user-activity", Role: model.UserRoleUser})
	if _, err := ReportUserActivity(ctx, UserActivityReport{Action: "canvas.node_dragged", ClientEventID: "client-event-2"}); err == nil {
		t.Fatal("high-frequency action accepted")
	}
}
