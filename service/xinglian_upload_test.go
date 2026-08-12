package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestXinglianUploadBaseURLUsesOfficialOSSService(t *testing.T) {
	got, err := xinglianUploadBaseURL("https://www.vjimeng.vip/v1")
	if err != nil {
		t.Fatal(err)
	}
	if got != "https://oss.vjimeng.vip" {
		t.Fatalf("base URL = %q", got)
	}
}

func TestSignXinglianUploadRetriesTransientEOF(t *testing.T) {
	var attempts atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if attempts.Add(1) == 1 {
			conn, _, err := w.(http.Hijacker).Hijack()
			if err != nil {
				t.Fatal(err)
			}
			_ = conn.Close()
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"method":"PUT","upload_url":"https://bucket.example.com/signed","public_url":"https://files.example.com/image.png","key":"users/1/image.png","headers":{"Content-Type":"image/png"}}`))
	}))
	defer upstream.Close()

	result, err := SignXinglianUpload(context.Background(), model.ModelChannel{BaseURL: upstream.URL + "/v1", APIKey: "xinglian-key"}, XinglianUploadSignInput{
		Filename: "image.png", ContentType: "image/png", Size: 12, Type: "image",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.UploadURL != "https://bucket.example.com/signed" || attempts.Load() != 2 {
		t.Fatalf("result=%#v attempts=%d", result, attempts.Load())
	}
}
