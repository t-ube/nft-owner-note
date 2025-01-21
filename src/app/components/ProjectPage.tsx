"use client"

import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { dbManager, Project } from '@/utils/db';
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

interface ProjectFormData {
  projectId: string;
  name: string;
  issuer: string;
  taxon: string;
}

const ProjectPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProject, setNewProject] = useState<ProjectFormData>({
    projectId: '',
    name: '',
    issuer: '',
    taxon: ''
  });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  // Clear messages after 5 seconds
  useEffect(() => {
    if (error || successMessage) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccessMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, successMessage]);

  const loadProjects = async () => {
    try {
      const loadedProjects = await dbManager.getAllProjects();
      setProjects(loadedProjects);
    } catch (error) {
      console.error('Failed to load projects:', error);
      setError('Failed to load projects');
    }
  };

  // 半角英数字のみを許可する正規表現
  const alphanumericRegex = /^[a-zA-Z0-9]+$/;

  const validateProjectId = (id: string): boolean => {
    return alphanumericRegex.test(id);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Project IDのバリデーション
    if (!validateProjectId(newProject.projectId)) {
      setError('Project ID must contain only alphanumeric characters (0-9, a-z, A-Z)');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      setSuccessMessage(null);
      
      // Check for duplicate issuer/taxon combination
      const existingProject = await dbManager.getProjectByIssuerAndTaxon(
        newProject.issuer,
        newProject.taxon
      );

      if (existingProject) {
        setError(`A project with the same issuer and taxon already exists: ${existingProject.name} (${existingProject.projectId})`);
        return;
      }

      const project = await dbManager.addProject(newProject);
      setProjects([...projects, project]);
      setNewProject({ projectId: '', name: '', issuer: '', taxon: '' });
      setSuccessMessage('Project created successfully');
    } catch (error) {
      console.error('Failed to add project:', error);
      setError('Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setProjectToDelete(project);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (projectToDelete) {
      try {
        await dbManager.deleteProject(projectToDelete.id);
        setProjects(projects.filter(p => p.id !== projectToDelete.id));
        setSuccessMessage('Project deleted successfully');
      } catch (error) {
        console.error('Failed to delete project:', error);
        setError('Failed to delete project');
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
    <div className="flex h-screen bg-gray-100">
      <ProjectSidebar
        projects={projects}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onDeleteClick={handleDeleteClick}
        onProjectsUpdated={refreshProjects}
      />

      <div className="flex-1 p-8">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Create New Project</CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}
            {successMessage && (
              <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
                {successMessage}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Project ID
                </label>
                <Input
                  value={newProject.projectId}
                  onChange={(e) => {
                    const value = e.target.value;
                    // 入力時に半角英数字以外を除去
                    const sanitizedValue = value.replace(/[^a-zA-Z0-9]/g, '');
                    setNewProject({
                      ...newProject,
                      projectId: sanitizedValue
                    });
                  }}
                  placeholder="Enter project ID (alphanumeric only)"
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Project Name
                </label>
                <Input
                  value={newProject.name}
                  onChange={(e) => setNewProject({
                    ...newProject,
                    name: e.target.value
                  })}
                  placeholder="Enter project name"
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Issuer Address
                </label>
                <Input
                  value={newProject.issuer}
                  onChange={(e) => setNewProject({
                    ...newProject,
                    issuer: e.target.value
                  })}
                  placeholder="Enter issuer address"
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Taxon
                </label>
                <Input
                  value={newProject.taxon}
                  onChange={(e) => setNewProject({
                    ...newProject,
                    taxon: e.target.value
                  })}
                  placeholder="Enter taxon"
                  required
                  type="number"
                  disabled={isSubmitting}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                <Plus className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Creating...' : 'Create Project'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

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
};

export default ProjectPage;