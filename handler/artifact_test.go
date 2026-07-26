package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/service"
)

func TestArtifactCreateListDetailAreStrictLimitedAndUserScoped(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	if err := service.EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	body := `{"artifactType":"source_text","schemaVersion":"1.0.0","projectId":"project-1","episodeId":"episode-1","parentArtifactRefs":[],"payload":{"text":"第一集"},"extensions":{}}`
	create := artifactHandlerRequest(http.MethodPost, "/api/v1/artifacts", body, "user-1")
	CreateArtifact(create.recorder, create.request)
	var created struct {
		Code int                      `json:"code"`
		Data service.ArtifactEnvelope `json:"data"`
	}
	if err := json.Unmarshal(create.recorder.Body.Bytes(), &created); err != nil || created.Code != 0 || created.Data.Artifact.ID == "" {
		t.Fatalf("create=%s err=%v", create.recorder.Body.String(), err)
	}

	list := artifactHandlerRequest(http.MethodGet, "/api/v1/artifacts?project=project-1&type=source_text&page=1&pageSize=5", "", "user-1")
	Artifacts(list.recorder, list.request)
	if !strings.Contains(list.recorder.Body.String(), created.Data.Artifact.ID) {
		t.Fatalf("list=%s", list.recorder.Body.String())
	}

	foreign := artifactHandlerRequest(http.MethodGet, "/api/v1/artifacts/"+created.Data.Artifact.ID, "", "user-2")
	Artifact(foreign.recorder, foreign.request, created.Data.Artifact.ID)
	if !strings.Contains(foreign.recorder.Body.String(), `"code":1`) || strings.Contains(foreign.recorder.Body.String(), created.Data.Artifact.ContentHash) {
		t.Fatalf("foreign detail leaked data: %s", foreign.recorder.Body.String())
	}

	for _, test := range []struct {
		name string
		body string
	}{
		{"immutable id", `{"id":"forged","artifactType":"source_text","schemaVersion":"1.0.0","payload":{"text":"x"}}`},
		{"immutable hash", `{"contentHash":"forged","artifactType":"source_text","schemaVersion":"1.0.0","payload":{"text":"x"}}`},
		{"producer", `{"producerInvocationId":"forged","artifactType":"source_text","schemaVersion":"1.0.0","payload":{"text":"x"}}`},
		{"review status", `{"approvalState":"approved","artifactType":"source_text","schemaVersion":"1.0.0","payload":{"text":"x"}}`},
		{"trailing json", body + `{}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := artifactHandlerRequest(http.MethodPost, "/api/v1/artifacts", test.body, "user-1")
			CreateArtifact(request.recorder, request.request)
			if !strings.Contains(request.recorder.Body.String(), `"code":1`) {
				t.Fatalf("body=%s", request.recorder.Body.String())
			}
		})
	}

	oversized := artifactHandlerRequest(http.MethodPost, "/api/v1/artifacts", `{"artifactType":"source_text","schemaVersion":"1.0.0","payload":{"text":"`+strings.Repeat("x", (2<<20)+1)+`"}}`, "user-1")
	CreateArtifact(oversized.recorder, oversized.request)
	if !strings.Contains(oversized.recorder.Body.String(), `"code":1`) {
		t.Fatalf("oversized=%s", oversized.recorder.Body.String())
	}
}

func TestArtifactApprovedFilterIncludesPreservedAuthoritativeOutput(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	if err := service.EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	producer := "invocation-preserved"
	envelope, err := service.CreateArtifact("user-1", service.CreateArtifactInput{
		ArtifactType: "source_text", SchemaVersion: "1.0.0", ProjectID: "project-1", EpisodeID: "episode-1",
		Payload: json.RawMessage(`{"text":"preserved"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	artifact := envelope.Artifact
	artifact.ProducerInvocationID, artifact.ProducerAttempt = &producer, 1
	if err := db.Model(&model.Artifact{}).Where("id = ?", artifact.ID).Updates(map[string]any{"producer_invocation_id": producer, "producer_attempt": 1}).Error; err != nil {
		t.Fatal(err)
	}
	run := model.InvocationRun{
		ID: producer, UserID: "user-1", Source: "direct", ProjectID: "project-1", EpisodeID: "episode-1",
		Status: model.InvocationStatusApproved, LatestRevision: 1, LatestAttempt: 2, ReviewedAttempt: 2,
		ReviewedArtifactSetHash: "set-hash", CreatedAt: artifact.CreatedAt, UpdatedAt: artifact.CreatedAt,
	}
	ref := model.InvocationArtifactRef{
		ID: "ref-preserved", UserID: "user-1", InvocationID: producer, Direction: "output", BindingName: "script",
		ArtifactID: artifact.ID, ArtifactHash: artifact.ContentHash, ArtifactType: artifact.ArtifactType,
		SchemaVersion: artifact.SchemaVersion, SchemaContentHash: artifact.SchemaContentHash,
		Revision: 1, Attempt: 2, Ordinal: 0, CreatedAt: artifact.CreatedAt,
	}
	review := model.InvocationReview{
		ID: "review-preserved", UserID: "user-1", InvocationID: producer, Decision: "approved",
		ArtifactSetHash: run.ReviewedArtifactSetHash, ActorID: "user-1", Attempt: 2, CreatedAt: artifact.CreatedAt,
	}
	if err := db.Create(&run).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&ref).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&review).Error; err != nil {
		t.Fatal(err)
	}

	request := artifactHandlerRequest(http.MethodGet, "/api/v1/artifacts?approvalState=approved", "", "user-1")
	Artifacts(request.recorder, request.request)
	if !strings.Contains(request.recorder.Body.String(), artifact.ID) {
		t.Fatalf("preserved approved output missing: %s", request.recorder.Body.String())
	}
}

type artifactHandlerExchange struct {
	request  *http.Request
	recorder *httptest.ResponseRecorder
}

func artifactHandlerRequest(method, target, body, userID string) artifactHandlerExchange {
	request := httptest.NewRequest(method, target, bytes.NewBufferString(body))
	if userID != "" {
		request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: userID, Role: model.UserRoleUser}))
	}
	return artifactHandlerExchange{request: request, recorder: httptest.NewRecorder()}
}
