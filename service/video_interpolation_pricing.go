package service

import (
	"errors"
	"math"
	"strings"
)

const (
	videoInterpolationUnitPriceCNY       = 0.5
	videoInterpolationPricingRuleVersion = "las-interpolation-2026-08"
	videoInterpolationMaxTargetFPS       = 480.0
	videoInterpolationMaxMultiplier      = 6.0
)

type videoInterpolationCostEstimate struct {
	TargetFrameRate      float64
	DeltaFrameRate       float64
	ResolutionBaseFactor float64
	FrameRateMultiplier  float64
	BillableMinutes      float64
	CostCNY              float64
}

func videoInterpolationTargetFPS(sourceFPS float64, mode string) (float64, error) {
	if !finitePositive(sourceFPS) {
		return 0, errors.New("source frame rate is unavailable")
	}
	var targetFPS float64
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "to25":
		targetFPS = 25
	case "to30":
		targetFPS = 30
	case "double":
		targetFPS = sourceFPS * 2
	case "to60":
		if sourceFPS >= 60 {
			return 0, errors.New("source frame rate already reaches 60 fps")
		}
		targetFPS = 60
	default:
		return 0, errors.New("unsupported interpolation target mode")
	}
	if targetFPS <= sourceFPS || targetFPS > videoInterpolationMaxTargetFPS || targetFPS > sourceFPS*videoInterpolationMaxMultiplier {
		return 0, errors.New("interpolation target frame rate is out of range")
	}
	return targetFPS, nil
}

func estimateVideoInterpolationCost(duration, sourceFPS, targetFPS float64, width, height int, mode string) (videoInterpolationCostEstimate, bool) {
	if !finitePositive(duration) || !finitePositive(sourceFPS) || !finitePositive(targetFPS) || width <= 0 || height <= 0 || targetFPS <= sourceFPS || targetFPS > videoInterpolationMaxTargetFPS || targetFPS > sourceFPS*videoInterpolationMaxMultiplier {
		return videoInterpolationCostEstimate{}, false
	}
	medium := false
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "ultra-fast", "fast":
	case "medium":
		medium = true
	default:
		return videoInterpolationCostEstimate{}, false
	}
	pixels := int64(width) * int64(height)
	baseFactor := 10.0
	if medium {
		baseFactor = 24
	}
	switch {
	case pixels <= 927408:
		baseFactor = 1
		if medium {
			baseFactor = 4
		}
	case pixels <= 2086876:
		baseFactor = 3
		if medium {
			baseFactor = 8
		}
	case pixels <= 3709632:
		baseFactor = 4
		if medium {
			baseFactor = 14
		}
	}
	delta := targetFPS - sourceFPS
	frameRateMultiplier := math.Ceil(delta / 30)
	billableMinutes := duration / 60 * baseFactor * frameRateMultiplier
	return videoInterpolationCostEstimate{
		TargetFrameRate: targetFPS, DeltaFrameRate: delta, ResolutionBaseFactor: baseFactor, FrameRateMultiplier: frameRateMultiplier,
		BillableMinutes: billableMinutes, CostCNY: videoInterpolationUnitPriceCNY * billableMinutes,
	}, true
}

func finitePositive(value float64) bool {
	return value > 0 && !math.IsNaN(value) && !math.IsInf(value, 0)
}
