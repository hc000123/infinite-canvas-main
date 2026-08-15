package service

import (
	"context"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	mps "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/mps/v20190612"
)

type fakeTencentTemplateAPI struct {
	requests []*mps.DescribeTranscodeTemplatesRequest
	pages    []*mps.DescribeTranscodeTemplatesResponse
}

func (fake *fakeTencentTemplateAPI) DescribeTranscodeTemplatesWithContext(_ context.Context, request *mps.DescribeTranscodeTemplatesRequest) (*mps.DescribeTranscodeTemplatesResponse, error) {
	fake.requests = append(fake.requests, request)
	return fake.pages[len(fake.requests)-1], nil
}

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

func TestListTencentMPSEnhancementTemplatesUsesReadOnlyPagination(t *testing.T) {
	fake := &fakeTencentTemplateAPI{pages: []*mps.DescribeTranscodeTemplatesResponse{
		tencentTemplatePage(150, tencentTemplate("400001", "自定义清晰化", "Custom", 1920, 1080, false)),
		tencentTemplatePage(150, tencentTemplate("400002", "自定义 2K", "Custom", 2560, 1440, false)),
	}}
	items, err := listTencentMPSEnhancementTemplates(context.Background(), fake)
	if err != nil || len(items) != 2 || len(fake.requests) != 2 {
		t.Fatalf("items=%#v requests=%d err=%v", items, len(fake.requests), err)
	}
	if pointerString(fake.requests[0].TranscodeType) != "Enhance" || *fake.requests[0].Limit != 100 || *fake.requests[0].Offset != 0 || *fake.requests[1].Offset != 100 {
		t.Fatalf("requests=%#v", fake.requests)
	}
	if items[0].Definition != 400001 || items[0].Target != "1080p" || !items[0].Supported || items[0].Enabled {
		t.Fatalf("mapped template=%#v", items[0])
	}
}

func tencentTemplatePage(total uint64, items ...*mps.TranscodeTemplate) *mps.DescribeTranscodeTemplatesResponse {
	return &mps.DescribeTranscodeTemplatesResponse{Response: &mps.DescribeTranscodeTemplatesResponseParams{TotalCount: &total, TranscodeTemplateSet: items}}
}

func tencentTemplate(definition, name, sourceType string, width, height uint64, removeAudio bool) *mps.TranscodeTemplate {
	removeVideo, removeAudioValue := int64(0), int64(0)
	if removeAudio {
		removeAudioValue = 1
	}
	codec, fps := "h264", int64(0)
	return &mps.TranscodeTemplate{
		Definition:    &definition,
		Name:          &name,
		Type:          &sourceType,
		RemoveVideo:   &removeVideo,
		RemoveAudio:   &removeAudioValue,
		VideoTemplate: &mps.VideoTemplateInfo{Width: &width, Height: &height, Codec: &codec, Fps: &fps},
	}
}
