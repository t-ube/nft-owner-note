"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { NFTContextProvider } from '@/app/contexts/NFTContext';
import ProjectDetail from './ProjectDetail';
import { dbManager, Project } from '@/utils/db';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCcw, AlertCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ProjectSidebar from '@/app/components/ProjectSidebar';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';
import { loadCollection } from '@/app/components/useCollection';
import { pushRecentProject } from '@/utils/recentProjects';

/** XRPL のクラシックアドレスの形式か（厳密なチェックサム検証はしない）。 */
const isValidIssuer = (issuer: string) => /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(issuer);

/** taxon を 10 進の数字列にそろえる（"01" → "1"）。UInt32 の範囲外なら null。 */
const normalizeTaxon = (taxon: string): string | null => {
  if (!/^\d+$/.test(taxon)) return null;
  const value = Number(taxon);
  return value <= 0xFFFFFFFF ? String(value) : null;
};

/** 自動作成時の仮の名前。 */
const defaultCollectionName = (issuer: string, taxon: string) =>
  `${issuer.slice(0, 8)}… / ${taxon}`;

/** プロジェクトは projectId か、issuer と taxon の組のどちらかで指定する。 */
type ProjectDetailWrapperProps = { lang: string } & (
  | { projectId: string; issuer?: never; taxon?: never }
  | { projectId?: never; issuer: string; taxon: string }
);

const ProjectDetailWrapper: React.FC<ProjectDetailWrapperProps> = ({
  projectId: projectIdProp,
  issuer,
  taxon,
  lang,
}) => {
  // issuer/taxon で指定されたときは、読み込み後に projectId が決まる
  const [projectId, setProjectId] = useState<string | undefined>(projectIdProp);
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [dict, setDict] = useState<Dictionary | null>(null);
  const router = useRouter();

  const loadAllProjects = useCallback(async () => {
    try {
      const allProjects = await dbManager.getAllProjects();
      setProjects(allProjects);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  }, []);

  /** 自動作成したプロジェクトの名前を、コレクション情報の名前で置き換える。 */
  const fillCollectionName = useCallback(async (target: Project) => {
    try {
      const name = (await loadCollection(target.issuer, target.taxon))?.name?.trim();
      if (!name) return;
      // 取得中に名前が変えられていたら上書きしない
      const latest = await dbManager.getProjectByProjectId(target.projectId);
      if (!latest || latest.name !== target.name) return;
      const updated = await dbManager.updateProject({ ...latest, name });
      setProject(prev => (prev?.projectId === updated.projectId ? updated : prev));
      await loadAllProjects();
    } catch (error) {
      console.error('Failed to fetch collection name:', error);
    }
  }, [loadAllProjects]);

  // プロジェクトの読み込み処理を一元化
  const loadProject = useCallback(async () => {
    setIsLoading(true);
    try {
      let projectData: Project | undefined;
      if (projectIdProp !== undefined) {
        projectData = await dbManager.getProjectByProjectId(projectIdProp);
      } else {
        projectData = await dbManager.getProjectByIssuerAndTaxon(issuer, taxon);
        // 未登録のコレクションは自動で作る（形式が正しいときだけ）
        const normalizedTaxon = normalizeTaxon(taxon);
        if (!projectData && isValidIssuer(issuer) && normalizedTaxon !== null) {
          const { project: ensured, created } = await dbManager.getOrCreateProjectByIssuerAndTaxon(
            issuer,
            normalizedTaxon,
            defaultCollectionName(issuer, normalizedTaxon)
          );
          projectData = ensured;
          if (created) await loadAllProjects();
        }
      }
      if (projectData) {
        setProject(projectData);
        setProjectId(projectData.projectId);
        pushRecentProject(projectData.projectId); // サイドバーの「最近見た」に記録する
        // 仮の名前のままなら、裏でコレクション名を取ってきて差し替える
        if (
          projectData.isAutoCreated &&
          projectData.name === defaultCollectionName(projectData.issuer, projectData.taxon)
        ) {
          void fillCollectionName(projectData);
        }
      } else {
        setError('Project not found');
      }
    } catch (error) {
      console.error('Failed to load project data:', error);
      setError('Failed to load project data');
    } finally {
      setIsLoading(false);
    }
  }, [projectIdProp, issuer, taxon, loadAllProjects, fillCollectionName]);

  // プロジェクト更新処理を一元化
  const handleProjectUpdate = useCallback(async (updatedProject: Project) => {
    try {
      await dbManager.updateProject(updatedProject);
      
      // 現在のプロジェクトを更新
      if (updatedProject.projectId === projectId) {
        setProject(updatedProject);
      }
      
      // プロジェクトリストを更新
      await loadAllProjects();
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  }, [projectId, loadAllProjects]);

  // 初期読み込み
  useEffect(() => {
    loadProject();
    loadAllProjects();
  }, [loadProject, loadAllProjects]);

  // 自動作成の目印が外れたら、サイドバーに出すため一覧と表示中のプロジェクトを読み直す
  useEffect(() => {
    return dbManager.addProjectsChangedListener(() => {
      void loadAllProjects();
      if (projectId) {
        void dbManager.getProjectByProjectId(projectId).then(latest => {
          if (latest) setProject(latest);
        });
      }
    });
  }, [loadAllProjects, projectId]);

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const handleDeleteClick = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setProjectToDelete(project);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (projectToDelete) {
      try {
        await dbManager.deleteProject(projectToDelete.projectId);
        await loadAllProjects();
        if (projectId === projectToDelete.projectId) {
          router.push(`/${lang}`);
        }
      } catch (error) {
        console.error('Failed to delete project:', error);
      }
    }
    setIsDeleteDialogOpen(false);
    setProjectToDelete(null);
  };

  const refreshProjects = useCallback(async () => {
    await Promise.all([loadProject(), loadAllProjects()]);
  }, [loadProject, loadAllProjects]);

  // 共通のサイドバーコンポーネント
  const sidebarComponent = (
    <ProjectSidebar
      projects={projects}
      currentProjectId={projectId}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      onDeleteClick={handleDeleteClick}
      onProjectsUpdated={refreshProjects}
      lang={lang}
    />
  );

  if (isLoading) {
    return (
      <div className="flex h-screen">
        {sidebarComponent}
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="flex items-center space-x-2">
            <RefreshCcw className="h-5 w-5 animate-spin" />
            <span>{dict?.project.detail.loading}</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex h-screen">
        {sidebarComponent}
        <div className="flex-1 p-6 flex items-center justify-center">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error || dict?.project.detail.notFound}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {sidebarComponent}
      <NFTContextProvider
        projectId={project.projectId}
        issuer={project.issuer}
        taxon={project.taxon}
      >
        <ProjectDetail
          projectId={project.projectId}
          project={project}
          lang={lang} 
          onProjectUpdate={handleProjectUpdate}
          onProjectsUpdated={refreshProjects}
        />
      </NFTContextProvider>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dict?.project.deleteConfirm}</AlertDialogTitle>
            <AlertDialogDescription>
              {dict?.project.deleteDescription.replace('{name}', projectToDelete?.name || '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict?.project.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>{dict?.project.delete}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProjectDetailWrapper;