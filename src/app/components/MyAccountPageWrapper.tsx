"use client"

import React, { useState, useEffect, useCallback } from 'react';
import MyAccountPage from '@/app/components/MyAccountPage';
import ProjectSidebar from '@/app/components/ProjectSidebar';
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
import { dbManager, Project } from '@/utils/db';
import { useSyncSession } from '@/app/contexts/SyncSessionContext';
import { getDictionary } from '@/i18n/get-dictionary';
import type { Dictionary } from '@/i18n/dictionaries/index';

interface MyAccountPageWrapperProps {
  lang: string;
}

export default function MyAccountPageWrapper({ lang }: MyAccountPageWrapperProps) {
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const { syncCompleteCount } = useSyncSession();

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
  }, [loadAllProjects, syncCompleteCount]);

  useEffect(() => {
    const d = getDictionary(lang as 'en' | 'ja') as unknown as Dictionary;
    setDict(d);
  }, [lang]);

  const handleDeleteClick = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setProjectToDelete(project);
    setIsDeleteDialogOpen(true);
  };

  const handleProjectUpdate = useCallback(async (updatedProject: Project) => {
    try {
      const db = await dbManager.initDB();
      const transaction = db.transaction('projects', 'readwrite');
      const store = transaction.objectStore('projects');
      store.put(updatedProject);
      await loadAllProjects();
    } catch (error) {
      console.error('Failed to update project:', error);
      throw error;
    }
  }, [loadAllProjects]);

  const handleDeleteConfirm = async () => {
    if (projectToDelete) {
      try {
        await dbManager.deleteProject(projectToDelete.projectId);
        await loadAllProjects();
      } catch (error) {
        console.error('Failed to delete project:', error);
      }
    }
    setIsDeleteDialogOpen(false);
    setProjectToDelete(null);
  };

  const refreshProjects = async () => {
    const allProjects = await dbManager.getAllProjects();
    setProjects(allProjects);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <ProjectSidebar
        projects={projects}
        currentProjectId={""}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onDeleteClick={handleDeleteClick}
        onProjectsUpdated={refreshProjects}
        onProjectUpdate={handleProjectUpdate}
        lang={lang}
      />
      <div className="flex-1 overflow-auto">
        <MyAccountPage lang={lang} />
      </div>
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
}
