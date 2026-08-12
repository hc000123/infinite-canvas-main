package localupscale

import (
	"math"
	"testing"
)

func TestValidateCreateJob(t *testing.T) {
	tests := []struct {
		name    string
		input   CreateJobInput
		wantErr bool
	}{
		{name: "valid request", input: CreateJobInput{ClientTaskID: "image-node-1", ModelID: ModelRealESRGANX4Plus, Scale: 2, InputWidth: 1024, InputHeight: 768}},
		{name: "empty client task ID", input: CreateJobInput{ModelID: ModelRealESRGANX4Plus, Scale: 2, InputWidth: 10, InputHeight: 10}, wantErr: true},
		{name: "unsupported model", input: CreateJobInput{ClientTaskID: "x", ModelID: "other", Scale: 2, InputWidth: 10, InputHeight: 10}, wantErr: true},
		{name: "unsupported scale", input: CreateJobInput{ClientTaskID: "x", ModelID: ModelRealESRGANX4Plus, Scale: 3, InputWidth: 10, InputHeight: 10}, wantErr: true},
		{name: "zero width", input: CreateJobInput{ClientTaskID: "x", ModelID: ModelRealESRGANX4Plus, Scale: 2, InputHeight: 10}, wantErr: true},
		{name: "zero height", input: CreateJobInput{ClientTaskID: "x", ModelID: ModelRealESRGANX4Plus, Scale: 2, InputWidth: 10}, wantErr: true},
		{name: "negative size", input: CreateJobInput{ClientTaskID: "x", ModelID: ModelRealESRGANX4Plus, Scale: 2, InputWidth: -1, InputHeight: 10}, wantErr: true},
		{name: "input pixels at limit", input: CreateJobInput{ClientTaskID: "x", ModelID: ModelRealESRGANX4Plus, Scale: 2, InputWidth: 8000, InputHeight: 5000}},
		{name: "input pixels over limit", input: CreateJobInput{ClientTaskID: "x", ModelID: ModelRealESRGANX4Plus, Scale: 2, InputWidth: 40_000_001, InputHeight: 1}, wantErr: true},
		{name: "output pixels at limit", input: CreateJobInput{ClientTaskID: "x", ModelID: ModelRealESRGANX4Plus, Scale: 4, InputWidth: 10_000, InputHeight: 1000}},
		{name: "output pixels over limit", input: CreateJobInput{ClientTaskID: "x", ModelID: ModelRealESRGANX4Plus, Scale: 4, InputWidth: 10_000_001, InputHeight: 1}, wantErr: true},
		{name: "input multiplication overflow", input: CreateJobInput{ClientTaskID: "x", ModelID: ModelRealESRGANX4Plus, Scale: 2, InputWidth: math.MaxInt, InputHeight: 2}, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateCreateJob(tt.input)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ValidateCreateJob(%#v) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
		})
	}
}
