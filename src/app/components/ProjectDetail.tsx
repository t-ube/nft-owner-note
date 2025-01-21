"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dbManager, Project } from '@/utils/db';
import ProjectInfo from '@/app/components/ProjectInfo';
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


interface ProjectDetailProps {
  projectId: string;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ projectId }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProjectData = useCallback(async () => {
    setIsLoading(true);
    try {
      const projectData = await dbManager.getProjectByProjectId(projectId);
      if (projectData) {
        setProject(projectData);
      }
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      console.error('Failed to load project data:', error);
    }
  }, [projectId]);

  useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

  const handleProjectUpdate = (updatedProject: Project) => {
    setProject(updatedProject);
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
          <AlertDescription>
            Project not found
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <p className="text-gray-500">#{project.projectId}</p>
          </div>
        </div>

        <ProjectInfo project={project} onProjectUpdate={handleProjectUpdate} />

        <Tabs defaultValue="nfts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="nfts">
              <List className="h-4 w-4 mr-2" />
              NFT List
            </TabsTrigger>
            <TabsTrigger value="owners">
              <Users className="h-4 w-4 mr-2" />
              Owner Rank
            </TabsTrigger>
            <TabsTrigger value="stats">
              <BarChart3 className="h-4 w-4 mr-2" />
              Statistics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="nfts" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>NFT List</CardTitle>
              </CardHeader>
              <CardContent>
                <NFTList/>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="owners" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Owner Rank</CardTitle>
              </CardHeader>
              <CardContent>
                <OwnerList />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stats" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Statistics projectId={projectId}/>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ProjectDetail;