"use client";

import { useState, useEffect } from 'react';
import { NFTContextProvider } from '@/app/contexts/NFTContext';
import ProjectDetail from './ProjectDetail';
import { dbManager, Project } from '@/utils/db';

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
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!project) {
    return <div>Project not found</div>;
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