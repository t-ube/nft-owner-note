// app/projects/[projectId]/page.tsx

"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { dbManager, Project } from '@/utils/db';

import ProjectDetailWrapper from '@/app/components/ProjectDetailWrapper';
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

export default function ProjectDetailPage({ params }: { params: { projectId: string } }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

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

  const handleDeleteClick = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setProjectToDelete(project);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (projectToDelete) {
      try {
        await dbManager.deleteProject(projectToDelete.id);
        await loadAllProjects();
      } catch (error) {
        console.error('Failed to delete project:', error);
      }
    }
    setIsDeleteDialogOpen(false);
    setProjectToDelete(null);
  };

  return (
    <div className="flex h-screen">
      <ProjectSidebar
        projects={projects}
        currentProjectId={params.projectId}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onDeleteClick={handleDeleteClick}
      />
      <ProjectDetailWrapper projectId={params.projectId} />
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the project 
              &quot;{projectToDelete?.name}&quot; (#{projectToDelete?.projectId}).
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
