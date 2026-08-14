package repository

import (
	"errors"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func SaveVideoSubtitleEraseJob(job model.VideoSubtitleEraseJob) (model.VideoSubtitleEraseJob, error) {
	database, err := DB()
	if err != nil {
		return job, err
	}
	return job, database.Save(&job).Error
}

func GetVideoSubtitleEraseJob(id string) (model.VideoSubtitleEraseJob, bool, error) {
	database, err := DB()
	if err != nil {
		return model.VideoSubtitleEraseJob{}, false, err
	}
	var job model.VideoSubtitleEraseJob
	err = database.Where("id = ?", id).First(&job).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.VideoSubtitleEraseJob{}, false, nil
	}
	return job, err == nil, err
}

func GetUserVideoSubtitleEraseJob(userID, id string) (model.VideoSubtitleEraseJob, bool, error) {
	database, err := DB()
	if err != nil {
		return model.VideoSubtitleEraseJob{}, false, err
	}
	var job model.VideoSubtitleEraseJob
	err = database.Where("user_id = ? AND id = ?", userID, id).First(&job).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.VideoSubtitleEraseJob{}, false, nil
	}
	return job, err == nil, err
}

func ListActiveVideoSubtitleEraseJobs() ([]model.VideoSubtitleEraseJob, error) {
	database, err := DB()
	if err != nil {
		return nil, err
	}
	var jobs []model.VideoSubtitleEraseJob
	err = database.Where("status IN ?", []model.VideoSubtitleEraseJobStatus{
		model.VideoSubtitleEraseJobStatusQueued,
		model.VideoSubtitleEraseJobStatusUploading,
		model.VideoSubtitleEraseJobStatusProcessing,
		model.VideoSubtitleEraseJobStatusDownloading,
	}).Find(&jobs).Error
	return jobs, err
}
