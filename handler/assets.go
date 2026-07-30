package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func Assets(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListAssets(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminAssets(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListAssets(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSaveAsset(w http.ResponseWriter, r *http.Request) {
	var item model.Asset
	_ = json.NewDecoder(r.Body).Decode(&item)
	result, err := service.SaveAsset(item)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminAssetProjects(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListAssetProjects()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSaveAssetProject(w http.ResponseWriter, r *http.Request, id string) {
	var item model.AssetProject
	_ = json.NewDecoder(r.Body).Decode(&item)
	item.ID = id
	result, err := service.SaveAssetProject(item)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminDeleteAssetProject(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeleteAssetProject(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminAssetFolders(w http.ResponseWriter, r *http.Request, projectID string) {
	result, err := service.ListAssetFolders(projectID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSaveAssetFolder(w http.ResponseWriter, r *http.Request, projectID string, folderID string) {
	var item model.AssetFolder
	_ = json.NewDecoder(r.Body).Decode(&item)
	item.ID = folderID
	item.ProjectID = projectID
	result, err := service.SaveAssetFolder(item)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminDeleteAssetFolder(w http.ResponseWriter, r *http.Request, projectID string, folderID string) {
	if err := service.DeleteAssetFolder(projectID, folderID); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminUploadAssetMedia(w http.ResponseWriter, r *http.Request) {
	file, header, err := r.FormFile("file")
	if err != nil {
		Fail(w, "请选择素材文件")
		return
	}
	defer file.Close()
	result, err := service.ImportAssetMedia(r.FormValue("projectId"), r.FormValue("folderId"), file, header)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminBatchUpdateAssets(w http.ResponseWriter, r *http.Request) {
	var input service.AssetBatchUpdate
	_ = json.NewDecoder(r.Body).Decode(&input)
	result, err := service.BatchUpdateAssets(input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminBatchDeleteAssets(w http.ResponseWriter, r *http.Request) {
	var input service.AssetBatchDelete
	_ = json.NewDecoder(r.Body).Decode(&input)
	if err := service.BatchDeleteAssets(input); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

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

func AdminDeleteAsset(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeleteAsset(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}
