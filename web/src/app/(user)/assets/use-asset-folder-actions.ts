"use client";

import { useEffect, useState } from "react";

import type { AssetFolder } from "@/stores/use-asset-store";
import type { CreativeProject } from "../projects/creative-projects";

type Props = {
    addFolder: (name: string) => string;
    creativeProjects: CreativeProject[];
    ensureProjectFolder: (projectId: string, projectTitle: string) => string;
    message: {
        error: (content: string) => void;
        success: (content: string) => void;
    };
    removeFolder: (id: string) => void;
    setFolderFilter: (value: string | "all" | "root") => void;
    updateFolder: (id: string, name: string) => void;
};

export function useAssetFolderActions({ addFolder, creativeProjects, ensureProjectFolder, message, removeFolder, setFolderFilter, updateFolder }: Props) {
    const [folderDialogOpen, setFolderDialogOpen] = useState(false);
    const [editingFolder, setEditingFolder] = useState<AssetFolder | null>(null);
    const [folderName, setFolderName] = useState("");

    useEffect(() => {
        creativeProjects.forEach((project) => ensureProjectFolder(project.id, project.title || "未命名项目"));
    }, [creativeProjects, ensureProjectFolder]);

    const openCreateFolder = () => {
        setEditingFolder(null);
        setFolderName("");
        setFolderDialogOpen(true);
    };

    const openEditFolder = (folder: AssetFolder) => {
        setEditingFolder(folder);
        setFolderName(folder.name);
        setFolderDialogOpen(true);
    };

    const saveFolder = () => {
        const name = folderName.trim();
        if (!name) {
            message.error("请输入文件夹名称");
            return;
        }
        if (editingFolder) {
            updateFolder(editingFolder.id, name);
            message.success("文件夹已更新");
        } else {
            const id = addFolder(name);
            setFolderFilter(id);
            message.success("文件夹已创建");
        }
        setFolderDialogOpen(false);
    };

    const deleteFolder = (folder: AssetFolder) => {
        removeFolder(folder.id);
        setFolderFilter("all");
        message.success("文件夹已删除，素材已移到未分组");
    };

    return {
        editingFolder,
        folderDialogOpen,
        folderName,
        deleteFolder,
        openCreateFolder,
        openEditFolder,
        saveFolder,
        setFolderDialogOpen,
        setFolderName,
    };
}
