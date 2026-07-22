package service

import (
	"net/http"
	"time"
)

const (
	AIRequestTimeout      = 5 * time.Minute
	AIImageRequestTimeout = 10 * time.Minute
	AIVideoTaskTimeout    = 5 * time.Minute
	AIVideoContentTimeout = 5 * time.Minute
)

var aiHTTPClient = &http.Client{Timeout: AIRequestTimeout}
var aiImageHTTPClient = &http.Client{Timeout: AIImageRequestTimeout}

func DoAIHTTPRequest(request *http.Request) (*http.Response, error) {
	return aiHTTPClient.Do(request)
}

func DoAIImageHTTPRequest(request *http.Request) (*http.Response, error) {
	return aiImageHTTPClient.Do(request)
}

func NewAIVideoContentHTTPClient(checkRedirect func(*http.Request, []*http.Request) error) *http.Client {
	return &http.Client{
		Timeout:       AIVideoContentTimeout,
		CheckRedirect: checkRedirect,
	}
}
