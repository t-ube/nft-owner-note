"use client"

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

interface ProjectFormData {
  name: string;
  issuer: string;
  taxon: string;
}

interface ProjectPageProps {
  lang: string;
}

const ProjectPage: React.FC<ProjectPageProps> = ({ lang }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProject, setNewProject] = useState<ProjectFormData>({
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
  const [dict, setDict] = useState<Dictionary | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

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
        setError(`A project with the same issuer and taxon already exists: ${existingProject.name}`);
        return;
      }

      const project = await dbManager.addProject(newProject);
      setProjects([...projects, project]);
      setNewProject({ name: '', issuer: '', taxon: '' });
      setSuccessMessage(dict?.project.success.created || 'Project created successfully');
      setTimeout(() => {
        router.push(`/${lang}/projects/${project.projectId}`);
      }, 2000);
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
        await dbManager.deleteProject(projectToDelete.projectId);
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
        lang={lang}
      />

      <div className="flex-1 p-8">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>{dict?.project.title}</CardTitle>
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
                  {dict?.project.name}
                </label>
                <Input
                  value={newProject.name}
                  onChange={(e) => setNewProject({
                    ...newProject,
                    name: e.target.value
                  })}
                  placeholder={dict?.project.newProject.placeholders.enterProjectName}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {dict?.project.issuerAddress}
                </label>
                <Input
                  value={newProject.issuer}
                  onChange={(e) => setNewProject({
                    ...newProject,
                    issuer: e.target.value
                  })}
                  placeholder={dict?.project.newProject.placeholders.enterIssuerAddress}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {dict?.project.taxon}
                </label>
                <Input
                  value={newProject.taxon}
                  onChange={(e) => setNewProject({
                    ...newProject,
                    taxon: e.target.value
                  })}
                  placeholder={dict?.project.newProject.placeholders.enterTaxon}
                  required
                  type="number"
                  disabled={isSubmitting}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                <Plus className="h-4 w-4 mr-2" />
                {isSubmitting ? dict?.project.creating : dict?.project.createButton}
              </Button>
            </form>
          </CardContent>
        </Card>
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
};

export default ProjectPage;