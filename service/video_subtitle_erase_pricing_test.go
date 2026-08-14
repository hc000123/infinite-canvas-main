package service

import (
	"math"
	"testing"
)

func TestEstimateVideoSubtitleEraseCost(t *testing.T) {
	estimate, ok := estimateVideoSubtitleEraseCost(90)
	if !ok || estimate.BillableMinutes != 1.5 || math.Abs(estimate.CostCNY-0.6) > 1e-9 {
		t.Fatalf("estimate=%#v ok=%v", estimate, ok)
	}
	if _, ok := estimateVideoSubtitleEraseCost(0); ok {
		t.Fatal("unknown duration must not produce a cost estimate")
	}
}

func TestVideoSubtitleEraseOutputDimensions(t *testing.T) {
	for _, item := range []struct {
		width, height         int
		wantWidth, wantHeight int
		wantError             bool
	}{
		{1080, 1920, 1080, 1920, false},
		{1920, 1080, 1920, 1080, false},
		{1440, 2560, 1080, 1920, false},
		{2560, 1440, 1920, 1080, false},
		{1600, 3000, 0, 0, true},
	} {
		width, height, err := videoSubtitleEraseOutputDimensions(item.width, item.height)
		if (err != nil) != item.wantError || width != item.wantWidth || height != item.wantHeight {
			t.Fatalf("%dx%d => %dx%d err=%v", item.width, item.height, width, height, err)
		}
	}
}

func TestVideoSubtitleEraseInputFormat(t *testing.T) {
	for _, filename := range []string{"source.mp4", "source.flv", "source.ts", "source.avi", "source.mov", "source.wmv", "source.mkv"} {
		if _, _, err := videoSubtitleEraseInputFormat(filename, ""); err != nil {
			t.Fatalf("%s rejected: %v", filename, err)
		}
	}
	if _, _, err := videoSubtitleEraseInputFormat("source.webm", "video/webm"); err == nil {
		t.Fatal("undocumented webm input should be rejected")
	}
}
