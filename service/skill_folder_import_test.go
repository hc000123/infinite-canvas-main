package service

import (
	"archive/zip"
	"bytes"
	"strings"
	"testing"
)

func TestParseSkillFolderPreservesNestedFilesAndFrontmatter(t *testing.T) {
	files := []SkillFolderFile{
		{Path: "Seedance/rules/preserve.md", Data: []byte("preserve dialogue")},
		{Path: "Seedance/assets/reference.png", Data: []byte{0x89, 'P', 'N', 'G', 0, 1}},
		{Path: "Seedance/SKILL.md", Data: []byte("---\nname: Seedance 剧本优化\ndescription: 保留剧情\nversion: 1.2.0\n---\n# Rules")},
		{Path: "Seedance/.DS_Store", Data: []byte("trash")},
	}
	snapshot, err := ParseSkillFolder("Seedance", files)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Metadata.Name != "Seedance 剧本优化" || snapshot.Metadata.Description != "保留剧情" || snapshot.Metadata.Version != "1.2.0" {
		t.Fatalf("metadata=%+v", snapshot.Metadata)
	}
	if snapshot.TextFiles["rules/preserve.md"] != "preserve dialogue" || snapshot.TextFiles["SKILL.md"] == "" {
		t.Fatalf("textFiles=%+v", snapshot.TextFiles)
	}
	if len(snapshot.FileIndex) != 3 || snapshot.SourceHash == "" || len(snapshot.Archive) == 0 {
		t.Fatalf("snapshot=%+v", snapshot)
	}
	reader, err := zip.NewReader(bytes.NewReader(snapshot.Archive), int64(len(snapshot.Archive)))
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"SKILL.md", "assets/reference.png", "rules/preserve.md"}
	for index, file := range reader.File {
		if file.Name != want[index] || !file.Modified.Equal(skillFolderArchiveTime) {
			t.Fatalf("file=%s modified=%v", file.Name, file.Modified)
		}
	}
}

func TestParseSkillFolderFrontmatterMatchesBrowserDialect(t *testing.T) {
	for _, test := range []struct {
		name    string
		content string
	}{
		{name: "crlf", content: "---\r\nname: CRLF Skill\r\ndescription: Windows\r\nversion: 2.0.0\r\n---\r\n# Rules"},
		{name: "spaced delimiters and yaml terminator", content: "---  \nname: Dot Skill\ndescription: End marker\nversion: 3.0.0\n... \n# Rules"},
	} {
		t.Run(test.name, func(t *testing.T) {
			snapshot, err := ParseSkillFolder("fallback", []SkillFolderFile{{Path: "SKILL.md", Data: []byte(test.content)}})
			if err != nil {
				t.Fatal(err)
			}
			if snapshot.Metadata.Name == "fallback" || snapshot.Metadata.Description == "" || snapshot.Metadata.Version == "" {
				t.Fatalf("metadata=%+v", snapshot.Metadata)
			}
		})
	}
	for _, content := range []string{"---\r\nname: missing close", "---\nname: [broken\n---\n# Rules"} {
		if _, err := ParseSkillFolder("fallback", []SkillFolderFile{{Path: "SKILL.md", Data: []byte(content)}}); err == nil || !strings.Contains(err.Error(), "frontmatter") {
			t.Fatalf("malformed frontmatter err=%v content=%q", err, content)
		}
	}
}

func TestParseSkillFolderHashDoesNotDependOnUploadOrder(t *testing.T) {
	first, err := ParseSkillFolder("one", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# A")}, {Path: "rules/a.md", Data: []byte("A")}})
	if err != nil {
		t.Fatal(err)
	}
	second, err := ParseSkillFolder("two", []SkillFolderFile{{Path: "rules/a.md", Data: []byte("A")}, {Path: "SKILL.md", Data: []byte("# A")}})
	if err != nil {
		t.Fatal(err)
	}
	if first.SourceHash != second.SourceHash || !bytes.Equal(first.Archive, second.Archive) {
		t.Fatalf("first=%s second=%s", first.SourceHash, second.SourceHash)
	}
}

func TestParseSkillFolderRejectsUnsafeOrInvalidFolders(t *testing.T) {
	tests := []struct {
		name  string
		files []SkillFolderFile
		want  string
	}{
		{"missing skill", []SkillFolderFile{{Path: "rules/a.md", Data: []byte("A")}}, "SKILL.md"},
		{"traversal", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("A")}, {Path: "../secret", Data: []byte("x")}}, "路径"},
		{"absolute", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("A")}, {Path: "/secret", Data: []byte("x")}}, "路径"},
		{"duplicate", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("A")}, {Path: "SKILL.md", Data: []byte("B")}}, "重复"},
		{"invalid utf8 skill", []SkillFolderFile{{Path: "SKILL.md", Data: []byte{0xff, 0xfe}}}, "UTF-8"},
		{"oversized", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("A")}, {Path: "large.bin", Data: bytes.Repeat([]byte("x"), skillFolderMaxFileBytes+1)}}, "过大"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := ParseSkillFolder("folder", test.files)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("err=%v want=%s", err, test.want)
			}
		})
	}
}
