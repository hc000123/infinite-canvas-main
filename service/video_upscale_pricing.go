package service

import "math"

const (
	videoUpscaleUnitPriceCNY       = 2.2
	videoUpscalePricingRuleVersion = "las-2026-08"
)

type videoUpscaleCostEstimate struct {
	ResolutionFactor float64
	FrameRateFactor  float64
	BillableMinutes  float64
	CostCNY          float64
}

func estimateVideoUpscaleCost(durationSeconds, frameRate float64, outputWidth, outputHeight int) (videoUpscaleCostEstimate, bool) {
	if durationSeconds <= 0 || frameRate <= 0 || frameRate > 120 || outputWidth <= 0 || outputHeight <= 0 || math.IsNaN(durationSeconds) || math.IsInf(durationSeconds, 0) || math.IsNaN(frameRate) || math.IsInf(frameRate, 0) {
		return videoUpscaleCostEstimate{}, false
	}
	shortEdge := outputWidth
	if outputHeight < shortEdge {
		shortEdge = outputHeight
	}
	resolutionFactor := 11.0
	switch {
	case shortEdge <= 720:
		resolutionFactor = 1
	case shortEdge <= 1080:
		resolutionFactor = 3
	case shortEdge <= 1440:
		resolutionFactor = 5
	}
	frameRateFactor := 4.0
	switch {
	case frameRate <= 30:
		frameRateFactor = 1
	case frameRate <= 60:
		frameRateFactor = 2
	case frameRate <= 90:
		frameRateFactor = 3
	}
	billableMinutes := durationSeconds / 60 * resolutionFactor * frameRateFactor
	return videoUpscaleCostEstimate{
		ResolutionFactor: resolutionFactor,
		FrameRateFactor:  frameRateFactor,
		BillableMinutes:  billableMinutes,
		CostCNY:          videoUpscaleUnitPriceCNY * billableMinutes,
	}, true
}

func videoUpscalePricingRules() VideoUpscalePricingRules {
	max720, max1080, max1440 := 720, 1080, 1440
	return VideoUpscalePricingRules{
		UnitPriceCNY:    videoUpscaleUnitPriceCNY,
		RuleVersion:     videoUpscalePricingRuleVersion,
		ResolutionTiers: []VideoUpscaleResolutionTier{{MaxShortEdge: &max720, Factor: 1}, {MaxShortEdge: &max1080, Factor: 3}, {MaxShortEdge: &max1440, Factor: 5}, {Factor: 11}},
		FrameRateTiers:  []VideoUpscaleFrameRateTier{{MaxFrameRate: 30, Factor: 1}, {MaxFrameRate: 60, Factor: 2}, {MaxFrameRate: 90, Factor: 3}, {MaxFrameRate: 120, Factor: 4}},
	}
}
