"use client";

import { ArrowLeft, FilePlus2, FolderPlus, UploadCloud } from "lucide-react";
import { App, Breadcrumb, Button, Flex, Input, Modal, Select, Space, Typography } from "antd";
import { useEffect, useRef, useState } from "react";

import { refreshAdminAssetVolcengineReview, submitAdminAssetVolcengineReview, type AdminAsset, type AdminAssetProject } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";
import { AssetBatchOrganizer } from "./components/asset-batch-organizer";
import { AssetDetailDrawer } from "./components/asset-detail-drawer";
import { AssetFileGrid } from "./components/asset-file-grid";
import { AssetFolderTree, assetFolderPath } from "./components/asset-folder-tree";
import { AssetProjectBrowser } from "./components/asset-project-browser";
import { AssetUploadQueue } from "./components/asset-upload-queue";
import { useAdminAssetProjects } from "./use-admin-asset-projects";
import { useAdminAssetUpload } from "./use-admin-asset-upload";
import { useAdminAssets } from "./use-admin-assets";

const typeOptions = [{ label: "全部类型", value: "" }, { label: "图片", value: "image" }, { label: "视频", value: "video" }, { label: "音频", value: "audio" }, { label: "文本", value: "text" }];
export default function AdminAssetsPage() {
    const { message } = App.useApp();
    const token = useUserStore((state) => state.token);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [projectId, setProjectId] = useState("");
    const [folderId, setFolderId] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [detailAsset, setDetailAsset] = useState<AdminAsset | null>(null);
    const [uploadQueueOpen, setUploadQueueOpen] = useState(false);
    const [textOpen, setTextOpen] = useState(false);
    const [textTitle, setTextTitle] = useState("");
    const [textContent, setTextContent] = useState("");
    const [folderModalOpen, setFolderModalOpen] = useState(false);
    const [folderName, setFolderName] = useState("");
    const projects = useAdminAssetProjects(projectId);
    const assets = useAdminAssets(projectId, folderId);
    const uploads = useAdminAssetUpload();
    const project = projects.projects.find((item) => item.id === projectId);
    const path = assetFolderPath(projects.folders, folderId);

    useEffect(() => {
        setSelectedIds([]);
        setDetailAsset(null);
    }, [folderId, projectId]);

    const openProject = (item: AdminAssetProject) => {
        setProjectId(item.id);
        setFolderId("");
    };
    const uploadFiles = (files: File[]) => {
        if (!projectId || !files.length) return;
        setUploadQueueOpen(true);
        void uploads.enqueue(files, projectId, folderId);
    };
    const createFolder = async () => {
        if (!folderName.trim()) return message.warning("请输入文件夹名称");
        try {
            await projects.saveFolder({ projectId, parentId: folderId, name: folderName.trim() });
            setFolderName("");
            setFolderModalOpen(false);
            message.success("文件夹已创建");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建文件夹失败");
        }
    };
    const createText = async () => {
        if (!textTitle.trim() || !textContent.trim()) return message.warning("请填写名称和文本内容");
        try {
            await assets.saveAsset({ projectId, folderId, type: "text", title: textTitle.trim(), content: textContent, coverUrl: "", url: "", category: "", description: "", tags: [], episodeNumbers: [], allEpisodes: false });
            setTextTitle("");
            setTextContent("");
            setTextOpen(false);
            message.success("文本素材已创建");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建文本素材失败");
        }
    };
    const submitReview = async (asset: AdminAsset) => {
        const updated = await submitAdminAssetVolcengineReview(token, asset.id);
        setDetailAsset(updated);
        await assets.refresh();
    };
    const refreshReview = async (asset: AdminAsset) => {
        const updated = await refreshAdminAssetVolcengineReview(token, asset.id);
        setDetailAsset(updated);
        await assets.refresh();
    };

    if (!projectId || !project) return <AssetProjectBrowser projects={projects.projects} loading={projects.isLoading} onOpen={openProject} onSave={projects.saveProject} onDelete={projects.deleteProject} />;

    return (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 lg:p-6">
            <header className="mb-4">
                <Flex justify="space-between" align="start" gap={16} wrap>
                    <div className="min-w-0">
                        <Button type="text" size="small" icon={<ArrowLeft className="size-4" />} className="!px-0" onClick={() => { setProjectId(""); setFolderId(""); }}>返回素材项目</Button>
                        <Typography.Title level={3} ellipsis style={{ margin: "4px 0 2px" }}>{project.name}</Typography.Title>
                        <Breadcrumb items={[{ title: <button type="button" onClick={() => setFolderId("")}>根目录</button> }, ...path.map((folder) => ({ title: <button type="button" onClick={() => setFolderId(folder.id)}>{folder.name}</button> }))]} />
                    </div>
                    <Space wrap>
                        <Button icon={<FolderPlus className="size-4" />} onClick={() => setFolderModalOpen(true)}>新建文件夹</Button>
                        <Button icon={<FilePlus2 className="size-4" />} onClick={() => setTextOpen(true)}>新建文本</Button>
                        <Button type="primary" icon={<UploadCloud className="size-4" />} onClick={() => fileInputRef.current?.click()}>上传素材</Button>
                    </Space>
                </Flex>
            </header>

            <div className="mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-8">
                <Input.Search allowClear className="xl:col-span-2" value={assets.keyword} placeholder="搜索名称、描述或文本内容" onChange={(event) => assets.setKeyword(event.target.value)} />
                <Select value={assets.folderScope} options={[{ label: "当前文件夹", value: "current" }, { label: "整个项目", value: "project" }]} onChange={assets.setFolderScope} />
                <Select value={assets.type} options={typeOptions} onChange={assets.setType} />
                <Input allowClear value={assets.category} placeholder="筛选分类" onChange={(event) => assets.setCategory(event.target.value)} />
                <Select mode="multiple" allowClear maxTagCount="responsive" value={assets.tags} options={assets.availableTags.map((tag) => ({ label: tag, value: tag }))} placeholder="全部标签" onChange={assets.setTags} />
                <Input allowClear value={assets.episodeNumber} placeholder="筛选集数" onChange={(event) => assets.setEpisodeNumber(event.target.value)} />
                <Select allowClear value={assets.allEpisodes || undefined} options={[{ label: "仅全剧通用", value: "true" }, { label: "非全剧素材", value: "false" }]} placeholder="全部集数" onChange={(value) => assets.setAllEpisodes(value || "")} />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
                <AssetFolderTree project={project} folders={projects.folders} selectedId={folderId} onSelect={setFolderId} onSave={projects.saveFolder} onDelete={projects.deleteFolder} />
                <div className="min-w-0 flex-1 overflow-y-auto">
                    <AssetFileGrid assets={assets.assets} loading={assets.isLoading} selectedIds={selectedIds} page={assets.page} pageSize={assets.pageSize} total={assets.total} onPageChange={(page, pageSize) => { assets.setPage(page); if (pageSize !== assets.pageSize) assets.setPageSize(pageSize); }} onOpen={setDetailAsset} onSelectionChange={setSelectedIds} onDropFiles={uploadFiles} />
                    <AssetBatchOrganizer folders={projects.folders} selectedIds={selectedIds} onClear={() => setSelectedIds([])} onUpdate={assets.batchUpdate} onDelete={assets.batchDelete} />
                </div>
            </div>

            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={(event) => { uploadFiles(Array.from(event.target.files || [])); event.target.value = ""; }} />
            <AssetUploadQueue open={uploadQueueOpen} queue={uploads.queue} onClose={() => setUploadQueueOpen(false)} onRetry={(id) => void uploads.retry(id)} onClear={uploads.clearFinished} />
            <AssetDetailDrawer asset={detailAsset} onClose={() => setDetailAsset(null)} onSave={assets.saveAsset} onDelete={assets.deleteAsset} onSubmitReview={submitReview} onRefreshReview={refreshReview} />

            <Modal title="新建文件夹" open={folderModalOpen} okText="创建" cancelText="取消" onOk={() => void createFolder()} onCancel={() => setFolderModalOpen(false)} destroyOnHidden><Input autoFocus value={folderName} placeholder="文件夹名称" onPressEnter={() => void createFolder()} onChange={(event) => setFolderName(event.target.value)} /></Modal>
            <Modal title="新建文本素材" open={textOpen} okText="创建" cancelText="取消" onOk={() => void createText()} onCancel={() => setTextOpen(false)} destroyOnHidden>
                <Space direction="vertical" size={12} className="w-full"><Input value={textTitle} placeholder="名称" onChange={(event) => setTextTitle(event.target.value)} /><Input.TextArea value={textContent} rows={8} placeholder="文本内容" onChange={(event) => setTextContent(event.target.value)} /></Space>
            </Modal>
        </main>
    );
}
