package service

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestEnsureAgentSeedsReferencesPublishedSkills(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	if err := EnsureAgentSeeds(); err != nil {
		t.Fatal(err)
	}
	if err := EnsureAgentSeeds(); err != nil {
		t.Fatal(err)
	}
	items, err := ListVisibleAgents("user-1", "project-1")
	if err != nil || len(items) != 7 {
		t.Fatalf("items=%d err=%v", len(items), err)
	}
	seen := map[string]bool{}
	for _, item := range items {
		if item.Agent.OwnerType != model.AgentOwnerSystem || item.RecommendedPackage == nil || len(item.RecommendedPackage.DefaultSkillRefs) == 0 {
			t.Fatalf("invalid seed item: %#v", item)
		}
		if seen[item.Agent.ID] {
			t.Fatalf("duplicate Agent seed %s", item.Agent.ID)
		}
		seen[item.Agent.ID] = true
		for _, ref := range item.RecommendedPackage.DefaultSkillRefs {
			_, version, ok, err := repository.GetSkillWithVersion(ref.SkillVersionID)
			if err != nil || !ok || version.Status != model.SkillVersionPublished || version.Version != skillInvocationSeedVersion {
				t.Fatalf("ref=%#v version=%#v ok=%v err=%v", ref, version, ok, err)
			}
		}
	}
}
