package service

import (
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func GetAdminUserOverview(id string) (model.AdminUserOverview, error) {
	user, ok, err := repository.GetUserByID(strings.TrimSpace(id))
	if err != nil {
		return model.AdminUserOverview{}, err
	}
	if !ok || user.Role != model.UserRoleUser {
		return model.AdminUserOverview{}, safeMessageError{message: "用户不存在"}
	}
	user.Password = ""
	tasks, consumed, logs, err := repository.AdminUserUsageTotals(user.ID)
	if err != nil {
		return model.AdminUserOverview{}, err
	}
	return model.AdminUserOverview{User: user, AITaskCount: int(tasks), AICreditsConsumed: int(consumed), CreditLogCount: int(logs)}, nil
}

func ListAdminUserAITasks(id string, q model.AITaskQuery) (model.AITaskList, error) {
	q.ExactUserID = strings.TrimSpace(id)
	return ListAdminAITasks(q)
}

func ListAdminUserCreditLogs(id string, q model.Query) (model.CreditLogList, error) {
	logs, total, err := repository.ListCreditLogsForUser(strings.TrimSpace(id), q)
	if err != nil {
		return model.CreditLogList{}, err
	}
	logs, err = hydrateCreditLogUsers(logs)
	return model.CreditLogList{Items: logs, Total: int(total)}, err
}
