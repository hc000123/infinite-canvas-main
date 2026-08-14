package service

import (
	"math"
	"testing"
)

func TestVideoInterpolationTargetFPS(t *testing.T) {
	for _, item := range []struct {
		name      string
		sourceFPS float64
		mode      string
		want      float64
		wantErr   bool
	}{
		{name: "double fractional", sourceFPS: 24000.0 / 1001, mode: "double", want: 48000.0 / 1001},
		{name: "to25", sourceFPS: 24, mode: "to25", want: 25},
		{name: "to30", sourceFPS: 25, mode: "to30", want: 30},
		{name: "to25 source at limit", sourceFPS: 25, mode: "to25", wantErr: true},
		{name: "to30 source above limit", sourceFPS: 30.001, mode: "to30", wantErr: true},
		{name: "to60", sourceFPS: 24, mode: "to60", want: 60},
		{name: "to60 source at limit", sourceFPS: 60, mode: "to60", wantErr: true},
		{name: "unknown source", sourceFPS: 0, mode: "double", wantErr: true},
		{name: "over absolute limit", sourceFPS: 241, mode: "double", wantErr: true},
		{name: "over source multiplier", sourceFPS: 5, mode: "to60", wantErr: true},
		{name: "unsupported mode", sourceFPS: 24, mode: "keep", wantErr: true},
	} {
		t.Run(item.name, func(t *testing.T) {
			got, err := videoInterpolationTargetFPS(item.sourceFPS, item.mode)
			if (err != nil) != item.wantErr || (!item.wantErr && math.Abs(got-item.want) > 1e-9) {
				t.Fatalf("source=%g mode=%q got=%g err=%v", item.sourceFPS, item.mode, got, err)
			}
		})
	}
}

func TestVideoInterpolationPricingPixelAndModeTiers(t *testing.T) {
	for _, item := range []struct {
		name         string
		pixels       int
		mode         string
		wantBase     float64
		wantBillable float64
	}{
		{name: "720 fast boundary", pixels: 927408, mode: "fast", wantBase: 1, wantBillable: 1},
		{name: "1080 ultra-fast boundary", pixels: 2086876, mode: "ultra-fast", wantBase: 3, wantBillable: 3},
		{name: "1440 medium boundary", pixels: 3709632, mode: "medium", wantBase: 14, wantBillable: 14},
		{name: "above 1440 medium", pixels: 3709633, mode: "medium", wantBase: 24, wantBillable: 24},
	} {
		t.Run(item.name, func(t *testing.T) {
			estimate, ok := estimateVideoInterpolationCost(60, 30, 60, item.pixels, 1, item.mode)
			if !ok || estimate.ResolutionBaseFactor != item.wantBase || estimate.BillableMinutes != item.wantBillable || estimate.CostCNY != item.wantBillable*.5 {
				t.Fatalf("estimate=%#v ok=%v", estimate, ok)
			}
		})
	}
}

func TestVideoInterpolationPricingFrameRateDeltaUsesCeiling(t *testing.T) {
	for _, item := range []struct {
		delta float64
		want  float64
	}{
		{30, 1}, {30.001, 2}, {60, 2}, {60.001, 3}, {90, 3}, {90.001, 4},
	} {
		estimate, ok := estimateVideoInterpolationCost(60, 24, 24+item.delta, 1280, 720, "fast")
		if !ok || estimate.FrameRateMultiplier != item.want {
			t.Fatalf("delta=%g estimate=%#v ok=%v", item.delta, estimate, ok)
		}
	}
}

func TestVideoInterpolationPricingOfficialExample(t *testing.T) {
	estimate, ok := estimateVideoInterpolationCost(5*60, 60, 120, 1280, 720, "medium")
	if !ok || estimate.TargetFrameRate != 120 || estimate.DeltaFrameRate != 60 || estimate.ResolutionBaseFactor != 4 || estimate.FrameRateMultiplier != 2 || estimate.BillableMinutes != 40 || estimate.CostCNY != 20 {
		t.Fatalf("estimate=%#v ok=%v", estimate, ok)
	}
}

func TestVideoInterpolationPricingRejectsInvalidInputs(t *testing.T) {
	for _, item := range []struct {
		duration, source, target float64
		width, height            int
		mode                     string
	}{
		{0, 24, 48, 1920, 1080, "fast"},
		{60, 0, 48, 1920, 1080, "fast"},
		{60, 24, 24, 1920, 1080, "fast"},
		{60, 24, 145, 1920, 1080, "fast"},
		{60, 24, 48, 0, 1080, "fast"},
		{60, 24, 48, 1920, 1080, "slow"},
	} {
		if estimate, ok := estimateVideoInterpolationCost(item.duration, item.source, item.target, item.width, item.height, item.mode); ok {
			t.Fatalf("input=%#v unexpectedly estimated %#v", item, estimate)
		}
	}
}
