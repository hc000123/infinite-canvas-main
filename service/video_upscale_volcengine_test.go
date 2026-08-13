package service

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type fakeVideoUpscaleProvider struct {
	uploads, starts, polls int
	vid, runID             string
	poll                   VideoUpscalePollResult
	pollResults            []VideoUpscalePollResult
}

func (p *fakeVideoUpscaleProvider) Upload(context.Context, model.VideoUpscaleJob) (string, error) {
	p.uploads++
	return p.vid, nil
}
func (p *fakeVideoUpscaleProvider) Start(_ context.Context, job model.VideoUpscaleJob) (string, string, error) {
	p.starts++
	return p.runID, "request-1", nil
}
func (p *fakeVideoUpscaleProvider) Poll(context.Context, model.VideoUpscaleJob) (VideoUpscalePollResult, error) {
	p.polls++
	if len(p.pollResults) > 0 {
		result := p.pollResults[0]
		p.pollResults = p.pollResults[1:]
		return result, nil
	}
	return p.poll, nil
}

func TestVolcengineVideoUpscalePayloadUsesAIGCStandardTarget(t *testing.T) {
	payload := volcengineVideoUpscaleStartPayload(model.VideoUpscaleJob{VODSpaceName: "space", VODVid: "vid", Target: "2k", Scenario: "aigc", EnhanceLevel: "Standard"})
	operation := payload["Operation"].(map[string]interface{})
	task := operation["Task"].(map[string]interface{})
	enhance := task["Enhance"].(map[string]interface{})
	moe := enhance["MoeEnhance"].(map[string]interface{})
	if payload["SpaceName"] != "space" || moe["Config"] != "aigc" || moe["VideoStrategy"].(map[string]interface{})["EnhanceLevel"] != "Standard" || moe["Target"].(map[string]interface{})["Res"] != "2k" || moe["Target"].(map[string]interface{})["BitDepth"] != 8 {
		t.Fatalf("payload=%#v", payload)
	}
}

func TestProcessVideoUpscaleJobResumesDurableVidAndRunID(t *testing.T) {
	setupVideoUpscaleTest(t)
	config.Cfg.PublicAssetDir = filepath.Join(t.TempDir(), "public")
	input := filepath.Join(t.TempDir(), "input.mp4")
	if err := os.WriteFile(input, []byte("source"), 0600); err != nil {
		t.Fatal(err)
	}
	job := model.VideoUpscaleJob{ID: "resume", UserID: "user-a", VODSpaceName: "space", VODVid: "vid-existing", RunID: "run-existing", Status: model.VideoUpscaleJobStatusProcessing, InputPath: input, CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	provider := &fakeVideoUpscaleProvider{poll: VideoUpscalePollResult{Status: "succeeded", ResultURL: "https://example.com/result.mp4"}}
	if err := processVideoUpscaleJob(context.Background(), job.ID, provider, func(context.Context, string) ([]byte, string, error) { return []byte("result-video"), "video/mp4", nil }); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetVideoUpscaleJob(job.ID)
	if provider.uploads != 0 || provider.starts != 0 || provider.polls != 1 || stored.VODVid != "vid-existing" || stored.RunID != "run-existing" || stored.Status != model.VideoUpscaleJobStatusSucceeded {
		t.Fatalf("provider=%#v stored=%#v", provider, stored)
	}
}

func TestProcessVideoUpscaleJobPersistsCheckpoints(t *testing.T) {
	setupVideoUpscaleTest(t)
	config.Cfg.PublicAssetDir = filepath.Join(t.TempDir(), "public")
	input := filepath.Join(t.TempDir(), "input.mp4")
	if err := os.WriteFile(input, []byte("source"), 0600); err != nil {
		t.Fatal(err)
	}
	job := model.VideoUpscaleJob{ID: "fresh", UserID: "user-a", VODSpaceName: "space", Status: model.VideoUpscaleJobStatusQueued, InputPath: input, CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	provider := &fakeVideoUpscaleProvider{vid: "vid-new", runID: "run-new", poll: VideoUpscalePollResult{Status: "processing"}}
	if err := processVideoUpscaleJob(context.Background(), job.ID, provider, nil); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetVideoUpscaleJob(job.ID)
	if provider.uploads != 1 || provider.starts != 1 || stored.VODVid != "vid-new" || stored.RunID != "run-new" || stored.Status != model.VideoUpscaleJobStatusProcessing {
		t.Fatalf("provider=%#v stored=%#v", provider, stored)
	}
}

func TestRunVideoUpscaleJobKeepsPollingTheSameRunUntilSuccess(t *testing.T) {
	setupVideoUpscaleTest(t)
	config.Cfg.PublicAssetDir = filepath.Join(t.TempDir(), "public")
	job := model.VideoUpscaleJob{ID: "poll-loop", UserID: "user-a", VODSpaceName: "space", VODVid: "vid-existing", RunID: "run-existing", Status: model.VideoUpscaleJobStatusProcessing, CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	provider := &fakeVideoUpscaleProvider{pollResults: []VideoUpscalePollResult{{Status: "processing"}, {Status: "succeeded", ResultURL: "https://example.com/result.mp4"}}}
	if err := runVideoUpscaleJob(context.Background(), job.ID, provider, func(context.Context, string) ([]byte, string, error) { return []byte("result-video"), "video/mp4", nil }, 0); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetVideoUpscaleJob(job.ID)
	if provider.uploads != 0 || provider.starts != 0 || provider.polls != 2 || stored.Status != model.VideoUpscaleJobStatusSucceeded {
		t.Fatalf("worker must reuse Vid/RunId and poll through completion: provider=%#v stored=%#v", provider, stored)
	}
}
