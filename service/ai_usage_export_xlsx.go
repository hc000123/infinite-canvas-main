package service

import (
	"fmt"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/xuri/excelize/v2"
)

const aiUsageDetailSheet = "用量明细"

type aiUsageExportStyles struct {
	title, meta, header, body, date, percent, editable, warning int
}

func BuildAIUsageExportWorkbook(data model.AIUsageExportData) ([]byte, string, error) {
	book := excelize.NewFile()
	defer book.Close()
	if err := book.SetSheetName("Sheet1", "总览"); err != nil {
		return nil, "", err
	}
	for _, name := range []string{"按日统计", "按周统计", "按月统计", aiUsageDetailSheet} {
		if _, err := book.NewSheet(name); err != nil {
			return nil, "", err
		}
	}
	styles, err := newAIUsageExportStyles(book)
	if err != nil {
		return nil, "", err
	}
	if err := writeAIUsageDetailSheet(book, data, styles); err != nil {
		return nil, "", err
	}
	if err := writeAIUsageOverviewSheet(book, data, styles); err != nil {
		return nil, "", err
	}
	for _, item := range []struct {
		name string
		rows []model.AIUsageExportSummaryRow
	}{{"按日统计", data.Daily}, {"按周统计", data.Weekly}, {"按月统计", data.Monthly}} {
		if err := writeAIUsagePeriodSheet(book, item.name, item.rows, styles); err != nil {
			return nil, "", err
		}
	}
	auto, yes := "auto", true
	if err := book.SetCalcProps(&excelize.CalcPropsOptions{CalcMode: &auto, FullCalcOnLoad: &yes, CalcOnSave: &yes, ForceFullCalc: &yes}); err != nil {
		return nil, "", err
	}
	book.SetActiveSheet(0)
	buffer, err := book.WriteToBuffer()
	if err != nil {
		return nil, "", err
	}
	return buffer.Bytes(), aiUsageExportFilename(data.StartAt, data.EndAt), nil
}

func newAIUsageExportStyles(book *excelize.File) (aiUsageExportStyles, error) {
	create := func(style *excelize.Style) (int, error) { return book.NewStyle(style) }
	title, err := create(&excelize.Style{Font: &excelize.Font{Bold: true, Size: 16, Color: "1F2937"}})
	if err != nil {
		return aiUsageExportStyles{}, err
	}
	meta, err := create(&excelize.Style{Font: &excelize.Font{Color: "6B7280", Size: 10}})
	if err != nil {
		return aiUsageExportStyles{}, err
	}
	header, err := create(&excelize.Style{Font: &excelize.Font{Bold: true, Color: "FFFFFF"}, Fill: excelize.Fill{Type: "pattern", Color: []string{"334155"}, Pattern: 1}, Alignment: &excelize.Alignment{Vertical: "center"}, Protection: &excelize.Protection{Locked: true}})
	if err != nil {
		return aiUsageExportStyles{}, err
	}
	body, err := create(&excelize.Style{Border: usageExportBorders(), Alignment: &excelize.Alignment{Vertical: "center"}, Protection: &excelize.Protection{Locked: true}})
	if err != nil {
		return aiUsageExportStyles{}, err
	}
	dateFormat := "yyyy-mm-dd hh:mm"
	date, err := create(&excelize.Style{Border: usageExportBorders(), CustomNumFmt: &dateFormat, Protection: &excelize.Protection{Locked: true}})
	if err != nil {
		return aiUsageExportStyles{}, err
	}
	percent, err := create(&excelize.Style{Border: usageExportBorders(), NumFmt: 10, Protection: &excelize.Protection{Locked: true}})
	if err != nil {
		return aiUsageExportStyles{}, err
	}
	editable, err := create(&excelize.Style{Border: usageExportBorders(), Fill: excelize.Fill{Type: "pattern", Color: []string{"FFF7D6"}, Pattern: 1}, Protection: &excelize.Protection{Locked: false}})
	if err != nil {
		return aiUsageExportStyles{}, err
	}
	warning, err := create(&excelize.Style{Border: usageExportBorders(), Font: &excelize.Font{Color: "B45309"}, Fill: excelize.Fill{Type: "pattern", Color: []string{"FFFBEB"}, Pattern: 1}, Protection: &excelize.Protection{Locked: true}})
	if err != nil {
		return aiUsageExportStyles{}, err
	}
	return aiUsageExportStyles{title: title, meta: meta, header: header, body: body, date: date, percent: percent, editable: editable, warning: warning}, nil
}

func usageExportBorders() []excelize.Border {
	return []excelize.Border{{Type: "left", Color: "E5E7EB", Style: 1}, {Type: "right", Color: "E5E7EB", Style: 1}, {Type: "top", Color: "E5E7EB", Style: 1}, {Type: "bottom", Color: "E5E7EB", Style: 1}}
}

func writeAIUsageDetailSheet(book *excelize.File, data model.AIUsageExportData, styles aiUsageExportStyles) error {
	headers := []string{"时间", "成员", "用户 ID", "生成类型", "模型", "状态", "原始扣除", "已返还", "净消耗", "成功生成秒数", "实际采用秒数", "剪辑备注", "数据质量提示", "关联任务 ID"}
	for index, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(index+1, 1)
		if err := book.SetCellStr(aiUsageDetailSheet, cell, header); err != nil {
			return err
		}
	}
	if err := book.SetCellStyle(aiUsageDetailSheet, "A1", "N1", styles.header); err != nil {
		return err
	}
	editableSeconds := make([]string, 0)
	for index, record := range data.Records {
		row := index + 2
		qualityIssue := usageExportQualityIssue(record)
		createdAt, err := time.Parse(time.RFC3339, record.CreatedAt)
		if err != nil {
			return err
		}
		if err := book.SetCellValue(aiUsageDetailSheet, fmt.Sprintf("A%d", row), createdAt); err != nil {
			return err
		}
		texts := map[string]string{
			"B": usageExportUserDisplay(record.User, record.UserID), "C": record.UserID,
			"D": usageExportKindLabel(record.Kind), "E": usageExportModelLabel(record.Model),
			"F": usageExportStatusLabel(record.Status), "L": "", "M": qualityIssue, "N": record.RelatedID,
		}
		for column, value := range texts {
			if err := book.SetCellStr(aiUsageDetailSheet, fmt.Sprintf("%s%d", column, row), value); err != nil {
				return err
			}
		}
		for column, value := range map[string]int{"G": record.Credits, "H": record.CreditsRefunded, "I": record.NetCredits, "J": record.GeneratedSeconds} {
			if err := book.SetCellInt(aiUsageDetailSheet, fmt.Sprintf("%s%d", column, row), int64(value)); err != nil {
				return err
			}
		}
		if err := book.SetCellStyle(aiUsageDetailSheet, fmt.Sprintf("A%d", row), fmt.Sprintf("N%d", row), styles.body); err != nil {
			return err
		}
		if err := book.SetCellStyle(aiUsageDetailSheet, fmt.Sprintf("A%d", row), fmt.Sprintf("A%d", row), styles.date); err != nil {
			return err
		}
		if qualityIssue != "" {
			if err := book.SetCellStyle(aiUsageDetailSheet, fmt.Sprintf("M%d", row), fmt.Sprintf("M%d", row), styles.warning); err != nil {
				return err
			}
		}
		if record.Kind == "video" && record.Status == string(model.AITaskStatusSucceeded) && record.GeneratedSeconds > 0 {
			if err := book.SetCellStyle(aiUsageDetailSheet, fmt.Sprintf("K%d", row), fmt.Sprintf("L%d", row), styles.editable); err != nil {
				return err
			}
			editableSeconds = append(editableSeconds, fmt.Sprintf("K%d", row))
		}
	}
	if len(editableSeconds) > 0 {
		validation := excelize.NewDataValidation(true)
		validation.SetSqref(strings.Join(editableSeconds, " "))
		firstEditableRow := strings.TrimPrefix(editableSeconds[0], "K")
		if err := validation.SetRange(0, "J"+firstEditableRow, excelize.DataValidationTypeDecimal, excelize.DataValidationOperatorBetween); err != nil {
			return err
		}
		validation.SetError(excelize.DataValidationErrorStyleStop, "采用秒数无效", "实际采用秒数必须在 0 与本行成功生成秒数之间")
		if err := book.AddDataValidation(aiUsageDetailSheet, validation); err != nil {
			return err
		}
	}
	lastRow := len(data.Records) + 1
	if err := book.AutoFilter(aiUsageDetailSheet, fmt.Sprintf("A1:N%d", lastRow), nil); err != nil {
		return err
	}
	if err := book.SetPanes(aiUsageDetailSheet, &excelize.Panes{Freeze: true, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft"}); err != nil {
		return err
	}
	widths := map[string]float64{"A": 19, "B": 16, "C": 24, "D": 14, "E": 28, "F": 12, "G": 11, "H": 10, "I": 10, "J": 14, "K": 14, "L": 24, "M": 16, "N": 28}
	for column, width := range widths {
		if err := book.SetColWidth(aiUsageDetailSheet, column, column, width); err != nil {
			return err
		}
	}
	return book.ProtectSheet(aiUsageDetailSheet, &excelize.SheetProtectionOptions{AutoFilter: true, SelectUnlockedCells: true})
}

func writeAIUsageOverviewSheet(book *excelize.File, data model.AIUsageExportData, styles aiUsageExportStyles) error {
	const sheet = "总览"
	if err := writeAIUsageMeta(book, sheet, data, styles); err != nil {
		return err
	}
	headers := []string{"成员", "用户 ID", "净消耗积分", "成功视频数", "生成秒数", "实际采用秒数", "素材采用率"}
	if err := writeAIUsageHeaders(book, sheet, 4, headers, styles.header); err != nil {
		return err
	}
	for index, item := range data.Overview {
		row := index + 5
		if err := book.SetCellStr(sheet, fmt.Sprintf("A%d", row), aiUsageExportUserName(item)); err != nil {
			return err
		}
		if err := book.SetCellStr(sheet, fmt.Sprintf("B%d", row), item.UserID); err != nil {
			return err
		}
		for column, value := range map[string]int{"C": item.NetCredits, "D": item.SuccessfulVideoCount, "E": item.GeneratedSeconds} {
			if err := book.SetCellInt(sheet, fmt.Sprintf("%s%d", column, row), int64(value)); err != nil {
				return err
			}
		}
		if err := book.SetCellFormula(sheet, fmt.Sprintf("F%d", row), fmt.Sprintf("SUMIFS('%s'!$K:$K,'%s'!$C:$C,$B%d)", aiUsageDetailSheet, aiUsageDetailSheet, row)); err != nil {
			return err
		}
		if err := book.SetCellFormula(sheet, fmt.Sprintf("G%d", row), fmt.Sprintf("IF(E%d=0,\"\",F%d/E%d)", row, row, row)); err != nil {
			return err
		}
		if err := book.SetCellStyle(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("F%d", row), styles.body); err != nil {
			return err
		}
		if err := book.SetCellStyle(sheet, fmt.Sprintf("G%d", row), fmt.Sprintf("G%d", row), styles.percent); err != nil {
			return err
		}
	}
	lastRow := len(data.Overview) + 4
	if err := book.AutoFilter(sheet, fmt.Sprintf("A4:G%d", lastRow), nil); err != nil {
		return err
	}
	if err := book.SetPanes(sheet, &excelize.Panes{Freeze: true, YSplit: 4, TopLeftCell: "A5", ActivePane: "bottomLeft"}); err != nil {
		return err
	}
	for column, width := range map[string]float64{"A": 18, "B": 24, "C": 14, "D": 14, "E": 12, "F": 14, "G": 14} {
		if err := book.SetColWidth(sheet, column, column, width); err != nil {
			return err
		}
	}
	return book.ProtectSheet(sheet, &excelize.SheetProtectionOptions{AutoFilter: true, SelectLockedCells: true})
}

func writeAIUsagePeriodSheet(book *excelize.File, sheet string, rows []model.AIUsageExportSummaryRow, styles aiUsageExportStyles) error {
	headers := []string{"周期开始", "周期结束", "成员", "用户 ID", "生成类型", "模型", "净消耗积分", "成功视频数", "生成秒数", "实际采用秒数", "素材采用率"}
	if err := writeAIUsageHeaders(book, sheet, 1, headers, styles.header); err != nil {
		return err
	}
	for index, item := range rows {
		row := index + 2
		start, err := time.Parse(time.RFC3339, item.PeriodStart)
		if err != nil {
			return err
		}
		end, err := time.Parse(time.RFC3339, item.PeriodEnd)
		if err != nil {
			return err
		}
		if err := book.SetCellValue(sheet, fmt.Sprintf("A%d", row), start); err != nil {
			return err
		}
		if err := book.SetCellValue(sheet, fmt.Sprintf("B%d", row), end); err != nil {
			return err
		}
		for column, value := range map[string]string{"C": aiUsageExportUserName(item), "D": item.UserID, "E": usageExportKindLabel(item.Kind), "F": usageExportModelLabel(item.Model)} {
			if err := book.SetCellStr(sheet, fmt.Sprintf("%s%d", column, row), value); err != nil {
				return err
			}
		}
		for column, value := range map[string]int{"G": item.NetCredits, "H": item.SuccessfulVideoCount, "I": item.GeneratedSeconds} {
			if err := book.SetCellInt(sheet, fmt.Sprintf("%s%d", column, row), int64(value)); err != nil {
				return err
			}
		}
		formula := fmt.Sprintf("SUMIFS('%s'!$K:$K,'%s'!$C:$C,$D%d,'%s'!$D:$D,$E%d,'%s'!$E:$E,$F%d,'%s'!$A:$A,\">=\"&$A%d,'%s'!$A:$A,\"<\"&$B%d)", aiUsageDetailSheet, aiUsageDetailSheet, row, aiUsageDetailSheet, row, aiUsageDetailSheet, row, aiUsageDetailSheet, row, aiUsageDetailSheet, row)
		if err := book.SetCellFormula(sheet, fmt.Sprintf("J%d", row), formula); err != nil {
			return err
		}
		if err := book.SetCellFormula(sheet, fmt.Sprintf("K%d", row), fmt.Sprintf("IF(I%d=0,\"\",J%d/I%d)", row, row, row)); err != nil {
			return err
		}
		if err := book.SetCellStyle(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("J%d", row), styles.body); err != nil {
			return err
		}
		if err := book.SetCellStyle(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row), styles.date); err != nil {
			return err
		}
		if err := book.SetCellStyle(sheet, fmt.Sprintf("K%d", row), fmt.Sprintf("K%d", row), styles.percent); err != nil {
			return err
		}
	}
	lastRow := len(rows) + 1
	if err := book.AutoFilter(sheet, fmt.Sprintf("A1:K%d", lastRow), nil); err != nil {
		return err
	}
	if err := book.SetPanes(sheet, &excelize.Panes{Freeze: true, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft"}); err != nil {
		return err
	}
	for column, width := range map[string]float64{"A": 16, "B": 16, "C": 18, "D": 24, "E": 14, "F": 28, "G": 14, "H": 14, "I": 12, "J": 14, "K": 14} {
		if err := book.SetColWidth(sheet, column, column, width); err != nil {
			return err
		}
	}
	return book.ProtectSheet(sheet, &excelize.SheetProtectionOptions{AutoFilter: true, SelectLockedCells: true})
}

func writeAIUsageMeta(book *excelize.File, sheet string, data model.AIUsageExportData, styles aiUsageExportStyles) error {
	if err := book.SetCellStr(sheet, "A1", "AI 用量报表"); err != nil {
		return err
	}
	if err := book.SetCellStyle(sheet, "A1", "A1", styles.title); err != nil {
		return err
	}
	meta := fmt.Sprintf("统计范围：%s 至 %s（北京时间） · 成员：%s · 模型：%s", usageExportDate(data.StartAt), usageExportExclusiveEndDate(data.EndAt), usageExportFilter(data.UserFilter), usageExportFilter(data.ModelFilter))
	if err := book.SetCellStr(sheet, "A2", meta); err != nil {
		return err
	}
	if err := book.SetCellStyle(sheet, "A2", "A2", styles.meta); err != nil {
		return err
	}
	if err := book.SetCellStr(sheet, "A3", "导出时间："+usageExportTime(data.ExportedAt)+"（北京时间）"); err != nil {
		return err
	}
	return book.SetCellStyle(sheet, "A3", "A3", styles.meta)
}

func writeAIUsageHeaders(book *excelize.File, sheet string, row int, headers []string, style int) error {
	for index, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(index+1, row)
		if err := book.SetCellStr(sheet, cell, header); err != nil {
			return err
		}
	}
	end, _ := excelize.CoordinatesToCellName(len(headers), row)
	return book.SetCellStyle(sheet, fmt.Sprintf("A%d", row), end, style)
}

func aiUsageExportFilename(startAt, endAt string) string {
	return fmt.Sprintf("用量报表_%s_%s.xlsx", usageExportDate(startAt), usageExportExclusiveEndDate(endAt))
}

func usageExportDate(value string) string {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return "未知日期"
	}
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return parsed.Format("2006-01-02")
	}
	return parsed.In(location).Format("2006-01-02")
}

func usageExportTime(value string) string {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return "未知时间"
	}
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return parsed.Format("2006-01-02 15:04:05")
	}
	return parsed.In(location).Format("2006-01-02 15:04:05")
}

func usageExportExclusiveEndDate(value string) string {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return "未知日期"
	}
	return usageExportDate(parsed.Add(-time.Nanosecond).Format(time.RFC3339Nano))
}

func usageExportUserDisplay(user model.UserSummary, fallback string) string {
	if value := strings.TrimSpace(user.DisplayName); value != "" {
		return value
	}
	if value := strings.TrimSpace(user.Username); value != "" {
		return value
	}
	return fallback
}

func usageExportKindLabel(value string) string {
	if label, ok := map[string]string{"image": "图片生成", "video": "视频生成", "text": "文本生成", "agent": "智能体", "other": "其他"}[value]; ok {
		return label
	}
	return value
}

func usageExportModelLabel(value string) string {
	if strings.TrimSpace(value) == "" {
		return "未知"
	}
	return value
}

func usageExportStatusLabel(value string) string {
	if label, ok := map[string]string{"created": "已创建", "queued": "排队中", "running": "处理中", "succeeded": "成功", "applied": "已应用", "approved": "已通过", "failed": "失败", "cancelled": "已取消", "unknown": "未知"}[value]; ok {
		return label
	}
	return value
}

func usageExportQualityIssue(record model.AIUsageRecord) string {
	if record.SourceType == model.AIUsageSourceUnknown {
		return "来源未关联"
	}
	if record.DurationIssue == "missing_duration" {
		return "时长缺失"
	}
	return ""
}

func usageExportFilter(value string) string {
	if strings.TrimSpace(value) == "" {
		return "全部"
	}
	return value
}
