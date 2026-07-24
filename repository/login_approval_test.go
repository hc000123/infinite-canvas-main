package repository

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestDecideLoginApprovalIsAtomic(t *testing.T) {
	setupRepositoryTestDB(t)
	item := model.LoginApproval{ID: "approval-1", UserID: "user-1", RequestedIP: "203.0.113.8", TokenHash: "hash", Status: model.LoginApprovalPending, ExpiresAt: "2099-01-01T00:00:00Z", CreatedAt: "2026-07-24T10:00:00Z"}
	if _, err := SaveLoginApproval(item); err != nil {
		t.Fatalf("save: %v", err)
	}
	updated, ok, err := DecideLoginApproval(item.ID, model.LoginApprovalApproved, model.LoginApprovalScopeOnce, "super-1", "2026-07-24T10:01:00Z")
	if err != nil || !ok || updated.Status != model.LoginApprovalApproved {
		t.Fatalf("first decision=%#v ok=%v err=%v", updated, ok, err)
	}
	if _, ok, err := DecideLoginApproval(item.ID, model.LoginApprovalRejected, "", "super-1", "2026-07-24T10:02:00Z"); err != nil || ok {
		t.Fatalf("duplicate decision ok=%v err=%v", ok, err)
	}
}
