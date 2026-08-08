package router

import (
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/handler"
	"github.com/basketikun/infinite-canvas/middleware"
	"github.com/gin-gonic/gin"
)

func New() *gin.Engine {
	router := gin.Default()
	router.RedirectTrailingSlash = false
	_ = router.SetTrustedProxies(config.Cfg.TrustedProxies)
	router.Use(middleware.RequestMeta)
	router.Use(uploadedAssetSecurityHeaders)
	api := router.Group("/api")
	api.GET("/health", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})
	api.POST("/auth/register", gin.WrapF(handler.Register))
	api.POST("/auth/login", gin.WrapF(handler.Login))
	api.GET("/auth/login-approval/status", gin.WrapF(handler.LoginApprovalStatus))
	api.POST("/auth/login-approval/exchange", gin.WrapF(handler.ExchangeLoginApproval))
	api.GET("/auth/me", middleware.OptionalAuth, gin.WrapF(handler.CurrentUser))
	api.GET("/settings", gin.WrapF(handler.Settings))
	api.Static("/uploaded-assets", config.Cfg.PublicAssetDir)
	me := api.Group("/me", middleware.UserAuth)
	me.GET("/ai-usage-summary", gin.WrapF(handler.UserAIUsageSummary))
	me.GET("/ai-usage-records", gin.WrapF(handler.UserAIUsageRecords))
	v1 := api.Group("/v1", middleware.UserAuth)
	v1.POST("/images/generations", middleware.AuditAIToolUse, gin.WrapF(handler.AIImagesGenerations))
	v1.POST("/images/edits", middleware.AuditAIToolUse, gin.WrapF(handler.AIImagesEdits))
	v1.POST("/chat/completions", middleware.AuditAIToolUse, gin.WrapF(handler.AIChatCompletions))
	v1.POST("/responses", middleware.AuditAIToolUse, gin.WrapF(handler.AIResponses))
	v1.POST("/videos", middleware.AuditAIToolUse, gin.WrapF(handler.AIVideos))
	v1.GET("/videos/preflight", gin.WrapF(handler.AIVideoPreflight))
	v1.POST("/jimeng-login/start", gin.WrapF(handler.UserStartJimengLogin))
	v1.POST("/jimeng-login/check", gin.WrapF(handler.UserCheckJimengLogin))
	v1.GET("/agent-configs", gin.WrapF(handler.AgentConfigs))
	v1.POST("/agent-configs", gin.WrapF(handler.SaveAgentConfig))
	v1.GET("/agent-runs", gin.WrapF(handler.AgentRuns))
	v1.POST("/agent-runs", gin.WrapF(handler.CreateAgentRun))
	v1.GET("/agents", gin.WrapF(handler.Agents))
	v1.POST("/agents", gin.WrapF(handler.CreateAgent))
	v1.GET("/agents/:id", func(c *gin.Context) {
		handler.AgentDetail(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/agents/:id/versions", func(c *gin.Context) {
		handler.CreateAgentVersion(c.Writer, c.Request, c.Param("id"))
	})
	v1.GET("/agent-versions/:id", func(c *gin.Context) {
		handler.AgentVersionDetail(c.Writer, c.Request, c.Param("id"))
	})
	v1.PATCH("/agent-versions/:id", func(c *gin.Context) {
		handler.UpdateAgentVersion(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/agent-versions/:id/validate", func(c *gin.Context) {
		handler.ValidateAgentVersion(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/agent-versions/:id/publish", func(c *gin.Context) {
		handler.PublishAgentVersion(c.Writer, c.Request, c.Param("id"))
	})
	v1.PUT("/agents/:id/recommended-version", func(c *gin.Context) {
		handler.RecommendAgentVersion(c.Writer, c.Request, c.Param("id"))
	})
	v1.GET("/skills", gin.WrapF(handler.Skills))
	v1.GET("/skill-stage-templates", gin.WrapF(handler.SkillStageTemplates))
	v1.POST("/skills/import-folder", gin.WrapF(handler.ImportProjectSkillFolder))
	v1.POST("/skills", gin.WrapF(handler.CreateProjectSkill))
	v1.PATCH("/skills/:id", func(c *gin.Context) { handler.UpdateProjectSkill(c.Writer, c.Request, c.Param("id")) })
	v1.DELETE("/skills/:id", func(c *gin.Context) { handler.DeleteProjectSkill(c.Writer, c.Request, c.Param("id")) })
	v1.POST("/skills/:id/copy", func(c *gin.Context) { handler.CopySystemSkill(c.Writer, c.Request, c.Param("id")) })
	v1.POST("/skills/:id/versions", func(c *gin.Context) { handler.CreateProjectSkillVersion(c.Writer, c.Request, c.Param("id")) })
	v1.POST("/skills/:id/import-version", func(c *gin.Context) { handler.ImportProjectSkillFolderVersion(c.Writer, c.Request, c.Param("id")) })
	v1.GET("/skill-versions/:id", func(c *gin.Context) { handler.ProjectSkillVersion(c.Writer, c.Request, c.Param("id")) })
	v1.GET("/skill-versions/:id/source-files", func(c *gin.Context) { handler.ProjectSkillSourceFiles(c.Writer, c.Request, c.Param("id")) })
	v1.GET("/skill-versions/:id/source-file", func(c *gin.Context) { handler.ProjectSkillSourceFile(c.Writer, c.Request, c.Param("id")) })
	v1.PATCH("/skill-versions/:id", func(c *gin.Context) { handler.UpdateProjectSkillVersion(c.Writer, c.Request, c.Param("id")) })
	v1.DELETE("/skill-versions/:id", func(c *gin.Context) { handler.DeleteProjectSkillVersion(c.Writer, c.Request, c.Param("id")) })
	v1.POST("/skill-versions/:id/validate", func(c *gin.Context) { handler.ValidateProjectSkillVersion(c.Writer, c.Request, c.Param("id")) })
	v1.POST("/skill-versions/:id/evaluations", func(c *gin.Context) { handler.EvaluateProjectSkillVersion(c.Writer, c.Request, c.Param("id")) })
	v1.POST("/skill-versions/:id/trials", func(c *gin.Context) { handler.TrialProjectSkillVersion(c.Writer, c.Request, c.Param("id")) })
	v1.GET("/skill-trials/:id", func(c *gin.Context) { handler.ProjectSkillTrial(c.Writer, c.Request, c.Param("id")) })
	v1.POST("/skill-versions/:id/publish", func(c *gin.Context) { handler.PublishProjectSkillVersion(c.Writer, c.Request, c.Param("id")) })
	v1.POST("/skill-versions/:id/archive", func(c *gin.Context) { handler.ArchiveProjectSkillVersion(c.Writer, c.Request, c.Param("id")) })
	v1.PUT("/skills/:id/recommended-version", func(c *gin.Context) { handler.RecommendProjectSkillVersion(c.Writer, c.Request, c.Param("id")) })
	v1.GET("/workflows", gin.WrapF(handler.Workflows))
	v1.POST("/workflows", gin.WrapF(handler.CreateWorkflowDefinition))
	v1.GET("/workflows/:id", func(c *gin.Context) {
		handler.WorkflowRegistryDetail(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/workflows/:id/copy", func(c *gin.Context) {
		handler.CopyWorkflow(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/workflows/:id/versions", func(c *gin.Context) {
		handler.CreateWorkflowVersion(c.Writer, c.Request, c.Param("id"))
	})
	v1.GET("/workflow-versions/:id", func(c *gin.Context) {
		handler.WorkflowVersionDetail(c.Writer, c.Request, c.Param("id"))
	})
	v1.PATCH("/workflow-versions/:id", func(c *gin.Context) {
		handler.UpdateWorkflowVersion(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/workflow-versions/:id/validate", func(c *gin.Context) {
		handler.ValidateWorkflowVersion(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/workflow-versions/:id/preview", func(c *gin.Context) {
		handler.PreviewWorkflowVersion(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/workflow-versions/:id/publish", func(c *gin.Context) {
		handler.PublishWorkflowVersion(c.Writer, c.Request, c.Param("id"))
	})
	v1.PUT("/workflows/:id/recommended-version", func(c *gin.Context) {
		handler.RecommendWorkflowVersion(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/workflow-executions/preflight", gin.WrapF(handler.PreflightWorkflowExecution))
	v1.GET("/workflow-executions/:id", func(c *gin.Context) {
		handler.WorkflowExecutionDetail(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/workflow-executions/:id/confirm", func(c *gin.Context) {
		handler.ConfirmWorkflowExecution(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/workflow-executions/:id/continue", func(c *gin.Context) {
		handler.ContinueWorkflowExecution(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/workflow-executions/:id/cancel", func(c *gin.Context) {
		handler.CancelWorkflowExecution(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/agent-plans", gin.WrapF(handler.CreateAgentPlan))
	v1.GET("/agent-plans/:id", func(c *gin.Context) {
		handler.AgentPlan(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/agent-plans/:id/revisions", func(c *gin.Context) {
		handler.CreateAgentPlanRevision(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/agent-plans/:id/preflight", func(c *gin.Context) {
		handler.PreflightAgentPlan(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/agent-plans/:id/confirm", func(c *gin.Context) {
		handler.ConfirmAgentPlan(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/agent-plans/:id/continue", func(c *gin.Context) {
		handler.ContinueAgentPlan(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/agent-plans/:id/cancel", func(c *gin.Context) {
		handler.CancelAgentPlan(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/artifacts", gin.WrapF(handler.CreateArtifact))
	v1.GET("/artifacts", gin.WrapF(handler.Artifacts))
	v1.GET("/artifacts/:id", func(c *gin.Context) {
		handler.Artifact(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/invocations", gin.WrapF(handler.CreateInvocation))
	v1.GET("/invocations", gin.WrapF(handler.Invocations))
	v1.GET("/invocations/:id/poll", func(c *gin.Context) {
		handler.InvocationPoll(c.Writer, c.Request, c.Param("id"))
	})
	v1.GET("/invocations/:id", func(c *gin.Context) {
		handler.Invocation(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/invocations/:id/repreflight", func(c *gin.Context) {
		handler.RepreflightInvocation(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/invocations/:id/confirm", func(c *gin.Context) {
		handler.ConfirmInvocation(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/invocations/:id/cancel", func(c *gin.Context) {
		handler.CancelInvocation(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/invocations/:id/retry", func(c *gin.Context) {
		handler.RetryInvocation(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/invocations/:id/revalidate", func(c *gin.Context) {
		handler.RevalidateInvocation(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/invocations/:id/review", func(c *gin.Context) {
		handler.ReviewInvocation(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/invocations/:id/apply", func(c *gin.Context) {
		handler.ApplyInvocation(c.Writer, c.Request, c.Param("id"))
	})
	v1.GET("/invocations/:id/events", func(c *gin.Context) {
		handler.InvocationEvents(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/agent-runs/:id/review", func(c *gin.Context) {
		handler.ReviewAgentRun(c.Writer, c.Request, c.Param("id"))
	})
	v1.GET("/workflow-runs", gin.WrapF(handler.WorkflowRuns))
	v1.POST("/workflow-runs", gin.WrapF(handler.EnsureWorkflowRun))
	v1.GET("/skill-options", gin.WrapF(handler.SkillOptions))
	v1.GET("/workflow-runs/:id/poll", func(c *gin.Context) {
		handler.WorkflowRunPoll(c.Writer, c.Request, c.Param("id"))
	})
	v1.GET("/workflow-runs/:id", func(c *gin.Context) {
		handler.WorkflowRun(c.Writer, c.Request, c.Param("id"))
	})
	v1.GET("/workflow-runs/:id/events", func(c *gin.Context) {
		handler.WorkflowEvents(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/workflow-runs/:id/stages/:stageId/start", func(c *gin.Context) {
		handler.StartWorkflowStage(c.Writer, c.Request, c.Param("id"), c.Param("stageId"))
	})
	v1.POST("/workflow-runs/:id/media-batches", func(c *gin.Context) {
		handler.CreateWorkflowMediaBatch(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/workflow-media-batches/:id/items", func(c *gin.Context) {
		handler.UploadWorkflowMedia(c.Writer, c.Request, c.Param("id"))
	})
	v1.GET("/workflow-media-batches/:id", func(c *gin.Context) {
		handler.WorkflowMediaBatch(c.Writer, c.Request, c.Param("id"))
	})
	v1.DELETE("/workflow-media-batches/:id", func(c *gin.Context) {
		handler.DeleteWorkflowMediaBatch(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/workflow-stage-runs/:id/cancel", func(c *gin.Context) {
		handler.CancelWorkflowStage(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/workflow-stage-runs/:id/retry", func(c *gin.Context) {
		handler.RetryWorkflowStage(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/workflow-stage-runs/:id/review", func(c *gin.Context) {
		handler.ReviewWorkflowStage(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/workflow-stage-runs/:id/apply", func(c *gin.Context) {
		handler.ApplyWorkflowStage(c.Writer, c.Request, c.Param("id"))
	})
	v1.GET("/workflow-stage-runs/:id/asset-slots", func(c *gin.Context) {
		handler.WorkflowAssetSlots(c.Writer, c.Request, c.Param("id"))
	})
	v1.PUT("/workflow-stage-runs/:id/asset-slots", func(c *gin.Context) {
		handler.SaveWorkflowAssetSlots(c.Writer, c.Request, c.Param("id"))
	})
	v1.GET("/workflow-worker/health", gin.WrapF(handler.WorkflowWorkerHealth))
	v1.POST("/canvas/media-cache", gin.WrapF(handler.CacheCanvasMedia))
	v1.POST("/project-cache/files", gin.WrapF(handler.UploadProjectCacheFile))
	v1.GET("/project-cache/projects", gin.WrapF(handler.ProjectCaches))
	v1.GET("/project-cache/projects/:id", func(c *gin.Context) { handler.ProjectCache(c.Writer, c.Request, c.Param("id")) })
	v1.POST("/project-cache/projects/:id/status", func(c *gin.Context) { handler.UpdateProjectCacheStatus(c.Writer, c.Request, c.Param("id")) })
	v1.POST("/project-cache/projects/:id/package/preflight", func(c *gin.Context) { handler.PreflightProjectCachePackage(c.Writer, c.Request, c.Param("id")) })
	v1.POST("/project-cache/projects/:id/package", func(c *gin.Context) { handler.DownloadProjectCachePackage(c.Writer, c.Request, c.Param("id")) })
	v1.GET("/project-cache/files/:id", func(c *gin.Context) { handler.ProjectCacheFile(c.Writer, c.Request, c.Param("id")) })
	v1.POST("/project-cache/files/:id/move", func(c *gin.Context) { handler.MoveProjectCacheFile(c.Writer, c.Request, c.Param("id")) })
	v1.DELETE("/project-cache/files/:id", func(c *gin.Context) { handler.DeleteProjectCacheFile(c.Writer, c.Request, c.Param("id")) })
	v1.DELETE("/project-cache/projects/:id", func(c *gin.Context) { handler.DeleteProjectCache(c.Writer, c.Request, c.Param("id")) })
	v1.POST("/volcengine/assets/image-review", gin.WrapF(handler.SubmitVolcengineImageAsset))
	v1.POST("/volcengine/assets/media-review", gin.WrapF(handler.SubmitVolcengineMediaAsset))
	v1.POST("/volcengine/assets/video-review", gin.WrapF(handler.SubmitVolcengineMediaAsset))
	v1.POST("/volcengine/assets/status", gin.WrapF(handler.VolcengineAssetStatus))
	v1.GET("/videos/:id", func(c *gin.Context) {
		handler.AIVideo(c.Writer, c.Request, c.Param("id"))
	})
	v1.GET("/videos/:id/content", func(c *gin.Context) {
		handler.AIVideoContent(c.Writer, c.Request, c.Param("id"))
	})
	v1.GET("/ai-tasks/:id", func(c *gin.Context) {
		handler.UserAITask(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/ai-tasks/:id/frontend-artifact", func(c *gin.Context) {
		handler.UserAITaskFrontendArtifact(c.Writer, c.Request, c.Param("id"))
	})
	v1.POST("/proxy/video-download", gin.WrapF(handler.AIProxyVideoDownload))
	v1.POST("/activity-logs", gin.WrapF(handler.UserActivityReport))
	api.GET("/prompts", middleware.OptionalAuth, gin.WrapF(handler.Prompts))
	api.GET("/assets", middleware.OptionalAuth, gin.WrapF(handler.Assets))
	api.POST("/admin/login", gin.WrapF(handler.AdminLogin))

	admin := api.Group("/admin", middleware.AdminAuth)
	admin.GET("/users", gin.WrapF(handler.AdminUsers))
	admin.GET("/users/:id", func(c *gin.Context) { handler.AdminUser(c.Writer, c.Request, c.Param("id")) })
	admin.GET("/users/:id/ai-tasks", func(c *gin.Context) { handler.AdminUserAITasks(c.Writer, c.Request, c.Param("id")) })
	admin.GET("/users/:id/credit-logs", func(c *gin.Context) { handler.AdminUserCreditLogs(c.Writer, c.Request, c.Param("id")) })
	admin.GET("/users/:id/activity-logs", func(c *gin.Context) { handler.AdminUserActivities(c.Writer, c.Request, c.Param("id")) })
	admin.GET("/users/:id/allowed-ips", func(c *gin.Context) { handler.AdminUserAllowedIPs(c.Writer, c.Request, c.Param("id")) })
	admin.POST("/users/:id/allowed-ips", func(c *gin.Context) { handler.AdminAddUserAllowedIP(c.Writer, c.Request, c.Param("id")) })
	admin.DELETE("/users/:id/allowed-ips/:ipId", func(c *gin.Context) {
		handler.AdminDeleteUserAllowedIP(c.Writer, c.Request, c.Param("id"), c.Param("ipId"))
	})
	admin.PUT("/users/:id/ip-policy", func(c *gin.Context) { handler.AdminSetUserIPPolicy(c.Writer, c.Request, c.Param("id")) })
	admin.GET("/login-approvals", gin.WrapF(handler.AdminLoginApprovals))
	admin.POST("/login-approvals/:id/decision", func(c *gin.Context) { handler.AdminDecideLoginApproval(c.Writer, c.Request, c.Param("id")) })
	admin.POST("/users", gin.WrapF(handler.AdminSaveUser))
	admin.POST("/users/:id/credits", func(c *gin.Context) {
		handler.AdminAdjustUserCredits(c.Writer, c.Request, c.Param("id"))
	})
	admin.DELETE("/users/:id", func(c *gin.Context) {
		handler.AdminDeleteUser(c.Writer, c.Request, c.Param("id"))
	})
	admin.GET("/credit-logs", gin.WrapF(handler.AdminCreditLogs))
	admin.POST("/credit-logs", gin.WrapF(handler.AdminSaveCreditLog))
	admin.DELETE("/credit-logs/:id", func(c *gin.Context) {
		handler.AdminDeleteCreditLog(c.Writer, c.Request, c.Param("id"))
	})
	admin.GET("/ai-usage-summary", gin.WrapF(handler.AdminAIUsageSummary))
	admin.GET("/ai-usage-records", gin.WrapF(handler.AdminAIUsageRecords))
	admin.GET("/ai-tasks", gin.WrapF(handler.AdminAITasks))
	admin.GET("/ai-tasks/:id", func(c *gin.Context) {
		handler.AdminAITask(c.Writer, c.Request, c.Param("id"))
	})
	admin.POST("/ai-tasks/:id/refresh", func(c *gin.Context) {
		handler.AdminRefreshAITask(c.Writer, c.Request, c.Param("id"))
	})
	admin.POST("/ai-tasks/:id/refund", func(c *gin.Context) {
		handler.AdminRefundAITask(c.Writer, c.Request, c.Param("id"))
	})
	admin.GET("/settings", gin.WrapF(handler.AdminSettings))
	admin.POST("/settings", gin.WrapF(handler.AdminSaveSettings))
	admin.POST("/settings/channel-models", gin.WrapF(handler.AdminChannelModels))
	admin.POST("/settings/channel-test", gin.WrapF(handler.AdminTestChannelModel))
	admin.GET("/prompt-categories", gin.WrapF(handler.AdminPromptCategories))
	admin.POST("/prompt-categories/sync", gin.WrapF(handler.AdminSyncPromptCategories))
	admin.GET("/prompts", gin.WrapF(handler.AdminPrompts))
	admin.POST("/prompts", gin.WrapF(handler.AdminSavePrompt))
	admin.POST("/prompts/batch-delete", gin.WrapF(handler.AdminDeletePrompts))
	admin.DELETE("/prompts/:id", func(c *gin.Context) {
		handler.AdminDeletePrompt(c.Writer, c.Request, c.Param("id"))
	})
	admin.GET("/assets", gin.WrapF(handler.AdminAssets))
	admin.GET("/asset-projects", gin.WrapF(handler.AdminAssetProjects))
	admin.POST("/asset-projects", func(c *gin.Context) {
		handler.AdminSaveAssetProject(c.Writer, c.Request, "")
	})
	admin.PATCH("/asset-projects/:id", func(c *gin.Context) {
		handler.AdminSaveAssetProject(c.Writer, c.Request, c.Param("id"))
	})
	admin.DELETE("/asset-projects/:id", func(c *gin.Context) {
		handler.AdminDeleteAssetProject(c.Writer, c.Request, c.Param("id"))
	})
	admin.GET("/asset-projects/:id/folders", func(c *gin.Context) {
		handler.AdminAssetFolders(c.Writer, c.Request, c.Param("id"))
	})
	admin.POST("/asset-projects/:id/folders", func(c *gin.Context) {
		handler.AdminSaveAssetFolder(c.Writer, c.Request, c.Param("id"), "")
	})
	admin.PATCH("/asset-projects/:id/folders/:folderId", func(c *gin.Context) {
		handler.AdminSaveAssetFolder(c.Writer, c.Request, c.Param("id"), c.Param("folderId"))
	})
	admin.DELETE("/asset-projects/:id/folders/:folderId", func(c *gin.Context) {
		handler.AdminDeleteAssetFolder(c.Writer, c.Request, c.Param("id"), c.Param("folderId"))
	})
	admin.POST("/assets", gin.WrapF(handler.AdminSaveAsset))
	admin.POST("/assets/upload", gin.WrapF(handler.AdminUploadAssetMedia))
	admin.POST("/assets/batch-update", gin.WrapF(handler.AdminBatchUpdateAssets))
	admin.POST("/assets/batch-delete", gin.WrapF(handler.AdminBatchDeleteAssets))
	admin.POST("/assets/:id/volcengine-review", func(c *gin.Context) {
		handler.AdminSubmitAssetVolcengineReview(c.Writer, c.Request, c.Param("id"))
	})
	admin.POST("/assets/:id/volcengine-review/refresh", func(c *gin.Context) {
		handler.AdminRefreshAssetVolcengineReview(c.Writer, c.Request, c.Param("id"))
	})
	admin.DELETE("/assets/:id", func(c *gin.Context) {
		handler.AdminDeleteAsset(c.Writer, c.Request, c.Param("id"))
	})

	superAdmin := api.Group("/admin", middleware.SuperAdminAuth)
	superAdmin.GET("/admins", gin.WrapF(handler.AdminAccounts))
	superAdmin.POST("/admins", gin.WrapF(handler.CreateAdminAccount))
	superAdmin.PATCH("/admins/:id", func(c *gin.Context) {
		handler.UpdateAdminAccount(c.Writer, c.Request, c.Param("id"))
	})
	superAdmin.POST("/admins/:id/role", func(c *gin.Context) {
		handler.ChangeAdminAccountRole(c.Writer, c.Request, c.Param("id"))
	})
	superAdmin.POST("/admins/:id/password", func(c *gin.Context) {
		handler.ResetAdminAccountPassword(c.Writer, c.Request, c.Param("id"))
	})
	superAdmin.DELETE("/admins/:id", func(c *gin.Context) {
		handler.DeleteAdminAccount(c.Writer, c.Request, c.Param("id"))
	})

	skillAdmin := api.Group("/v1/admin", middleware.AdminAuth)
	skillAdmin.GET("/agents", gin.WrapF(handler.AdminAgents))
	skillAdmin.POST("/agents/:id/versions", func(c *gin.Context) {
		handler.AdminCreateAgentVersion(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.GET("/agent-versions/:id", func(c *gin.Context) {
		handler.AdminAgentVersion(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.PATCH("/agent-versions/:id", func(c *gin.Context) {
		handler.AdminUpdateAgentVersion(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.POST("/agent-versions/:id/validate", func(c *gin.Context) {
		handler.AdminValidateAgentVersion(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.POST("/agent-versions/:id/publish", func(c *gin.Context) {
		handler.AdminPublishAgentVersion(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.PUT("/agents/:id/recommended-version", func(c *gin.Context) {
		handler.AdminRecommendAgentVersion(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.GET("/skills", gin.WrapF(handler.AdminSkills))
	skillAdmin.GET("/skill-stage-templates", gin.WrapF(handler.AdminSkillStageTemplates))
	skillAdmin.POST("/skills/import-folder", gin.WrapF(handler.AdminImportSkillFolder))
	skillAdmin.POST("/skills", gin.WrapF(handler.AdminCreateSkill))
	skillAdmin.PATCH("/skills/:id", func(c *gin.Context) {
		handler.AdminUpdateSkill(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.POST("/skills/:id/versions", func(c *gin.Context) {
		handler.AdminCreateSkillVersion(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.POST("/skills/:id/import-version", func(c *gin.Context) {
		handler.AdminImportSkillFolderVersion(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.GET("/skill-versions/:id", func(c *gin.Context) {
		handler.AdminSkillVersion(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.PATCH("/skill-versions/:id", func(c *gin.Context) {
		handler.AdminUpdateSkillVersion(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.GET("/skill-versions/:id/source-files", func(c *gin.Context) {
		handler.AdminSkillSourceFiles(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.GET("/skill-versions/:id/source-file", func(c *gin.Context) {
		handler.AdminSkillSourceFile(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.POST("/skill-versions/:id/validate", func(c *gin.Context) {
		handler.AdminValidateSkillVersion(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.POST("/skill-versions/:id/evaluations", func(c *gin.Context) {
		handler.AdminEvaluateSkillVersion(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.POST("/skill-versions/:id/trials", func(c *gin.Context) {
		handler.AdminTrialSkillVersion(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.GET("/skill-trials/:id", func(c *gin.Context) {
		handler.AdminSkillTrial(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.GET("/skill-evaluations/:id", func(c *gin.Context) {
		handler.AdminSkillEvaluation(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.POST("/skill-versions/:id/publish", func(c *gin.Context) {
		handler.AdminPublishSkillVersion(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.PUT("/skills/:id/recommended-version", func(c *gin.Context) {
		handler.AdminRecommendSkillVersion(c.Writer, c.Request, c.Param("id"))
	})
	skillAdmin.GET("/workflow-stage-skill-bindings/:stageKey", func(c *gin.Context) {
		handler.AdminWorkflowStageSkillBindings(c.Writer, c.Request, c.Param("stageKey"))
	})
	skillAdmin.PUT("/workflow-stage-skill-bindings/:stageKey", func(c *gin.Context) {
		handler.AdminUpdateWorkflowStageSkillBinding(c.Writer, c.Request, c.Param("stageKey"))
	})

	router.Static("/uploaded-assets", config.Cfg.PublicAssetDir)
	router.NoRoute(middleware.NotFoundJSON)

	return router
}

func uploadedAssetSecurityHeaders(c *gin.Context) {
	path := c.Request.URL.Path
	if path == "/uploaded-assets" || strings.HasPrefix(path, "/uploaded-assets/") || path == "/api/uploaded-assets" || strings.HasPrefix(path, "/api/uploaded-assets/") {
		c.Header("X-Content-Type-Options", "nosniff")
	}
	c.Next()
}
