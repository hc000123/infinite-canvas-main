package handler

import (
	"log"
	"mime"
	"net/http"
	"strconv"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func AdminAIUsageExport(w http.ResponseWriter, r *http.Request) {
	values := r.URL.Query()
	data, err := service.BuildAdminAIUsageExportData(model.AIUsageExportQuery{
		User: values.Get("user"), Model: values.Get("model"),
		StartAt: values.Get("startAt"), EndAt: values.Get("endAt"),
	}, time.Now())
	if err != nil {
		FailError(w, err)
		return
	}
	body, filename, err := service.BuildAIUsageExportWorkbook(data)
	if err != nil {
		FailError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	if _, err := w.Write(body); err != nil {
		log.Printf("write AI usage export failed: %v", err)
	}
}
