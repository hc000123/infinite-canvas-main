package repository

import (
	"errors"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func SaveImageUpscaleJob(job model.ImageUpscaleJob) (model.ImageUpscaleJob, error) {
	database, err := DB()
	if err != nil {
		return job, err
	}
	return job, database.Save(&job).Error
}

func GetImageUpscaleJob(id string) (model.ImageUpscaleJob, bool, error) {
	database, err := DB()
	if err != nil {
		return model.ImageUpscaleJob{}, false, err
	}
	var job model.ImageUpscaleJob
	err = database.Where("id = ?", id).First(&job).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.ImageUpscaleJob{}, false, nil
	}
	return job, err == nil, err
}

func GetUserImageUpscaleJob(userID, id string) (model.ImageUpscaleJob, bool, error) {
	database, err := DB()
	if err != nil {
		return model.ImageUpscaleJob{}, false, err
	}
	var job model.ImageUpscaleJob
	err = database.Where("user_id = ? AND id = ?", userID, id).First(&job).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.ImageUpscaleJob{}, false, nil
	}
	return job, err == nil, err
}

func ListActiveImageUpscaleJobs() ([]model.ImageUpscaleJob, error) {
	database, err := DB()
	if err != nil {
		return nil, err
	}
	var jobs []model.ImageUpscaleJob
	err = database.Where("status IN ?", []model.ImageUpscaleJobStatus{
		model.ImageUpscaleJobStatusQueued,
		model.ImageUpscaleJobStatusProcessing,
		model.ImageUpscaleJobStatusDownloading,
	}).Find(&jobs).Error
	return jobs, err
}
