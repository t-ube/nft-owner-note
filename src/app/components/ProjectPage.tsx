"use client"

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { dbManager, Project } from '@/utils/db';
import ProjectSidebar from '@/app/components/ProjectSidebar';
import BulkProjectCreation from '@/app/components/BulkProjectCreation';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';
import IconTitle from '@/app/components/IconTitle';

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
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      <ProjectSidebar
        projects={projects}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onDeleteClick={handleDeleteClick}
        onProjectsUpdated={refreshProjects}
        lang={lang}
      />
  
      <div className="flex-1 p-8">
        <IconTitle/>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>{dict?.project.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
                {error}
              </div>
            )}
            {successMessage && (
              <div className="mb-4 p-4 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-800 text-green-700 dark:text-green-400 rounded">
                {successMessage}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-200">
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
                  className="dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-200">
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
                  className="dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-200">
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
                  className="dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-400"
                />
                <Dialog>
                  <DialogTrigger>
                    <div className="flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                      <HelpCircle className="h-4 w-4 mr-1" />
                      <span>{dict?.project.taxonHelp.trigger}</span>
                    </div>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto w-[95vw] sm:w-full absolute left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                    <DialogHeader>
                      <DialogTitle>{dict?.project.taxonHelp.title}</DialogTitle>
                      <div className="mt-4 space-y-4 px-1">
                        <div className="p-2 sm:p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <h3 className="text-sm sm:text-base font-medium mb-2">
                            {dict?.project.taxonHelp.step1.title}
                          </h3>
                          <img 
                            src="/images/help/taxon-1.png" 
                            alt="XRP Ledger Explorer" 
                            className="rounded-lg border dark:border-gray-700"
                          />
                          <p className="mt-2 text-sm">
                            {dict?.project.taxonHelp.step1.description}
                          </p>
                        </div>
                        <div className="p-2 sm:p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <h3 className="text-sm sm:text-base font-medium mb-2">
                            {dict?.project.taxonHelp.step2.title}
                          </h3>
                          <img 
                            src="/images/help/taxon-2.png" 
                            alt="Taxon ID Location" 
                            className="rounded-lg border dark:border-gray-700"
                          />
                          <p className="mt-2 text-sm">
                            {dict?.project.taxonHelp.step2.description}
                          </p>
                        </div>
                      </div>
                    </DialogHeader>
                  </DialogContent>
                </Dialog>
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                <Plus className="h-4 w-4 mr-2" />
                {isSubmitting ? dict?.project.creating : dict?.project.createButton}
              </Button>
            </form>

            <Separator className="my-4" />
            
            <BulkProjectCreation
              onProjectsCreated={refreshProjects}
              dictionary={dict}
            />
          </CardContent>
        </Card>
      </div>
  
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-gray-200">{dict?.project.deleteConfirm}</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              {dict?.project.deleteDescription.replace('{name}', projectToDelete?.name || '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-700 dark:text-gray-200">
              {dict?.project.cancel}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>{dict?.project.delete}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProjectPage;