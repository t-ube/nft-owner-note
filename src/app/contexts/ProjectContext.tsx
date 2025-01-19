import React, { createContext, useContext, useState, useCallback } from 'react';
import { Project, dbManager } from '@/utils/db';

interface ProjectContextType {
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const useProjectContext = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
};

interface ProjectProviderProps {
  children: React.ReactNode;
  initialProjects: Project[];
}

export const ProjectProvider: React.FC<ProjectProviderProps> = ({ children, initialProjects }) => {
  const [projects, setProjects] = useState<Project[]>(initialProjects);

  const refreshProjects = useCallback(async () => {
    try {
      const loadedProjects = await dbManager.getAllProjects();
      setProjects(loadedProjects);
    } catch (error) {
      console.error('Failed to refresh projects:', error);
    }
  }, []);

  return (
    <ProjectContext.Provider value={{ projects, setProjects, refreshProjects }}>
      {children}
    </ProjectContext.Provider>
  );
};