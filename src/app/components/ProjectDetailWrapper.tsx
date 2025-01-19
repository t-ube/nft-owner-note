"use client";

import { useState, useEffect } from 'react';
import { NFTContextProvider } from '@/app/contexts/NFTContext';
import ProjectDetail from './ProjectDetail';
import { dbManager, Project } from '@/utils/db';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCcw, AlertCircle } from 'lucide-react';

interface ProjectDetailWrapperProps {
  projectId: string;
}

const ProjectDetailWrapper: React.FC<ProjectDetailWrapperProps> = ({ projectId }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="flex items-center space-x-2">
            <RefreshCcw className="h-5 w-5 animate-spin" />
            <span>Loading project data...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen">
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
        <div className="flex-1 p-6 flex items-center justify-center">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Project not found</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <NFTContextProvider 
      projectId={projectId}
      issuer={project.issuer}
      taxon={project.taxon}
    >
      <ProjectDetail projectId={projectId} />
    </NFTContextProvider>
  );
};

export default ProjectDetailWrapper;