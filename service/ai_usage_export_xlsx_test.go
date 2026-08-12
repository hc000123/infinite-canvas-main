package service

import (
	"bytes"
	"reflect"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/xuri/excelize/v2"
)

func TestBuildAIUsageExportWorkbook(t *testing.T) {
	user := model.UserSummary{ID: "user-1", Username: "alice", DisplayName: "阿丽"}
	summary := model.AIUsageExportSummaryRow{UserID: user.ID, User: user, Kind: "video", Model: "video-model", NetCredits: 12, SuccessfulVideoCount: 1, GeneratedSeconds: 6, PeriodStart: "2026-08-01T00:00:00+08:00", PeriodEnd: "2026-08-02T00:00:00+08:00"}
	data := model.AIUsageExportData{
		StartAt: "2026-08-01T00:00:00+08:00", EndAt: "2026-09-01T00:00:00+08:00", ExportedAt: "2026-09-01T09:00:00+08:00",
		Overview: []model.AIUsageExportSummaryRow{{UserID: user.ID, User: user, NetCredits: 12, SuccessfulVideoCount: 1, GeneratedSeconds: 6}},
		Daily:    []model.AIUsageExportSummaryRow{summary}, Weekly: []model.AIUsageExportSummaryRow{summary}, Monthly: []model.AIUsageExportSummaryRow{summary},
		Records: []model.AIUsageRecord{{ID: "task-1", RelatedID: "task-1", UserID: user.ID, User: user, Kind: "video", Model: "video-model", Status: "succeeded", Credits: 12, NetCredits: 12, GeneratedSeconds: 6, CreatedAt: "2026-08-01T10:00:00+08:00"}},
	}
	body, filename, err := BuildAIUsageExportWorkbook(data)
	if err != nil {
		t.Fatal(err)
	}
	book, err := excelize.OpenReader(bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer book.Close()
	want := []string{"总览", "按日统计", "按周统计", "按月统计", "用量明细"}
	if !reflect.DeepEqual(book.GetSheetList(), want) {
		t.Fatalf("sheets = %#v", book.GetSheetList())
	}
	formula, _ := book.GetCellFormula("总览", "F5")
	if !strings.Contains(formula, "SUMIFS") {
		t.Fatalf("formula = %q", formula)
	}
	if filename != "用量报表_2026-08-01_2026-08-31.xlsx" {
		t.Fatalf("filename = %q", filename)
	}
}

func TestAIUsageExportWorkbookTreatsExternalTextAsText(t *testing.T) {
	user := model.UserSummary{ID: "user-formula", DisplayName: `=HYPERLINK("https://example.com")`}
	data := model.AIUsageExportData{StartAt: "2026-08-01T00:00:00+08:00", EndAt: "2026-08-02T00:00:00+08:00", Overview: []model.AIUsageExportSummaryRow{{UserID: user.ID, User: user}}, Records: []model.AIUsageRecord{{RelatedID: "task-1", UserID: user.ID, User: user, Kind: "image", Status: "succeeded", CreatedAt: "2026-08-01T10:00:00+08:00"}}}
	body, _, err := BuildAIUsageExportWorkbook(data)
	if err != nil {
		t.Fatal(err)
	}
	book, err := excelize.OpenReader(bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer book.Close()
	formula, _ := book.GetCellFormula("总览", "A5")
	value, _ := book.GetCellValue("总览", "A5")
	if formula != "" || !strings.HasPrefix(value, "=") {
		t.Fatalf("formula=%q value=%q", formula, value)
	}
}

func TestAIUsageExportWorkbookValidationUsesFirstEditableRow(t *testing.T) {
	user := model.UserSummary{ID: "user-1", DisplayName: "导出用户"}
	data := model.AIUsageExportData{
		StartAt: "2026-08-01T00:00:00+08:00", EndAt: "2026-08-03T00:00:00+08:00", ExportedAt: "2026-08-03T09:00:00+08:00",
		Overview: []model.AIUsageExportSummaryRow{{UserID: user.ID, User: user}},
		Records: []model.AIUsageRecord{
			{RelatedID: "unknown-1", UserID: user.ID, User: user, Kind: "other", Status: "unknown", SourceType: model.AIUsageSourceUnknown, CreatedAt: "2026-08-01T10:00:00+08:00"},
			{RelatedID: "video-1", UserID: user.ID, User: user, Kind: "video", Status: "succeeded", SourceType: model.AIUsageSourceAITask, GeneratedSeconds: 6, CreatedAt: "2026-08-02T10:00:00+08:00"},
		},
	}
	body, _, err := BuildAIUsageExportWorkbook(data)
	if err != nil {
		t.Fatal(err)
	}
	book, err := excelize.OpenReader(bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer book.Close()
	validations, err := book.GetDataValidations(aiUsageDetailSheet)
	if err != nil || len(validations) != 1 {
		t.Fatalf("validations=%#v err=%v", validations, err)
	}
	if validations[0].Sqref != "K3" || validations[0].Formula2 != "J3" {
		t.Fatalf("validation=%#v", validations[0])
	}
	quality, _ := book.GetCellValue(aiUsageDetailSheet, "M2")
	if quality != "来源未关联" {
		t.Fatalf("quality=%q", quality)
	}
}
