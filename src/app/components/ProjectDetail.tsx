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
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

interface ProjectDetailProps {
  projectId: string;
  project: Project;
  lang: string;
  onProjectUpdate: (project: Project) => Promise<void>;
  onProjectsUpdated: () => Promise<void>;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ projectId, lang, onProjectsUpdated }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dict, setDict] = useState<Dictionary | null>(null);

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
  
  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const handleProjectUpdate = (updatedProject: Project) => {
    setProject(updatedProject);
    onProjectsUpdated();
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <RefreshCcw className="h-5 w-5 animate-spin" />
          <span>{dict?.project.detail.loading}</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{dict?.project.detail.notFound}</AlertDescription>
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
          <div className="p-3 sm:p-6">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">{project.name}</h1>
              </div>
            </div>

            <ProjectInfo lang={lang} project={project} onProjectUpdate={handleProjectUpdate} />

            <Tabs defaultValue="owners" className="space-y-4">
              <TabsList>
                <TabsTrigger value="owners">
                  <Users className="h-4 w-4 mr-2" />
                  {dict?.project.detail.ownerRank}
                </TabsTrigger>
                <TabsTrigger value="nfts">
                  <List className="h-4 w-4 mr-2" />
                  {dict?.project.detail.nftList}
                </TabsTrigger>
                <TabsTrigger value="stats">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  {dict?.project.detail.statistics}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="owners" className="space-y-4">
                <Card className="mx-[-0.75rem] sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
                  <CardHeader className="px-3 sm:px-6">
                    <CardTitle>{dict?.project.detail.ownerRank}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 sm:px-6">
                    <OwnerList 
                      lang={lang}
                      issuer={project.issuer} 
                      taxon={project.taxon}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="nfts" className="space-y-4">
                <Card className="mx-[-0.75rem] sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
                  <CardHeader className="flex flex-row items-center justify-between px-3 sm:px-6">
                    <CardTitle>{dict?.project.detail.nftList}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 sm:px-6">
                    <NFTList lang={lang} projectId={projectId}/>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="stats" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 px-2 sm:px-0">
                  <Statistics lang={lang} projectId={projectId} />
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