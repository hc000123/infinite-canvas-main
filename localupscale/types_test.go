package localupscale

import "testing"

func TestValidateCreateJob(t *testing.T) {
	valid := CreateJobInput{ClientTaskID: "image-node-1", ModelID: ModelRealESRGANX4Plus, Scale: 2, InputWidth: 1024, InputHeight: 768}
	if err := ValidateCreateJob(valid); err != nil {
		t.Fatalf("valid request: %v", err)
	}
	for _, input := range []CreateJobInput{
		{ClientTaskID: "", ModelID: ModelRealESRGANX4Plus, Scale: 2, InputWidth: 10, InputHeight: 10},
		{ClientTaskID: "x", ModelID: ModelRealESRGANX4Plus, Scale: 3, InputWidth: 10, InputHeight: 10},
		{ClientTaskID: "x", ModelID: ModelRealESRGANX4Plus, Scale: 4, InputWidth: 10000, InputHeight: 10000},
	} {
		if ValidateCreateJob(input) == nil {
			t.Fatalf("expected rejection: %#v", input)
		}
	}
}
