package service

import (
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestSystemAgentAdminLifecycle(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureAgentSeeds(); err != nil {
		t.Fatal(err)
	}
	items, err := ListSystemAgentAdminItems()
	if err != nil || len(items) != 7 {
		t.Fatalf("items=%d err=%v", len(items), err)
	}
	var scriptItem AgentRegistryItem
	for _, item := range items {
		if item.Agent.ID == "agent-system-script" {
			scriptItem = item
		}
		if item.Agent.OwnerType != model.AgentOwnerSystem {
			t.Fatalf("non-system Agent exposed: %#v", item.Agent)
		}
	}
	if scriptItem.RecommendedPackage == nil {
		t.Fatal("system script Agent has no recommended package")
	}
	packageValue := *scriptItem.RecommendedPackage
	packageValue.RolePrompt += "\n管理员补充：优先检查生产格式。"
	packageValue.ContentHash = ""
	input := AgentDraftInput{Version: "1.0.1", Package: packageValue}
	if _, err := CreateAgentDraft("user-1", scriptItem.Agent.ID, input); err == nil || !strings.Contains(err.Error(), "不可编辑") {
		t.Fatalf("project path edited system Agent: %v", err)
	}
	draft, err := CreateSystemAgentDraft("admin-1", scriptItem.Agent.ID, input)
	if err != nil || draft.Status != model.AgentVersionDraft {
		t.Fatalf("draft=%#v err=%v", draft, err)
	}
	updatedPackage := packageValue
	updatedPackage.RolePrompt += "\n发布前复核。"
	updatedPackage.ContentHash = ""
	updated, err := UpdateSystemAgentDraft("admin-1", draft.ID, AgentDraftInput{Version: draft.Version, Package: updatedPackage})
	if err != nil || updated.ContentHash == draft.ContentHash {
		t.Fatalf("updated=%#v err=%v", updated, err)
	}
	validation, err := ValidateSystemAgentVersion("admin-1", draft.ID)
	if err != nil || validation.ContentHash != updated.ContentHash {
		t.Fatalf("validation=%#v err=%v", validation, err)
	}
	published, err := PublishSystemAgentVersion("admin-1", draft.ID)
	if err != nil || published.Version.Status != model.AgentVersionPublished {
		t.Fatalf("published=%#v err=%v", published, err)
	}
	recommended, err := RecommendSystemAgentVersion("admin-1", scriptItem.Agent.ID, draft.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := EnsureAgentSeeds(); err != nil {
		t.Fatal(err)
	}
	agent, ok, err := repository.GetAgentDefinition(scriptItem.Agent.ID)
	if err != nil || !ok || agent.RecommendedVersionID != recommended.Version.ID {
		t.Fatalf("agent=%#v ok=%v err=%v", agent, ok, err)
	}
	detail, err := GetSystemAgentVersion(draft.ID)
	if err != nil || detail.Package.RolePrompt != updatedPackage.RolePrompt {
		t.Fatalf("detail=%#v err=%v", detail, err)
	}
}
