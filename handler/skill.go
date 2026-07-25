package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func SkillOptions(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.UserFromContext(r.Context()); !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	query := r.URL.Query()
	items, err := service.ListSkillOptions(query.Get("projectId"), service.SkillOptionFilter{
		Capability: query.Get("capability"), InputArtifactType: query.Get("inputArtifactType"), OutputArtifactType: query.Get("outputArtifactType"),
	})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}
