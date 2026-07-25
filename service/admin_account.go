package service

import (
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func ListAdminAccounts(actor model.AuthUser, q model.AdminAccountQuery) (model.UserList, error) {
	if !model.IsSuperAdminRole(actor.Role) {
		return model.UserList{}, safeMessageError{message: "需要超级管理员权限"}
	}
	users, total, err := repository.ListAdminAccounts(q)
	if err != nil {
		return model.UserList{}, err
	}
	for i := range users {
		users[i].Password = ""
		normalizeUserDefaults(&users[i])
	}
	return model.UserList{Items: users, Total: int(total)}, nil
}

func CreateAdminAccount(actor model.AuthUser, input model.AdminAccountUpdate, password string) (model.User, error) {
	if !model.IsSuperAdminRole(actor.Role) {
		return model.User{}, safeMessageError{message: "需要超级管理员权限"}
	}
	if !model.IsAdminRole(input.Role) {
		return model.User{}, safeMessageError{message: "管理员角色无效"}
	}
	if strings.TrimSpace(password) == "" {
		return model.User{}, safeMessageError{message: "密码不能为空"}
	}
	user := model.User{Username: input.Username, DisplayName: input.DisplayName, Email: input.Email, Role: input.Role, Status: input.Status}
	return saveUser(user, password)
}

func UpdateAdminAccount(actor model.AuthUser, id string, input model.AdminAccountUpdate) (model.User, error) {
	if !model.IsSuperAdminRole(actor.Role) {
		return model.User{}, safeMessageError{message: "需要超级管理员权限"}
	}
	if !model.IsAdminRole(input.Role) {
		return model.User{}, safeMessageError{message: "管理员角色无效"}
	}
	saved, ok, err := repository.GetUserByID(id)
	if err != nil {
		return model.User{}, err
	}
	if !ok || !model.IsAdminRole(saved.Role) {
		return model.User{}, safeMessageError{message: "管理员不存在"}
	}
	username := strings.TrimSpace(input.Username)
	if username == "" || strings.ContainsAny(username, " \t\r\n") {
		return model.User{}, safeMessageError{message: "用户名不能为空且不能包含空格"}
	}
	if existing, found, err := repository.GetUserByUsername(username); err != nil {
		return model.User{}, err
	} else if found && existing.ID != id {
		return model.User{}, safeMessageError{message: "用户名已存在"}
	}
	if input.Status == "" {
		input.Status = model.UserStatusActive
	}
	target := saved
	target.Username = username
	target.DisplayName = strings.TrimSpace(input.DisplayName)
	target.Email = strings.TrimSpace(input.Email)
	target.Role = input.Role
	target.Status = input.Status
	target.UpdatedAt = now()
	removesActiveSuper := input.Role != model.UserRoleSuperAdmin || input.Status != model.UserStatusActive
	target, err = repository.UpdatePrivilegedUser(actor.ID, target, removesActiveSuper)
	target.Password = ""
	return target, err
}

func ResetAdminAccountPassword(actor model.AuthUser, id string, password string) error {
	if !model.IsSuperAdminRole(actor.Role) {
		return safeMessageError{message: "需要超级管理员权限"}
	}
	if strings.TrimSpace(password) == "" {
		return safeMessageError{message: "密码不能为空"}
	}
	target, ok, err := repository.GetUserByID(id)
	if err != nil {
		return err
	}
	if !ok || !model.IsAdminRole(target.Role) {
		return safeMessageError{message: "管理员不存在"}
	}
	target.Password, err = hashPassword(password)
	if err != nil {
		return err
	}
	target.UpdatedAt = now()
	_, err = repository.UpdatePrivilegedUser(actor.ID, target, false)
	return err
}

func DeleteAdminAccount(actor model.AuthUser, id string) error {
	if !model.IsSuperAdminRole(actor.Role) {
		return safeMessageError{message: "需要超级管理员权限"}
	}
	return repository.DeletePrivilegedUser(actor.ID, id)
}
