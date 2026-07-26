package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/router"
	"github.com/basketikun/infinite-canvas/service"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	if err := config.Load(); err != nil {
		return err
	}
	if err := service.EnsureDefaultAdmin(); err != nil {
		return err
	}
	if err := service.EnsureSkillSeeds(); err != nil {
		return err
	}
	if err := service.EnsureAgentSeeds(); err != nil {
		return err
	}
	if err := service.EnsureCoreArtifactSchemas(); err != nil {
		return err
	}
	service.StartPromptSyncScheduler()
	signalContext, stopSignals := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stopSignals()
	rootContext, cancel := context.WithCancel(signalContext)
	defer cancel()

	var workerGroup sync.WaitGroup
	service.SetWorkflowWorkerEnabled(config.Cfg.WorkflowWorkerEnabled)
	defer service.SetWorkflowWorkerEnabled(false)
	if config.Cfg.WorkflowWorkerEnabled {
		executor, err := service.NewAgentRunExecutorFromConfig()
		if err != nil {
			return err
		}
		worker := service.NewAgentRunWorker(service.AgentRunWorkerOptions{
			ID:              "embedded-workflow-worker",
			PollInterval:    time.Duration(config.Cfg.WorkflowWorkerPollMS) * time.Millisecond,
			LeaseDuration:   time.Duration(config.Cfg.WorkflowWorkerLeaseSeconds) * time.Second,
			MaxConcurrency:  config.Cfg.WorkflowWorkerConcurrency,
			UserConcurrency: config.Cfg.WorkflowWorkerUserConcurrency,
			Executor:        executor,
		})
		workerGroup.Add(1)
		go func() {
			defer workerGroup.Done()
			worker.Run(rootContext)
		}()
	}

	server := &http.Server{Addr: ":" + config.Cfg.Port, Handler: router.New(), ReadHeaderTimeout: 10 * time.Second}
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.ListenAndServe()
	}()
	select {
	case <-signalContext.Done():
	case err := <-serverErrors:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			cancel()
			workerGroup.Wait()
			return err
		}
	}

	cancel()
	shutdownContext, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()
	shutdownError := server.Shutdown(shutdownContext)
	workerGroup.Wait()
	return shutdownError
}
