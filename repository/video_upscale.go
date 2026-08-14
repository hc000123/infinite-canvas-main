package repository

import (
	"errors"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func SaveVideoUpscaleJob(job model.VideoUpscaleJob) (model.VideoUpscaleJob, error) {
	database, err := DB()
	if err != nil {
		return job, err
	}
	return job, database.Save(&job).Error
}

func GetVideoUpscaleJob(id string) (model.VideoUpscaleJob, bool, error) {
	database, err := DB()
	if err != nil {
		return model.VideoUpscaleJob{}, false, err
	}
	var job model.VideoUpscaleJob
	err = database.Where("id = ?", id).First(&job).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.VideoUpscaleJob{}, false, nil
	}
	return job, err == nil, err
}

func GetUserVideoUpscaleJob(userID, id string) (model.VideoUpscaleJob, bool, error) {
	database, err := DB()
	if err != nil {
		return model.VideoUpscaleJob{}, false, err
	}
	var job model.VideoUpscaleJob
	err = database.Where("user_id = ? AND id = ?", userID, id).First(&job).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.VideoUpscaleJob{}, false, nil
	}
	return job, err == nil, err
}

func ListActiveVideoUpscaleJobs() ([]model.VideoUpscaleJob, error) {
	database, err := DB()
	if err != nil {
		return nil, err
	}
	var jobs []model.VideoUpscaleJob
	err = database.Where("status IN ?", []model.VideoUpscaleJobStatus{
		model.VideoUpscaleJobStatusQueued,
		model.VideoUpscaleJobStatusUploading,
		model.VideoUpscaleJobStatusProcessing,
		model.VideoUpscaleJobStatusDownloading,
	}).Find(&jobs).Error
	return jobs, err
}
