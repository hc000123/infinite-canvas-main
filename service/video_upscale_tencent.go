package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common"
	tcerrors "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common/errors"
	"github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common/profile"
	mps "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/mps/v20190612"
	cos "github.com/tencentyun/cos-go-sdk-v5"
)

type tencentMPSSubmitInput struct {
	Bucket       string
	Region       string
	InputObject  string
	OutputDir    string
	OutputObject string
	Definition   int64
	SessionID    string
}

type tencentMPSPollInput struct {
	TaskID     string
	Definition int64
	Bucket     string
}

type tencentMPSAPI interface {
	Submit(context.Context, tencentMPSSubmitInput) (taskID, requestID string, err error)
	Poll(context.Context, tencentMPSPollInput) (VideoUpscalePollResult, error)
}

type tencentCOSAPI interface {
	Upload(context.Context, string, io.Reader) error
	SignedGetURL(context.Context, string, time.Duration) (string, error)
	HeadBucket(context.Context) error
}

type tencentMPSVideoUpscaleProvider struct {
	mps tencentMPSAPI
	cos tencentCOSAPI
}

func currentTencentMPSVideoUpscaleProvider(job model.VideoUpscaleJob) (VideoUpscaleProvider, error) {
	setting, err := currentTencentMPSVideoSetting()
	if err != nil {
		return nil, err
	}
	setting.COSBucket, setting.COSRegion = job.CloudBucket, job.CloudRegion
	mpsAPI, err := newTencentCloudMPSAPI(setting)
	if err != nil {
		return nil, err
	}
	cosAPI, err := newTencentCloudCOSAPI(setting)
	if err != nil {
		return nil, err
	}
	return &tencentMPSVideoUpscaleProvider{mps: mpsAPI, cos: cosAPI}, nil
}

func (provider *tencentMPSVideoUpscaleProvider) Upload(ctx context.Context, job model.VideoUpscaleJob) (string, error) {
	file, err := os.Open(job.InputPath)
	if err != nil {
		return "", err
	}
	defer file.Close()
	key := strings.Trim(job.CloudInputPrefix, "/") + "/" + filepath.Base(job.ID) + strings.ToLower(filepath.Ext(job.InputPath))
	if err := provider.cos.Upload(ctx, key, file); err != nil {
		return "", err
	}
	return "cos://" + job.CloudBucket + "/" + key, nil
}

func (provider *tencentMPSVideoUpscaleProvider) StartUpscale(ctx context.Context, job model.VideoUpscaleJob) (string, string, error) {
	bucket, inputObject, err := parseTencentCOSURI(job.InputTOSURL)
	if err != nil {
		return "", "", err
	}
	return provider.mps.Submit(ctx, tencentMPSSubmitInput{
		Bucket: bucket, Region: job.CloudRegion, InputObject: inputObject, OutputDir: "/" + strings.Trim(job.CloudOutputPrefix, "/") + "/",
		OutputObject: job.TencentOutputObject, Definition: job.TencentTemplateID, SessionID: filepath.Base(job.ID),
	})
}

func (provider *tencentMPSVideoUpscaleProvider) PollUpscale(ctx context.Context, job model.VideoUpscaleJob) (VideoUpscalePollResult, error) {
	return provider.mps.Poll(ctx, tencentMPSPollInput{TaskID: job.RunID, Definition: job.TencentTemplateID, Bucket: job.CloudBucket})
}

func (provider *tencentMPSVideoUpscaleProvider) StartInterpolation(context.Context, model.VideoUpscaleJob) (string, string, error) {
	return "", "", errors.New("Tencent MPS video interpolation is unsupported")
}

func (provider *tencentMPSVideoUpscaleProvider) PollInterpolation(context.Context, model.VideoUpscaleJob) (VideoUpscalePollResult, error) {
	return VideoUpscalePollResult{}, errors.New("Tencent MPS video interpolation is unsupported")
}

func (provider *tencentMPSVideoUpscaleProvider) ResultDownloadURL(raw string) (string, error) {
	_, key, err := parseTencentCOSURI(raw)
	if err != nil {
		return "", err
	}
	return provider.cos.SignedGetURL(context.Background(), key, time.Hour)
}

type tencentCloudMPSAPI struct{ client *mps.Client }

func newTencentCloudMPSAPI(setting model.TencentMPSVideoSetting) (*tencentCloudMPSAPI, error) {
	clientProfile := profile.NewClientProfile()
	clientProfile.HttpProfile.Endpoint = "mps.tencentcloudapi.com"
	client, err := mps.NewClient(common.NewCredential(setting.SecretID, setting.SecretKey), setting.COSRegion, clientProfile)
	if err != nil {
		return nil, err
	}
	return &tencentCloudMPSAPI{client: client}, nil
}

func (api *tencentCloudMPSAPI) Submit(ctx context.Context, input tencentMPSSubmitInput) (string, string, error) {
	response, err := api.client.ProcessMediaWithContext(ctx, tencentMPSProcessRequest(input))
	if err != nil {
		return "", "", err
	}
	if response == nil || response.Response == nil || response.Response.TaskId == nil {
		return "", "", errors.New("Tencent MPS submit response has no task ID")
	}
	return strings.TrimSpace(*response.Response.TaskId), pointerString(response.Response.RequestId), nil
}

func tencentMPSProcessRequest(input tencentMPSSubmitInput) *mps.ProcessMediaRequest {
	definition := uint64(input.Definition)
	request := mps.NewProcessMediaRequest()
	request.InputInfo = &mps.MediaInputInfo{Type: stringPointer("COS"), CosInputInfo: &mps.CosInputInfo{Bucket: stringPointer(input.Bucket), Region: stringPointer(input.Region), Object: stringPointer("/" + strings.TrimLeft(input.InputObject, "/"))}}
	request.OutputStorage = &mps.TaskOutputStorage{Type: stringPointer("COS"), CosOutputStorage: &mps.CosOutputStorage{Bucket: stringPointer(input.Bucket), Region: stringPointer(input.Region)}}
	request.OutputDir = stringPointer(input.OutputDir)
	request.MediaProcessTask = &mps.MediaProcessTaskInput{TranscodeTaskSet: []*mps.TranscodeTaskInput{{Definition: &definition, OutputObjectPath: stringPointer(input.OutputObject)}}}
	request.SessionId = stringPointer(input.SessionID)
	return request
}

func (api *tencentCloudMPSAPI) Poll(ctx context.Context, input tencentMPSPollInput) (VideoUpscalePollResult, error) {
	request := mps.NewDescribeTaskDetailRequest()
	request.TaskId = stringPointer(input.TaskID)
	response, err := api.client.DescribeTaskDetailWithContext(ctx, request)
	if err != nil {
		return VideoUpscalePollResult{}, err
	}
	return tencentMPSPollResponse(response, input)
}

func tencentMPSPollResponse(response *mps.DescribeTaskDetailResponse, input tencentMPSPollInput) (VideoUpscalePollResult, error) {
	if response == nil || response.Response == nil {
		return VideoUpscalePollResult{}, errors.New("Tencent MPS poll response is empty")
	}
	result := VideoUpscalePollResult{Status: pointerString(response.Response.Status), RequestID: pointerString(response.Response.RequestId)}
	workflow := response.Response.WorkflowTask
	if workflow == nil {
		if strings.EqualFold(result.Status, "FINISH") {
			result.Status, result.ErrorCode = "FAIL", "result_missing"
		}
		return result, nil
	}
	if workflow.ErrCode != nil && *workflow.ErrCode != 0 {
		result.Status, result.ErrorCode = "FAIL", fmt.Sprintf("%d", *workflow.ErrCode)
		return result, nil
	}
	for _, item := range workflow.MediaProcessResultSet {
		if item == nil || item.TranscodeTask == nil || item.TranscodeTask.Input == nil || item.TranscodeTask.Input.Definition == nil || int64(*item.TranscodeTask.Input.Definition) != input.Definition {
			continue
		}
		transcode := item.TranscodeTask
		result.Status, result.ErrorCode = pointerString(transcode.Status), pointerString(transcode.ErrCodeExt)
		if strings.EqualFold(result.Status, "SUCCESS") && transcode.Output != nil && transcode.Output.Path != nil {
			result.ResultURL = "cos://" + input.Bucket + "/" + strings.TrimLeft(*transcode.Output.Path, "/")
		}
		return result, nil
	}
	if strings.EqualFold(result.Status, "FINISH") {
		result.Status, result.ErrorCode = "FAIL", "result_missing"
	}
	return result, nil
}

type tencentCloudCOSAPI struct {
	client              *cos.Client
	secretID, secretKey string
}

func newTencentCloudCOSAPI(setting model.TencentMPSVideoSetting) (*tencentCloudCOSAPI, error) {
	bucketURL, err := url.Parse(fmt.Sprintf("https://%s.cos.%s.myqcloud.com", setting.COSBucket, setting.COSRegion))
	if err != nil {
		return nil, err
	}
	client := cos.NewClient(&cos.BaseURL{BucketURL: bucketURL}, &http.Client{Transport: &cos.AuthorizationTransport{SecretID: setting.SecretID, SecretKey: setting.SecretKey}})
	return &tencentCloudCOSAPI{client: client, secretID: setting.SecretID, secretKey: setting.SecretKey}, nil
}

func (api *tencentCloudCOSAPI) Upload(ctx context.Context, key string, reader io.Reader) error {
	_, err := api.client.Object.Put(ctx, key, reader, nil)
	return err
}

func (api *tencentCloudCOSAPI) SignedGetURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	result, err := api.client.Object.GetPresignedURL(ctx, http.MethodGet, key, api.secretID, api.secretKey, expiry, nil)
	if err != nil {
		return "", err
	}
	return result.String(), nil
}

func (api *tencentCloudCOSAPI) HeadBucket(ctx context.Context) error {
	_, err := api.client.Bucket.Head(ctx)
	return err
}

func parseTencentCOSURI(raw string) (string, string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "cos" || parsed.Host == "" || strings.Trim(parsed.Path, "/") == "" {
		return "", "", errors.New("invalid Tencent COS URI")
	}
	return parsed.Host, strings.TrimLeft(parsed.Path, "/"), nil
}

func stringPointer(value string) *string { return &value }

func pointerString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func isTencentTaskNotFound(err error) bool {
	var marker interface{ TencentTaskNotFound() bool }
	if errors.As(err, &marker) && marker.TencentTaskNotFound() {
		return true
	}
	var apiErr *tcerrors.TencentCloudSDKError
	return errors.As(err, &apiErr) && strings.Contains(strings.ToLower(apiErr.Code), "notfound")
}

func checkTencentMPSConnection(ctx context.Context, mpsAPI tencentMPSAPI, cosAPI tencentCOSAPI, bucket string) error {
	if err := cosAPI.HeadBucket(ctx); err != nil {
		return err
	}
	_, err := mpsAPI.Poll(ctx, tencentMPSPollInput{TaskID: "connection-test-" + strings.ReplaceAll(newID("mps"), "_", "-"), Definition: 327004, Bucket: bucket})
	if isTencentTaskNotFound(err) {
		return nil
	}
	return err
}
