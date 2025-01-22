"use client";
// ProjectDetail.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dbManager, Project } from '@/utils/db';
import ProjectInfo from '@/app/components/ProjectInfo';
import { useNFTContext } from '@/app/contexts/NFTContext';
import { 
  RefreshCcw,
  Users,
  BarChart3,
  List,
  AlertCircle
} from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import NFTList from '@/app/components/NFTList';
import OwnerList from '@/app/components/OwnerList';
import Statistics from '@/app/components/Statistics';
import { NFTContextProvider } from '@/app/contexts/NFTContext';

interface ProjectDetailProps {
  projectId: string;
  onProjectsUpdated: () => void;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ projectId, onProjectsUpdated }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProjectData = useCallback(async () => {
    setIsLoading(true);
    try {
      const projectData = await dbManager.getProjectByProjectId(projectId);
      if (projectData) {
        setProject(projectData);
      }
    } catch (error) {
      console.error('Failed to load project data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

  const handleProjectUpdate = (updatedProject: Project) => {
    setProject(updatedProject);
    onProjectsUpdated();
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <RefreshCcw className="h-5 w-5 animate-spin" />
          <span>Loading project data...</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Project not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  // NFTListから自動ロード機能を移動
  const NFTWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { hasMore, isLoading, loadMore } = useNFTContext();

    useEffect(() => {
      const autoLoad = async () => {
        if (hasMore && !isLoading) {
          await loadMore();
        }
      };
      autoLoad();
    }, [hasMore, isLoading, loadMore]);

    return <>{children}</>;
  };

  return (
    <NFTContextProvider 
      projectId={projectId}
      issuer={project.issuer}
      taxon={project.taxon}
    >
      <NFTWrapper>
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <p className="text-gray-500">#{project.projectId}</p>
            </div>
          </div>

          <ProjectInfo project={project} onProjectUpdate={handleProjectUpdate} />

          <Tabs defaultValue="owners" className="space-y-4">
            <TabsList>
              <TabsTrigger value="owners">
                <Users className="h-4 w-4 mr-2" />
                Owner Rank
              </TabsTrigger>
              <TabsTrigger value="nfts">
                <List className="h-4 w-4 mr-2" />
                NFT List
              </TabsTrigger>
              <TabsTrigger value="stats">
                <BarChart3 className="h-4 w-4 mr-2" />
                Statistics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="owners" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Owner Rank</CardTitle>
                </CardHeader>
                <CardContent>
                  <OwnerList 
                    issuer={project.issuer} 
                    taxon={project.taxon}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="nfts" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>NFT List</CardTitle>
                </CardHeader>
                <CardContent>
                  <NFTList projectId={projectId}/>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="stats" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Statistics projectId={projectId} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
          </NFTWrapper>
    </NFTContextProvider>
  );
};

export default ProjectDetail;