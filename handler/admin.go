package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

type adminSyncRequest struct {
	Category string `json:"category"`
}

type adminBatchDeleteRequest struct {
	IDs []string `json:"ids"`
}

func AdminPromptCategories(w http.ResponseWriter, r *http.Request) {
	OK(w, service.ListPromptCategories())
}

func AdminPrompts(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListPrompts(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSavePrompt(w http.ResponseWriter, r *http.Request) {
	var item model.Prompt
	_ = json.NewDecoder(r.Body).Decode(&item)
	result, err := service.SavePrompt(item)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminDeletePrompt(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeletePrompt(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminDeletePrompts(w http.ResponseWriter, r *http.Request) {
	var request adminBatchDeleteRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	if err := service.DeletePrompts(request.IDs); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminSyncPromptCategories(w http.ResponseWriter, r *http.Request) {
	var request adminSyncRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	log.Printf("sync prompt category start category=%s", request.Category)
	categories, err := service.SyncPromptCategory(request.Category)
	if err != nil {
		log.Printf("sync prompt category failed category=%s err=%v", request.Category, err)
		FailError(w, err)
		return
	}
	log.Printf("sync prompt category done category=%s", request.Category)
	OK(w, categories)
}

func AdminAITasks(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListAdminAITasks(parseAITaskQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminAITask(w http.ResponseWriter, r *http.Request, id string) {
	result, err := service.GetAdminAITaskDetail(id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminRefreshAITask(w http.ResponseWriter, r *http.Request, id string) {
	result, err := service.RefreshAdminAITask(id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminRefundAITask(w http.ResponseWriter, r *http.Request, id string) {
	result, err := service.RefundAdminAITask(id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func parseAITaskQuery(r *http.Request) model.AITaskQuery {
	q := parseQuery(r)
	values := r.URL.Query()
	user := values.Get("user")
	if user == "" {
		user = values.Get("userId")
	}
	provider := values.Get("provider")
	if provider == "" {
		provider = values.Get("channel")
	}
	return model.AITaskQuery{
		Keyword:        q.Keyword,
		User:           user,
		Status:         values.Get("status"),
		Kind:           values.Get("kind"),
		ActionType:     values.Get("actionType"),
		Model:          values.Get("model"),
		Provider:       provider,
		UpstreamTaskID: values.Get("upstreamTaskId"),
		StartAt:        values.Get("startAt"),
		EndAt:          values.Get("endAt"),
		Page:           q.Page,
		PageSize:       q.PageSize,
	}
}
