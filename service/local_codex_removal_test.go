package service

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalCodexWorkflowRuntimeIsRemoved(t *testing.T) {
	root := filepath.Clean("..")
	for _, path := range []string{
		filepath.Join(root, "service", "agent_run_codex_executor.go"),
		filepath.Join(root, "web", "src", "app", "api", "original-workflow"),
		filepath.Join(root, "web", "src", "app", "(user)", "original-workflow", "use-original-workflow-store.ts"),
	} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("removed local Workflow path still exists: %s", path)
		}
	}

	targets := []struct {
		root       string
		extensions []string
		forbidden  []string
	}{
		{
			root:       filepath.Join(root, "service"),
			extensions: []string{".go"},
			forbidden:  []string{"AgentRunExecutorCodexCLI", "WorkflowLocalCodexEnabled", "WorkflowTextExecutor", "WorkflowCodex", `"codex-cli"`},
		},
		{
			root:       filepath.Join(root, "config"),
			extensions: []string{".go"},
			forbidden:  []string{"WorkflowLocalCodexEnabled", "WorkflowTextExecutor", "WorkflowCodex", "WORKFLOW_LOCAL_CODEX_ENABLED", "WORKFLOW_TEXT_EXECUTOR", "WORKFLOW_CODEX_"},
		},
		{
			root:       filepath.Join(root, "web", "src"),
			extensions: []string{".ts", ".tsx"},
			forbidden:  []string{`"local-runner"`, `"codex-cli"`, "codexApiBaseUrl", "codexApiKey", "codexModel", "/api/original-workflow", "useOriginalWorkflowStore"},
		},
	}
	for _, target := range targets {
		err := filepath.WalkDir(target.root, func(path string, entry os.DirEntry, err error) error {
			if err != nil || entry.IsDir() || strings.Contains(entry.Name(), ".test.") || strings.HasSuffix(entry.Name(), "_test.go") {
				return err
			}
			matched := false
			for _, extension := range target.extensions {
				matched = matched || strings.HasSuffix(entry.Name(), extension)
			}
			if !matched {
				return nil
			}
			content, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			for _, forbidden := range target.forbidden {
				if strings.Contains(string(content), forbidden) {
					t.Errorf("%s still contains %q", path, forbidden)
				}
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}

	for _, path := range []string{".env.example", "docker-compose.yml", "docker-compose.local.yml"} {
		content, err := os.ReadFile(filepath.Join(root, path))
		if err != nil {
			t.Fatal(err)
		}
		for _, forbidden := range []string{"WORKFLOW_LOCAL_CODEX_ENABLED", "WORKFLOW_TEXT_EXECUTOR", "WORKFLOW_CODEX_", "ORIGINAL_WORKFLOW_EXECUTION_MODE", "ORIGINAL_WORKFLOW_FORCE_CLOUD_WORKER"} {
			if strings.Contains(string(content), forbidden) {
				t.Errorf("%s still contains %q", path, forbidden)
			}
		}
	}
}
