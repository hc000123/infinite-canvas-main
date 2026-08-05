export type SkillFolderImportFields = {
    ownerType: "system" | "project";
    stageKey: string;
    projectId?: string;
    name?: string;
    summary?: string;
    version?: string;
};

export function skillFolderLayout(files: File[]) {
    const paths = files.map((file) => file.webkitRelativePath || file.name);
    const folderName = paths[0]?.includes("/") ? paths[0].split("/")[0] : "";
    const relativePaths = paths.map((path) => folderName && path.startsWith(`${folderName}/`) ? path.slice(folderName.length + 1) : path);
    return { paths, relativePaths, folderName };
}

export function buildSkillFolderFormData(files: File[], fields: SkillFolderImportFields) {
    if (!files.length) throw new Error("请选择完整 Skill 文件夹");
    const { paths, relativePaths, folderName } = skillFolderLayout(files);
    if (!relativePaths.includes("SKILL.md")) throw new Error("文件夹根目录必须包含 SKILL.md");
    const form = new FormData();
    form.set("folderName", folderName || "Skill");
    for (const [key, value] of Object.entries(fields)) if (value !== undefined) form.set(key, value);
    files.forEach((file, index) => {
        form.append("paths", paths[index]);
        form.append("files", file, file.name);
    });
    return form;
}
