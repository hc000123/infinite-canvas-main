"use client";

import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { deleteAdminAssetFolder, deleteAdminAssetProject, fetchAdminAssetFolders, fetchAdminAssetProjects, saveAdminAssetFolder, saveAdminAssetProject, type AdminAssetFolder, type AdminAssetProject } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

export function useAdminAssetProjects(projectId: string) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const projectsQuery = useQuery({ queryKey: ["admin", "asset-projects", token], queryFn: () => fetchAdminAssetProjects(token), enabled: Boolean(token), retry: false });
    const foldersQuery = useQuery({ queryKey: ["admin", "asset-folders", token, projectId], queryFn: () => fetchAdminAssetFolders(token, projectId), enabled: Boolean(token && projectId), retry: false });

    useEffect(() => {
        const error = projectsQuery.error || foldersQuery.error;
        if (error) message.error(error instanceof Error ? error.message : "读取素材项目失败");
    }, [foldersQuery.error, message, projectsQuery.error]);

    const invalidateProjects = () => queryClient.invalidateQueries({ queryKey: ["admin", "asset-projects"] });
    const invalidateFolders = () => queryClient.invalidateQueries({ queryKey: ["admin", "asset-folders", token, projectId] });
    const projectMutation = useMutation({ mutationFn: (project: Partial<AdminAssetProject>) => saveAdminAssetProject(token, project), onSuccess: invalidateProjects });
    const projectDeleteMutation = useMutation({ mutationFn: (id: string) => deleteAdminAssetProject(token, id), onSuccess: invalidateProjects });
    const folderMutation = useMutation({ mutationFn: (folder: Partial<AdminAssetFolder> & { projectId: string }) => saveAdminAssetFolder(token, folder), onSuccess: async () => { await invalidateFolders(); await invalidateProjects(); } });
    const folderDeleteMutation = useMutation({ mutationFn: (folderId: string) => deleteAdminAssetFolder(token, projectId, folderId), onSuccess: async () => { await invalidateFolders(); await invalidateProjects(); await queryClient.invalidateQueries({ queryKey: ["admin", "assets"] }); } });

    return {
        projects: projectsQuery.data || [],
        folders: foldersQuery.data || [],
        isLoading: projectsQuery.isFetching || foldersQuery.isFetching || projectMutation.isPending || projectDeleteMutation.isPending || folderMutation.isPending || folderDeleteMutation.isPending,
        saveProject: (project: Partial<AdminAssetProject>) => projectMutation.mutateAsync(project),
        deleteProject: (id: string) => projectDeleteMutation.mutateAsync(id),
        saveFolder: (folder: Partial<AdminAssetFolder> & { projectId: string }) => folderMutation.mutateAsync(folder),
        deleteFolder: (id: string) => folderDeleteMutation.mutateAsync(id),
    };
}
