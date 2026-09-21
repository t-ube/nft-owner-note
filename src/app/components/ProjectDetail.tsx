"use client";

// ProjectDetail.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { dbManager, Project } from '@/utils/db';
import ProjectHeader from '@/app/components/ProjectHeader';
import { useNFTContext } from '@/app/contexts/NFTContext';
import { 
  RefreshCcw,
  Users,
  List,
  AlertCircle,
  LayoutGrid,
  Activity,
  Sprout
} from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import NFTList from '@/app/components/NFTList';
import OwnerList from '@/app/components/OwnerList';
import OwnerNFTGroupList from '@/app/components/OwnerNFTGroupList';
import OwnerActivityList from '@/app/components/OwnerActivityList';
import OwnerPlantNetwork from '@/app/components/OwnerPlantNetwork';
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
        <div className="flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
          <div className="p-3 sm:p-6">
            <ProjectHeader lang={lang} project={project} onProjectUpdate={handleProjectUpdate} />

            <Tabs defaultValue="owners" className="space-y-4">
              <TabsList className="grid h-auto w-full grid-cols-2 sm:inline-flex sm:h-9 sm:w-auto">
                <TabsTrigger value="owners">
                  <Users className="h-4 w-4 mr-2" />
                  {dict?.project.detail.ownerRank}
                </TabsTrigger>
                <TabsTrigger value="ownerNfts">
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  {dict?.project.detail.ownerCollection.title}
                </TabsTrigger>
                <TabsTrigger value="ownerPlant">
                  <Sprout className="h-4 w-4 mr-2" />
                  {dict?.project.detail.ownerPlant.title}
                </TabsTrigger>
                <TabsTrigger value="ownerActivity">
                  <Activity className="h-4 w-4 mr-2" />
                  {dict?.project.detail.ownerActivity.title}
                </TabsTrigger>
                <TabsTrigger value="nfts">
                  <List className="h-4 w-4 mr-2" />
                  {dict?.project.detail.nftList}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="owners" className="space-y-4">
                <Card className="mx-[-0.75rem] sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
                  <CardContent className="px-2 pt-3 sm:px-6 sm:pt-6">
                    <OwnerList 
                      lang={lang}
                      issuer={project.issuer} 
                      taxon={project.taxon}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ownerNfts" className="space-y-4">
                <Card className="mx-[-0.75rem] sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
                  <CardContent className="px-2 pt-3 sm:px-6 sm:pt-6">
                    <OwnerNFTGroupList lang={lang} projectId={projectId} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ownerPlant" className="space-y-4">
                <Card className="mx-[-0.75rem] sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
                  <CardContent className="px-2 pt-3 sm:px-6 sm:pt-6">
                    <OwnerPlantNetwork
                      lang={lang}
                      issuer={project.issuer}
                      taxon={project.taxon}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ownerActivity" className="space-y-4">
                <Card className="mx-[-0.75rem] sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
                  <CardContent className="px-2 pt-3 sm:px-6 sm:pt-6">
                    <OwnerActivityList
                      lang={lang}
                      issuer={project.issuer}
                      taxon={project.taxon}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="nfts" className="space-y-4">
                <Card className="mx-[-0.75rem] sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
                  <CardContent className="px-2 pt-3 sm:px-6 sm:pt-6">
                    <NFTList lang={lang} projectId={projectId}/>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </NFTWrapper>
    </NFTContextProvider>
  );
};

export default ProjectDetail;