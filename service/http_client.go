package service

import (
	"net/http"
	"time"
)

const (
	AIRequestTimeout      = 2 * time.Minute
	AIVideoContentTimeout = 5 * time.Minute
)

var aiHTTPClient = &http.Client{Timeout: AIRequestTimeout}

func DoAIHTTPRequest(request *http.Request) (*http.Response, error) {
	return aiHTTPClient.Do(request)
}

func NewAIVideoContentHTTPClient(checkRedirect func(*http.Request, []*http.Request) error) *http.Client {
	return &http.Client{
		Timeout:       AIVideoContentTimeout,
		CheckRedirect: checkRedirect,
	}
}
