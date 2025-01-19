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

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const loadedProjects = await dbManager.getAllProjects();
      setProjects(loadedProjects);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const project = await dbManager.addProject(newProject);
      setProjects([...projects, project]);
      setNewProject({ projectId: '', name: '', issuer: '', taxon: '' });
    } catch (error) {
      console.error('Failed to add project:', error);
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
      } catch (error) {
        console.error('Failed to delete project:', error);
      }
    }
    setIsDeleteDialogOpen(false);
    setProjectToDelete(null);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <ProjectSidebar
        projects={projects}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onDeleteClick={handleDeleteClick}
      />

      {/* Main Content */}
      <div className="flex-1 p-8">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Create New Project</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Project ID
                </label>
                <Input
                  value={newProject.projectId}
                  onChange={(e) => setNewProject({
                    ...newProject,
                    projectId: e.target.value
                  })}
                  placeholder="Enter project ID"
                  required
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
                />
              </div>
              <Button type="submit" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Create Project
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
              `&quot;`{projectToDelete?.name}`&quot;` (#{projectToDelete?.projectId}).
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