"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dbManager, Project } from '@/utils/db';
import ProjectSidebar from '@/app/components/ProjectSidebar';
import { 
  RefreshCcw,
  Filter,
  Users,
  BarChart3,
  List,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from "@/components/ui/alert";
import NFTList from '@/app/components/NFTList';
import OwnerList from '@/app/components/OwnerList';
import { useXrplClient } from '@/app/contexts/XrplContext';
import { useNFTContext } from '@/app/contexts/NFTContext';
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

interface ProjectDetailProps {
  projectId: string;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ projectId }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const { isReady: isXrplReady, error: xrplError } = useXrplClient();
  const { refreshData: refreshNFTs, isLoading: isNFTLoading } = useNFTContext();

  const loadAllProjects = useCallback(async () => {
    try {
      const allProjects = await dbManager.getAllProjects();
      setProjects(allProjects);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  }, []);

  const loadProjectData = useCallback(async () => {
    setIsLoading(true);
    try {
      const projectData = await dbManager.getProjectByProjectId(projectId);
      if (projectData) {
        setProject(projectData);
      }
      await loadAllProjects();
    } catch (error) {
      console.error('Failed to load project data:', error);
    }
    setIsLoading(false);
  }, [projectId, loadAllProjects]);

  useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

  const handleSync = useCallback(async () => {
    if (!isXrplReady) return;
    await refreshNFTs();
  }, [isXrplReady, refreshNFTs]);

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

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <ProjectSidebar
          projects={projects}
          currentProjectId={projectId}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onDeleteClick={handleDeleteClick}
        />
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="flex items-center space-x-2">
            <RefreshCcw className="h-5 w-5 animate-spin" />
            <span>Loading project data...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-screen">
        <ProjectSidebar
          projects={projects}
          currentProjectId={projectId}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onDeleteClick={handleDeleteClick}
        />
        <div className="flex-1 p-6 flex items-center justify-center">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Project not found
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (xrplError) {
    return (
      <div className="flex h-screen">
        <ProjectSidebar
          projects={projects}
          currentProjectId={projectId}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onDeleteClick={handleDeleteClick}
        />
        <div className="flex-1 p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to connect to XRPL: {xrplError.message}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <ProjectSidebar
        projects={projects}
        currentProjectId={projectId}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onDeleteClick={handleDeleteClick}
      />
      
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <p className="text-gray-500">#{project.projectId}</p>
            </div>
            <Button 
              onClick={handleSync}
              disabled={!isXrplReady || isNFTLoading}
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              {isNFTLoading ? "Syncing..." : "Sync Data"}
            </Button>
          </div>

          <Tabs defaultValue="nfts" className="space-y-4">
            <TabsList>
              <TabsTrigger value="nfts">
                <List className="h-4 w-4 mr-2" />
                NFT List
              </TabsTrigger>
              <TabsTrigger value="owners">
                <Users className="h-4 w-4 mr-2" />
                Owner List
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
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm">
                      <Filter className="h-4 w-4 mr-2" />
                      Filter
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <NFTList/>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="owners" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Owner List</CardTitle>
                </CardHeader>
                <CardContent>
                  <OwnerList />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="stats" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Daily Sales</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Daily Sales Chart will go here */}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>7-Day Moving Average</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Moving Average Chart will go here */}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
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

export default ProjectDetail;