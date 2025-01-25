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

interface ProjectDetailWrapperProps {
  projectId: string;
  lang: string;
}

const ProjectDetailWrapper: React.FC<ProjectDetailWrapperProps> = ({ projectId, lang }) => {
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

  useEffect(() => {
    loadAllProjects();
  }, [loadAllProjects]);

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
        setProjects(projects.filter(p => p.id !== projectToDelete.id));
        router.push(`/${lang}`);
        //await dbManager.deleteProject(projectToDelete.projectId);
        //await loadAllProjects();
      } catch (error) {
        console.error('Failed to delete project:', error);
      }
    }
    setIsDeleteDialogOpen(false);
    setProjectToDelete(null);
  };
  useEffect(() => {
    const loadProject = async () => {
      setIsLoading(true);
      try {
        const projectData = await dbManager.getProjectByProjectId(projectId);
        if (projectData) {
          setProject(projectData);
        } else {
          setError('Project not found');
        }
      } catch (error) {
        console.error('Failed to load project data:', error);
        setError('Failed to load project data');
      } finally {
        setIsLoading(false);
      }
    };

    loadProject();
  }, [projectId]);

  const refreshProjects = async () => {
    const allProjects = await dbManager.getAllProjects();
    setProjects(allProjects);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <ProjectSidebar
          projects={projects}
          currentProjectId={projectId}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onDeleteClick={handleDeleteClick}
          onProjectsUpdated={refreshProjects}
          lang={lang}
        />
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="flex items-center space-x-2">
            <RefreshCcw className="h-5 w-5 animate-spin" />
            <span>{dict?.project.detail.loading}</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen">
        <ProjectSidebar
          projects={projects}
          currentProjectId={projectId}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onDeleteClick={handleDeleteClick}
          onProjectsUpdated={refreshProjects}
          lang={lang}
        />
        <div className="flex-1 p-6 flex items-center justify-center">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-screen">
        <ProjectSidebar
          projects={projects}
          currentProjectId={projectId}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onDeleteClick={handleDeleteClick}
          onProjectsUpdated={refreshProjects}
          lang={lang}
        />
        <div className="flex-1 p-6 flex items-center justify-center">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{dict?.project.detail.notFound}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <ProjectSidebar
        projects={projects}
        currentProjectId={projectId}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onDeleteClick={handleDeleteClick}
        onProjectsUpdated={refreshProjects}
        lang={lang}
      />
      <NFTContextProvider 
        projectId={projectId}
        issuer={project.issuer}
        taxon={project.taxon}
      >
        <ProjectDetail projectId={projectId} lang={lang} onProjectsUpdated={refreshProjects}/>
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