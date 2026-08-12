package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func CacheCanvasMedia(w http.ResponseWriter, r *http.Request) {
	file, header, err := r.FormFile("file")
	if err != nil {
		Fail(w, "请选择缓存文件")
		return
	}
	defer file.Close()
	result, err := service.SaveCanvasMediaCache(file, header)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
