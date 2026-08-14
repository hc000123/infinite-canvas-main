package service

const (
	videoSubtitleEraseUnitPriceCNY       = 0.4
	videoSubtitleErasePricingRuleVersion = "las-subtitle-erase-2026-08"
)

type videoSubtitleEraseCostEstimate struct {
	BillableMinutes float64
	CostCNY         float64
}

func estimateVideoSubtitleEraseCost(durationSeconds float64) (videoSubtitleEraseCostEstimate, bool) {
	if durationSeconds <= 0 {
		return videoSubtitleEraseCostEstimate{}, false
	}
	minutes := durationSeconds / 60
	return videoSubtitleEraseCostEstimate{BillableMinutes: minutes, CostCNY: minutes * videoSubtitleEraseUnitPriceCNY}, true
}
