package service

import (
	"math"
	"testing"
)

func TestVideoUpscalePricingResolutionTiers(t *testing.T) {
	for _, item := range []struct {
		shortEdge int
		want      float64
	}{
		{720, 1},
		{721, 3},
		{1080, 3},
		{1081, 5},
		{1440, 5},
		{1441, 11},
	} {
		estimate, ok := estimateVideoUpscaleCost(60, 30, item.shortEdge*2, item.shortEdge)
		if !ok || estimate.ResolutionFactor != item.want {
			t.Fatalf("short edge %d: estimate=%#v ok=%v", item.shortEdge, estimate, ok)
		}
	}
}

func TestVideoUpscalePricingFrameRateTiers(t *testing.T) {
	for _, item := range []struct {
		frameRate float64
		want      float64
	}{
		{30, 1},
		{30.001, 2},
		{60, 2},
		{60.001, 3},
		{90, 3},
		{90.001, 4},
		{120, 4},
	} {
		estimate, ok := estimateVideoUpscaleCost(60, item.frameRate, 1280, 720)
		if !ok || estimate.FrameRateFactor != item.want {
			t.Fatalf("frame rate %g: estimate=%#v ok=%v", item.frameRate, estimate, ok)
		}
	}
}

func TestVideoUpscalePricingOfficialExampleAndDecimalDuration(t *testing.T) {
	for _, item := range []struct {
		duration float64
		wantCost float64
	}{
		{10, 1.1},
		{6.5, 0.715},
	} {
		estimate, ok := estimateVideoUpscaleCost(item.duration, 24, 1920, 1080)
		if !ok || estimate.ResolutionFactor != 3 || estimate.FrameRateFactor != 1 || math.Abs(estimate.CostCNY-item.wantCost) > 1e-9 {
			t.Fatalf("duration %g: estimate=%#v ok=%v", item.duration, estimate, ok)
		}
	}
}

func TestVideoUpscalePricingRejectsUnknownInputs(t *testing.T) {
	for _, item := range []struct {
		duration  float64
		frameRate float64
		width     int
		height    int
	}{
		{0, 24, 1920, 1080},
		{-1, 24, 1920, 1080},
		{10, 0, 1920, 1080},
		{10, -1, 1920, 1080},
		{10, 120.001, 1920, 1080},
		{10, 24, 0, 1080},
	} {
		if estimate, ok := estimateVideoUpscaleCost(item.duration, item.frameRate, item.width, item.height); ok {
			t.Fatalf("input=%#v unexpectedly estimated %#v", item, estimate)
		}
	}
}
