package service

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestNormalizeTencentMPSTemplatesSeedsBuiltIns(t *testing.T) {
	templates := normalizeTencentMPSTemplates(nil)
	if len(templates) != 6 {
		t.Fatalf("templates=%#v", templates)
	}
	want := map[int64][2]string{
		327004: {"comic", "1080p"},
		327006: {"comic", "2k"},
		327003: {"live", "1080p"},
		327005: {"live", "2k"},
		327022: {"restore", "1080p"},
		327023: {"restore", "2k"},
	}
	for _, item := range templates {
		expected, ok := want[item.Definition]
		if !ok || !item.Enabled || !item.Supported || item.Scene != expected[0] || item.Target != expected[1] {
			t.Fatalf("seed=%#v", item)
		}
	}
}

func TestMergeTencentMPSTemplatesPreservesAdminFields(t *testing.T) {
	saved := []model.TencentMPSTemplateSetting{{Definition: 400001, DisplayName: "我的清晰化", Scene: "custom", Target: "1080p", Enabled: true, Supported: true}}
	remote := []model.TencentMPSTemplateSetting{{Definition: 400001, UpstreamName: "Remote Name", SourceType: "Custom", Width: 1920, Height: 1080, Target: "1080p", Supported: true}}
	result := mergeTencentMPSTemplates(saved, remote)
	if len(result) != 1 || result[0].DisplayName != "我的清晰化" || !result[0].Enabled || result[0].UpstreamName != "Remote Name" {
		t.Fatalf("result=%#v", result)
	}
}

func TestNormalizeTencentMPSTemplatesDisablesUnsupportedEntries(t *testing.T) {
	items := []model.TencentMPSTemplateSetting{
		{Definition: 1, Enabled: true, Supported: true, Target: "4k"},
		{Definition: 2, Enabled: true, Supported: true, Target: "1080p", RemoveAudio: true},
	}
	result := normalizeTencentMPSTemplates(items)
	for _, item := range result {
		if item.Enabled || item.Supported {
			t.Fatalf("unsupported template remained enabled: %#v", item)
		}
	}
}
