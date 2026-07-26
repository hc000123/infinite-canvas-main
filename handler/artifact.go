package handler

import (
	"net/http"
	"strconv"

	"github.com/basketikun/infinite-canvas/service"
)

func CreateArtifact(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.CreateArtifactInput
	if !decodeStrictBody(w, r, &input, 2<<20) {
		return
	}
	result, err := service.CreateArtifact(user.ID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func Artifacts(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	query := r.URL.Query()
	page, _ := strconv.Atoi(query.Get("page"))
	pageSize, _ := strconv.Atoi(query.Get("pageSize"))
	result, err := service.ListArtifacts(user.ID, service.ArtifactQuery{
		ProjectID: query.Get("project"), EpisodeID: query.Get("episode"), ArtifactType: query.Get("type"),
		ProducerInvocationID: query.Get("producerInvocation"), ApprovalState: query.Get("approvalState"),
		Page: page, PageSize: pageSize,
	})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func Artifact(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.GetArtifact(user.ID, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
